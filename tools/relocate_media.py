"""Relocate media originals from the local (hot) root to a storage archive.

Implements the relocation mover for plan ``media-storage-tiering`` (Phase F).
Under creation Model B, every asset is born on the local root; this tool is how
video originals actually move to the configured ``archive`` root (e.g. an
S3/MinIO store reached over ZeroTier). Modeled on the format-conversion
relocation block in ``api/v1/assets_maintenance.py``.

Per asset, with ``--apply``:
  1. Upload the local file to the archive under the SAME ``stored_key`` (the key
     is tier-agnostic; only the root changes). Idempotent — skips the upload if
     the object already exists on the archive (safe resume).
  2. Verify integrity: the archive object must exist and its size must match the
     local file. ``--verify-hash`` additionally re-hashes the archive copy and
     compares to ``asset.sha256`` (slower — downloads the object).
  3. Flip ``storage_root_id`` to the archive id and clear ``local_path`` (it's a
     derived cache; for archived files the path is resolved on demand). Commit
     per-asset so a mid-batch failure keeps prior successes.
  4. Post-commit, delete the local blob ONLY when no other asset row still
     references that ``stored_key`` on the local root (content-addressed dedup
     means siblings can share a blob).

Selection: ``media_type = video``, currently on local (``storage_root_id`` NULL
or ``'local'``), with a ``stored_key``. Optional ``--min-size-mb`` and
``--user-id`` filters.

Usage::

    python tools/relocate_media.py --count-only
    python tools/relocate_media.py --dry-run [--limit N] [--min-size-mb 50]
    python tools/relocate_media.py --apply   [--limit N] [--min-size-mb 50] [--verify-hash]

Requires an ``archive`` root in ``settings.media_storage_roots`` for ``--apply``
(``--count-only``/``--dry-run`` work without it). Re-running is safe/idempotent.

NOTE: ``S3StorageService.store_from_path`` currently reads the file into memory
before PUT — fine for typical AI-gen clips (tens of MB), but a streaming/
multipart upload is a follow-up before relocating very large files.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path
from typing import Optional

# Allow running as a plain script from the repo root.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from sqlalchemy import func, or_, select

from pixsim7.backend.main.domain.enums import MediaType
from pixsim7.backend.main.services.storage.roots import LOCAL_ROOT_ID


# --------------------------------------------------------------------------- #
# Candidate selection
# --------------------------------------------------------------------------- #

def _candidate_query(min_size_bytes: int, user_id: Optional[int]):
    """Build the select for video assets currently on the local root."""
    from pixsim7.backend.main.domain.assets.models import Asset

    stmt = select(Asset).where(
        Asset.media_type == MediaType.VIDEO,
        Asset.stored_key.is_not(None),
        or_(Asset.storage_root_id.is_(None), Asset.storage_root_id == LOCAL_ROOT_ID),
    )
    if min_size_bytes > 0:
        stmt = stmt.where(Asset.file_size_bytes >= min_size_bytes)
    if user_id is not None:
        stmt = stmt.where(Asset.user_id == user_id)
    return stmt.order_by(Asset.id)


# --------------------------------------------------------------------------- #
# Core blob relocation (DB-free — unit-testable with any TieredStorageService)
# --------------------------------------------------------------------------- #

async def relocate_blob(
    storage,
    key: str,
    src_path: str,
    archive_root: str,
    *,
    verify_hash: bool = False,
    expected_sha: Optional[str] = None,
) -> int:
    """
    Upload ``key``'s local file to ``archive_root`` and verify it landed intact.

    Idempotent: skips the upload when the object already exists on the archive
    (safe resume). Raises RuntimeError on any verification failure. Returns the
    local file size in bytes.
    """
    if not await storage.exists(key, root_id=archive_root):
        await storage.store_from_path(key, src_path, root_id=archive_root)

    meta = await storage.get_metadata(key, root_id=archive_root)
    if meta is None:
        raise RuntimeError(f"verify failed: no archive object after upload (key={key})")

    local_size = os.path.getsize(src_path)
    if meta.get("size") != local_size:
        raise RuntimeError(
            f"verify failed: archive size {meta.get('size')} != local {local_size} (key={key})"
        )

    if verify_hash and expected_sha:
        archive_sha = await storage.compute_hash(key, root_id=archive_root)
        if archive_sha != expected_sha:
            raise RuntimeError(
                f"verify failed: archive hash {archive_sha} != expected {expected_sha} (key={key})"
            )

    return local_size


# --------------------------------------------------------------------------- #
# Per-asset relocation (DB)
# --------------------------------------------------------------------------- #

async def relocate_one(
    session,
    storage,
    asset,
    *,
    archive_root: str,
    apply: bool,
    verify_hash: bool,
) -> dict:
    """Relocate a single asset's original to the archive. Returns a result dict."""
    from pixsim7.backend.main.domain.assets.models import Asset

    key = asset.stored_key
    if not key:
        return {"status": "skipped", "reason": "no_stored_key", "freed_bytes": 0}

    src = storage.local_path_if_local(key, LOCAL_ROOT_ID)
    if not src or not os.path.exists(src):
        return {"status": "skipped", "reason": "local_missing", "freed_bytes": 0}

    local_size = os.path.getsize(src)

    if not apply:
        # Only probe the archive when it's actually configured — otherwise the
        # tiered router would fall back to local and falsely report "already there".
        already = bool(getattr(storage, "has_root", lambda _r: False)(archive_root)) and \
            await storage.exists(key, root_id=archive_root)
        return {
            "status": "would_move",
            "already_uploaded": already,
            "bytes": local_size,
            "freed_bytes": 0,
        }

    # 1-2. Upload + verify (idempotent).
    await relocate_blob(
        storage, key, src, archive_root,
        verify_hash=verify_hash, expected_sha=asset.sha256,
    )

    # 3. Flip placement; local_path is derived, so clear it for archived files.
    asset.storage_root_id = archive_root
    asset.local_path = None
    await session.commit()

    # 4. Post-commit: delete the local blob only if no sibling still references
    #    this key on the local root (this asset is now 'archive', so excluded).
    remaining_local = (
        await session.execute(
            select(func.count()).select_from(Asset).where(
                Asset.stored_key == key,
                or_(Asset.storage_root_id.is_(None), Asset.storage_root_id == LOCAL_ROOT_ID),
            )
        )
    ).scalar() or 0

    freed = 0
    if remaining_local == 0:
        if await storage.delete(key, root_id=LOCAL_ROOT_ID):
            freed = local_size
    return {"status": "moved", "freed_bytes": freed, "shared_local": remaining_local > 0}


