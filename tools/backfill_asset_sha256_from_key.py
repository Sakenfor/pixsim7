#!/usr/bin/env python3
"""One-shot backfill: repair ``assets.sha256`` values that don't match the
stored content.

Why:
- Some assets carry a ``sha256`` that doesn't match their actual stored bytes —
  an empty-input hash, a pre-transcode *source* hash, or a stale/legacy value.
- This is harmless for serving, but it broke ``verify_hash`` relocation/restore
  (now fixed to compare archive-vs-local rather than vs ``asset.sha256``) and can
  mislead dedup / duplicate-detection that keys on ``sha256``.

What it does:
- Media files use a content-addressed key ``u/{user}/content/{hash[:2]}/{hash}{ext}``
  where ``hash`` is the sha256 of the stored bytes. So the *correct* sha256 is the
  hash embedded in ``stored_key``. For every asset whose ``stored_key`` is
  content-addressed and whose ``sha256`` differs (or is NULL), set
  ``sha256`` = the key's embedded hash.
- Non-content-addressed keys (legacy) carry no hash and are left untouched.

``--verify-bytes`` (optional, slower): for assets whose original is still LOCAL,
re-hash the actual file and only update when the bytes confirm the key's hash;
an asset whose key disagrees with its bytes is reported and skipped (don't guess).
Archived-only assets always trust the key (their local copy is gone).

Usage:
    python tools/backfill_asset_sha256_from_key.py                 # dry-run
    python tools/backfill_asset_sha256_from_key.py --apply         # commit
    python tools/backfill_asset_sha256_from_key.py --apply --verify-bytes
    python tools/backfill_asset_sha256_from_key.py --user-id 1

Requires DATABASE_URL (or PIXSIM_DATABASE_URL) via backend settings/env.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
from dataclasses import dataclass, field

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.services.diagnostics.applied_ledger import record_backfill_applied
from pixsim7.backend.main.services.storage.roots import LOCAL_ROOT_ID

_BATCH = 5000
_HEX64 = re.compile(r"^[0-9a-f]{64}$")


def _get_database_url() -> str:
    from pixsim7.backend.main.shared.config import settings

    url = os.environ.get("PIXSIM_DATABASE_URL") or settings.database_url
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


def _content_hash_from_key(key: str | None) -> str | None:
    """Extract the sha256 embedded in a content-addressed key, else None.

    Key shape: ``u/{user}/content/{hash[:2]}/{hash}{ext}``. Returns the hash only
    when the filename stem is 64 hex chars AND sits under its own 2-char prefix
    folder (so a malformed/legacy key is treated as non-addressed, not guessed).
    """
    if not key:
        return None
    parts = key.split("/")
    if "content" not in parts:
        return None
    i = parts.index("content")
    if i + 2 >= len(parts):
        return None
    prefix, filename = parts[i + 1], parts[i + 2]
    stem = filename.rsplit(".", 1)[0]
    if _HEX64.match(stem) and stem[:2] == prefix:
        return stem
    return None


@dataclass
class Stats:
    scanned: int = 0
    non_addressed: int = 0
    already_ok: int = 0
    mismatched: int = 0
    was_null: int = 0
    fixed: int = 0
    file_missing: int = 0          # --verify-bytes: local file gone
    key_byte_disagree: int = 0     # --verify-bytes: key hash != actual bytes
    samples: list = field(default_factory=list)  # (id, old, new)


async def _backfill(*, apply: bool, user_id: int | None, verify_bytes: bool) -> Stats:
    engine = create_async_engine(_get_database_url(), echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    stats = Stats()

    storage = None
    if verify_bytes:
        from pixsim7.backend.main.services.storage.storage_service import get_storage_service
        storage = get_storage_service()

    async with async_session() as session:
        async with session.begin():
            cursor = 0
            while True:
                q = (
                    select(Asset.id, Asset.stored_key, Asset.sha256, Asset.storage_root_id)
                    .where(Asset.stored_key.is_not(None), Asset.id > cursor)
                    .order_by(Asset.id)
                    .limit(_BATCH)
                )
                if user_id is not None:
                    q = q.where(Asset.user_id == user_id)
                rows = (await session.execute(q)).all()
                if not rows:
                    break

                for aid, key, sha, root in rows:
                    cursor = aid
                    stats.scanned += 1
                    embedded = _content_hash_from_key(key)
                    if embedded is None:
                        stats.non_addressed += 1
                        continue
                    if sha == embedded:
                        stats.already_ok += 1
                        continue

                    # Optional byte-level confirmation for still-local originals.
                    if verify_bytes and (root is None or root == LOCAL_ROOT_ID):
                        actual = await storage.compute_hash(key, root_id=LOCAL_ROOT_ID)
                        if actual is None:
                            stats.file_missing += 1
                            continue
                        if actual != embedded:
                            stats.key_byte_disagree += 1
                            continue

                    stats.mismatched += 1
                    if sha is None:
                        stats.was_null += 1
                    if len(stats.samples) < 20:
                        stats.samples.append((aid, sha, embedded))
                    if apply:
                        await session.execute(
                            update(Asset).where(Asset.id == aid).values(sha256=embedded)
                        )
                        stats.fixed += 1

            if not apply:
                await session.rollback()

    if apply:
        await record_backfill_applied(__file__)

    await engine.dispose()
    return stats


def _print_stats(*, apply: bool, user_id: int | None, verify_bytes: bool, stats: Stats) -> None:
    print(f"Mode: {'APPLY' if apply else 'DRY RUN'}"
          f"{' (verify-bytes)' if verify_bytes else ''}")
    print(f"User scope: {'all users' if user_id is None else f'user_id={user_id}'}")
    print()
    print(f"  scanned (with stored_key):     {stats.scanned}")
    print(f"  non-content-addressed (skip):  {stats.non_addressed}")
    print(f"  already correct:               {stats.already_ok}")
    print(f"  mismatched (incl. {stats.was_null} null):   {stats.mismatched}")
    if verify_bytes:
        print(f"  local file missing (skip):     {stats.file_missing}")
        print(f"  key != bytes (skip, suspect):  {stats.key_byte_disagree}")
    print(f"  {'fixed' if apply else 'would fix'}:                     {stats.fixed if apply else stats.mismatched}")
    if stats.samples:
        print("\n  sample (asset_id: old -> new):")
        for aid, old, new in stats.samples:
            print(f"    {aid}: {old} -> {new[:16]}…")
    if not apply:
        print("\nDry run only. Re-run with --apply to commit.")


async def _main() -> None:
    p = argparse.ArgumentParser(description="Repair assets.sha256 from the content-addressed key.")
    p.add_argument("--apply", action="store_true", help="Apply changes (default is dry-run)")
    p.add_argument("--user-id", type=int, default=None, help="Optional owner user_id scope")
    p.add_argument(
        "--verify-bytes",
        action="store_true",
        help="Re-hash still-local originals to confirm the key before updating (slower)",
    )
    args = p.parse_args()
    stats = await _backfill(apply=args.apply, user_id=args.user_id, verify_bytes=args.verify_bytes)
    _print_stats(apply=args.apply, user_id=args.user_id, verify_bytes=args.verify_bytes, stats=stats)


if __name__ == "__main__":
    asyncio.run(_main())
