#!/usr/bin/env python3
"""One-shot backfill: normalize legacy placeholder strings ("null", "(null)",
"undefined", "(undefined)") in asset/filter-related storage.

Why:
- Older ingest paths sometimes persisted placeholder strings instead of real
  nulls.
- Gallery filters then exposed these placeholders as real option values.

What this script updates:
1. assets.upload_context (JSONB):
   - Recursively removes keys/list items whose value is a nullish placeholder.
   - Collapses now-empty nested objects/lists.
2. assets text columns (set to SQL NULL when placeholder):
   - description
   - upload_method
   - original_source_url
3. tag.display_name (set to SQL NULL when placeholder)
4. asset_tag links to bad tags (remove links when tag identity is nullish):
   - tag.slug is nullish token OR ends with ':<nullish-token>'
   - tag.name is nullish token
   - tag.namespace is nullish token

Usage:
    python tools/backfill_asset_nullish_strings.py           # dry-run (default)
    python tools/backfill_asset_nullish_strings.py --apply   # commit
    python tools/backfill_asset_nullish_strings.py --apply --user-id 123

Requires DATABASE_URL (or PIXSIM_DATABASE_URL) via backend settings/env.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from dataclasses import dataclass
from typing import Any, Iterable

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select, update, delete, func, or_
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.domain.assets.tag import Tag, AssetTag
from pixsim7.backend.main.services.diagnostics.applied_ledger import record_backfill_applied

DEFAULT_TOKENS = ("null", "(null)", "undefined", "(undefined)")
_REMOVE = object()


def _get_database_url() -> str:
    from pixsim7.backend.main.shared.config import settings

    url = os.environ.get("PIXSIM_DATABASE_URL") or settings.database_url
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


def _normalize_tokens(tokens: Iterable[str]) -> set[str]:
    return {
        str(token).strip().lower()
        for token in tokens
        if str(token).strip()
    }


def _is_nullish_string(value: Any, *, tokens: set[str]) -> bool:
    return isinstance(value, str) and value.strip().lower() in tokens


def _scrub_json(value: Any, *, tokens: set[str]) -> tuple[Any, int, bool]:
    if _is_nullish_string(value, tokens=tokens):
        return _REMOVE, 1, True

    if isinstance(value, dict):
        changed = False
        removed = 0
        out: dict[str, Any] = {}
        for key, item in value.items():
            next_value, next_removed, next_changed = _scrub_json(item, tokens=tokens)
            removed += next_removed
            changed = changed or next_changed
            if next_value is _REMOVE:
                changed = True
                continue
            out[key] = next_value
        if changed and not out:
            return _REMOVE, removed, True
        return out, removed, changed

    if isinstance(value, list):
        changed = False
        removed = 0
        out: list[Any] = []
        for item in value:
            next_value, next_removed, next_changed = _scrub_json(item, tokens=tokens)
            removed += next_removed
            changed = changed or next_changed
            if next_value is _REMOVE:
                changed = True
                continue
            out.append(next_value)
        if changed and not out:
            return _REMOVE, removed, True
        return out, removed, changed

    return value, 0, False


def _nullish_text_condition(column: Any, tokens: set[str]) -> Any:
    # lower(trim(col)) IN (...)
    normalized = func.lower(func.btrim(column))
    return normalized.in_(sorted(tokens))


@dataclass
class BackfillStats:
    scanned_upload_context_rows: int = 0
    changed_upload_context_rows: int = 0
    removed_upload_context_tokens: int = 0
    nulled_description_rows: int = 0
    nulled_upload_method_rows: int = 0
    nulled_original_source_url_rows: int = 0
    nulled_tag_display_name_rows: int = 0
    removed_asset_tag_rows_bad_identity: int = 0
    affected_bad_identity_tags: int = 0


def _nullish_tag_identity_condition(tokens: set[str]) -> Any:
    normalized_slug = func.lower(func.btrim(Tag.slug))
    normalized_name = func.lower(func.btrim(Tag.name))
    normalized_namespace = func.lower(func.btrim(Tag.namespace))

    suffix_clauses = [
        normalized_slug.like(f"%:{token}")
        for token in sorted(tokens)
    ]

    clauses = [
        normalized_slug.in_(sorted(tokens)),
        normalized_name.in_(sorted(tokens)),
        normalized_namespace.in_(sorted(tokens)),
        *suffix_clauses,
    ]
    return or_(*clauses)


async def _backfill(*, apply: bool, user_id: int | None, tokens: set[str]) -> BackfillStats:
    url = _get_database_url()
    engine = create_async_engine(url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    stats = BackfillStats()

    async with async_session() as session:
        async with session.begin():
            # 1) upload_context JSON cleanup
            ctx_stmt = (
                select(Asset.id, Asset.upload_context)
                .where(Asset.upload_context.isnot(None))
            )
            if user_id is not None:
                ctx_stmt = ctx_stmt.where(Asset.user_id == user_id)

            ctx_rows = await session.execute(ctx_stmt)
            for asset_id, upload_context in ctx_rows.all():
                stats.scanned_upload_context_rows += 1
                cleaned, removed_count, changed = _scrub_json(upload_context, tokens=tokens)
                if not changed:
                    continue
                stats.changed_upload_context_rows += 1
                stats.removed_upload_context_tokens += removed_count
                if apply:
                    next_ctx = None if cleaned is _REMOVE else cleaned
                    await session.execute(
                        update(Asset)
                        .where(Asset.id == asset_id)
                        .values(upload_context=next_ctx)
                    )

            # 2) text columns on assets
            text_targets: list[tuple[str, Any]] = [
                ("description", Asset.description),
                ("upload_method", Asset.upload_method),
                ("original_source_url", Asset.original_source_url),
            ]
            for field_name, field_col in text_targets:
                cond = _nullish_text_condition(field_col, tokens)
                count_stmt = select(func.count(Asset.id)).where(
                    field_col.isnot(None),
                    cond,
                )
                if user_id is not None:
                    count_stmt = count_stmt.where(Asset.user_id == user_id)
                affected = int((await session.execute(count_stmt)).scalar_one() or 0)
                if field_name == "description":
                    stats.nulled_description_rows = affected
                elif field_name == "upload_method":
                    stats.nulled_upload_method_rows = affected
                elif field_name == "original_source_url":
                    stats.nulled_original_source_url_rows = affected

                if apply and affected > 0:
                    upd_stmt = (
                        update(Asset)
                        .where(field_col.isnot(None), cond)
                        .values({field_name: None})
                    )
                    if user_id is not None:
                        upd_stmt = upd_stmt.where(Asset.user_id == user_id)
                    await session.execute(upd_stmt)

            # 3) tag display_name cleanup
            tag_cond = _nullish_text_condition(Tag.display_name, tokens)
            tag_count_stmt = select(func.count(Tag.id)).where(
                Tag.display_name.isnot(None),
                tag_cond,
            )
            if user_id is not None:
                # Limit to tags currently used by this user's assets.
                tag_count_stmt = (
                    select(func.count(func.distinct(Tag.id)))
                    .select_from(Tag)
                    .join(AssetTag, AssetTag.tag_id == Tag.id)
                    .join(Asset, Asset.id == AssetTag.asset_id)
                    .where(
                        Tag.display_name.isnot(None),
                        tag_cond,
                        Asset.user_id == user_id,
                    )
                )
            stats.nulled_tag_display_name_rows = int(
                (await session.execute(tag_count_stmt)).scalar_one() or 0
            )

            if apply and stats.nulled_tag_display_name_rows > 0:
                if user_id is None:
                    await session.execute(
                        update(Tag)
                        .where(Tag.display_name.isnot(None), tag_cond)
                        .values(display_name=None)
                    )
                else:
                    affected_tags = (
                        select(func.distinct(Tag.id))
                        .select_from(Tag)
                        .join(AssetTag, AssetTag.tag_id == Tag.id)
                        .join(Asset, Asset.id == AssetTag.asset_id)
                        .where(
                            Tag.display_name.isnot(None),
                            tag_cond,
                            Asset.user_id == user_id,
                        )
                        .subquery()
                    )
                    await session.execute(
                        update(Tag)
                        .where(Tag.id.in_(select(affected_tags.c.id)))
                        .values(display_name=None)
                    )

            # 4) Remove asset_tag links pointing to nullish tag identities.
            # These placeholders can produce misleading filter rows that still
            # match assets. We only detach links; we do not delete tag rows.
            bad_tag_cond = _nullish_tag_identity_condition(tokens)
            bad_tags_count_stmt = select(func.count(Tag.id)).where(bad_tag_cond)
            stats.affected_bad_identity_tags = int(
                (await session.execute(bad_tags_count_stmt)).scalar_one() or 0
            )

            bad_links_count_stmt = (
                select(func.count(AssetTag.asset_id))
                .select_from(AssetTag)
                .join(Tag, Tag.id == AssetTag.tag_id)
                .where(bad_tag_cond)
            )
            if user_id is not None:
                bad_links_count_stmt = (
                    bad_links_count_stmt
                    .join(Asset, Asset.id == AssetTag.asset_id)
                    .where(Asset.user_id == user_id)
                )
            stats.removed_asset_tag_rows_bad_identity = int(
                (await session.execute(bad_links_count_stmt)).scalar_one() or 0
            )

            if apply and stats.removed_asset_tag_rows_bad_identity > 0:
                bad_tag_ids_stmt = select(Tag.id).where(bad_tag_cond)
                del_stmt = delete(AssetTag).where(AssetTag.tag_id.in_(bad_tag_ids_stmt))
                if user_id is not None:
                    owned_asset_ids_stmt = select(Asset.id).where(Asset.user_id == user_id)
                    del_stmt = del_stmt.where(AssetTag.asset_id.in_(owned_asset_ids_stmt))
                await session.execute(del_stmt)

            if not apply:
                await session.rollback()

    if apply:
        await record_backfill_applied(__file__)

    await engine.dispose()
    return stats


def _print_stats(*, apply: bool, user_id: int | None, tokens: set[str], stats: BackfillStats) -> None:
    print(f"Mode: {'APPLY' if apply else 'DRY RUN'}")
    print(f"User scope: {'all users' if user_id is None else f'user_id={user_id}'}")
    print(f"Nullish tokens: {', '.join(sorted(tokens))}")
    print()
    print("assets.upload_context")
    print(f"  scanned rows: {stats.scanned_upload_context_rows}")
    print(f"  changed rows: {stats.changed_upload_context_rows}")
    print(f"  removed placeholder values: {stats.removed_upload_context_tokens}")
    print()
    print("assets text columns (set to NULL)")
    print(f"  description: {stats.nulled_description_rows}")
    print(f"  upload_method: {stats.nulled_upload_method_rows}")
    print(f"  original_source_url: {stats.nulled_original_source_url_rows}")
    print()
    print("tag.display_name (set to NULL)")
    print(f"  affected rows: {stats.nulled_tag_display_name_rows}")
    print()
    print("asset_tag links to bad nullish tag identities (removed)")
    print(f"  affected tags: {stats.affected_bad_identity_tags}")
    print(f"  removed links: {stats.removed_asset_tag_rows_bad_identity}")
    print()
    if not apply:
        print("Dry run only. Re-run with --apply to commit.")


async def _main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill placeholder nullish strings in asset/filter fields."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply changes (default is dry-run)",
    )
    parser.add_argument(
        "--user-id",
        type=int,
        default=None,
        help="Optional owner user_id scope for asset rows",
    )
    parser.add_argument(
        "--token",
        action="append",
        default=[],
        help=(
            "Additional nullish token to treat as placeholder "
            "(can be repeated; case-insensitive)"
        ),
    )
    args = parser.parse_args()

    tokens = _normalize_tokens([*DEFAULT_TOKENS, *args.token])
    stats = await _backfill(apply=args.apply, user_id=args.user_id, tokens=tokens)
    _print_stats(apply=args.apply, user_id=args.user_id, tokens=tokens, stats=stats)


if __name__ == "__main__":
    asyncio.run(_main())