def _human(n: int) -> str:
    f = float(n)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(f) < 1024:
            return f"{f:.1f} {unit}"
        f /= 1024
    return f"{f:.1f} PB"


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Relocate video originals from the local root to the storage archive.",
    )
    mode = p.add_mutually_exclusive_group(required=True)
    mode.add_argument("--count-only", action="store_true", help="Print candidate count only.")
    mode.add_argument("--dry-run", action="store_true", help="List what would move. No changes.")
    mode.add_argument("--apply", action="store_true", help="Actually relocate.")
    p.add_argument("--limit", type=int, default=None, help="Max assets to process.")
    p.add_argument("--min-size-mb", type=float, default=0.0, help="Only assets >= this size.")
    p.add_argument("--user-id", type=int, default=None, help="Restrict to one user.")
    p.add_argument("--archive-root", default="archive", help="Target root id (default: archive).")
    p.add_argument(
        "--verify-hash", action="store_true",
        help="Re-hash the archive copy and compare to asset.sha256 (slower; downloads).",
    )
    return p.parse_args()


async def main() -> None:
    args = parse_args()
    min_size_bytes = int(args.min_size_mb * 1024 * 1024)

    from pixsim7.backend.main.infrastructure.database.session import get_async_session
    from pixsim7.backend.main.services.storage import get_storage_service
    from pixsim7.backend.main.services.storage.roots import get_root_specs

    storage = get_storage_service()

    if args.apply and args.archive_root not in get_root_specs():
        print(
            f"ERROR: archive root '{args.archive_root}' is not configured in "
            f"settings.media_storage_roots — cannot --apply. Configured roots: "
            f"{sorted(get_root_specs())}",
            file=sys.stderr,
        )
        sys.exit(2)

    async with get_async_session() as session:
        if args.count_only:
            total = (
                await session.execute(
                    select(func.count()).select_from(_candidate_query(min_size_bytes, args.user_id).subquery())
                )
            ).scalar() or 0
            print(f"Candidates (video, local root): {total}")
            return

        if args.dry_run and args.archive_root not in get_root_specs():
            print(
                f"NOTE: archive root '{args.archive_root}' not configured — "
                f"listing local video candidates only (no archive validation)."
            )

        stmt = _candidate_query(min_size_bytes, args.user_id)
        if args.limit:
            stmt = stmt.limit(args.limit)
        assets = (await session.execute(stmt)).scalars().all()

        print(
            f"{'DRY-RUN' if args.dry_run else 'APPLY'}: {len(assets)} candidate(s) "
            f"-> root '{args.archive_root}'"
        )

        moved = skipped = errors = 0
        freed = 0
        would_bytes = 0
        for asset in assets:
            try:
                res = await relocate_one(
                    session, storage, asset,
                    archive_root=args.archive_root,
                    apply=args.apply,
                    verify_hash=args.verify_hash,
                )
            except Exception as exc:  # noqa: BLE001 — report per-asset, keep going
                await session.rollback()
                errors += 1
                print(f"  ERROR asset {asset.id}: {exc}", file=sys.stderr)
                continue

            status = res["status"]
            if status == "moved":
                moved += 1
                freed += res["freed_bytes"]
            elif status == "would_move":
                moved += 1
                would_bytes += res["bytes"]
                tag = " (already on archive)" if res.get("already_uploaded") else ""
                print(f"  would move asset {asset.id} ({_human(res['bytes'])}){tag}")
            else:
                skipped += 1
                print(f"  skip asset {asset.id}: {res.get('reason')}")

        print("-" * 60)
        if args.apply:
            print(f"Moved: {moved} | skipped: {skipped} | errors: {errors} | freed: {_human(freed)}")
        else:
            print(
                f"Would move: {moved} ({_human(would_bytes)}) | "
                f"skipped: {skipped} | errors: {errors}"
            )


if __name__ == "__main__":
    asyncio.run(main())
