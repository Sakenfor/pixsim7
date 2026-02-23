#!/usr/bin/env python3
"""
Remove long / malformed tags from the database.

Tags with slug length > 80 chars are almost certainly LLM hallucinations
rather than canonical vocabulary entries.  This script:

  1. Finds all Tag rows whose slug exceeds the threshold
  2. Deletes their asset_tag join rows
  3. Deletes the Tag rows themselves

Usage:
    python -m pixsim7.backend.main.scripts.cleanup_long_tags
    python -m pixsim7.backend.main.scripts.cleanup_long_tags --dry-run
    python -m pixsim7.backend.main.scripts.cleanup_long_tags --threshold 60
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import delete, func, select

MAX_SLUG_LENGTH = 80


async def _run(threshold: int, dry_run: bool) -> None:
    from pixsim7.backend.main.infrastructure.database.session import AsyncSessionLocal
    from pixsim7.backend.main.domain.assets.tag import AssetTag, Tag

    async with AsyncSessionLocal() as db:
        # Find long tags
        stmt = select(Tag).where(func.length(Tag.slug) > threshold)
        result = await db.execute(stmt)
        long_tags = result.scalars().all()

        if not long_tags:
            print(f"No tags with slug > {threshold} chars found.")
            return

        print(f"Found {len(long_tags)} tags with slug > {threshold} chars:\n")
        for tag in long_tags:
            print(f"  [{tag.id}] {tag.slug!r} ({len(tag.slug)} chars)")

        if dry_run:
            print(f"\n  Dry run — no changes made.")
            return

        tag_ids = [tag.id for tag in long_tags]

        # Delete join rows first
        del_joins = delete(AssetTag).where(AssetTag.tag_id.in_(tag_ids))
        join_result = await db.execute(del_joins)
        print(f"\n  Deleted {join_result.rowcount} asset_tag join rows.")

        # Delete tag rows
        del_tags = delete(Tag).where(Tag.id.in_(tag_ids))
        tag_result = await db.execute(del_tags)
        print(f"  Deleted {tag_result.rowcount} tag rows.")

        await db.commit()
        print("  Done.")


def main() -> None:
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    threshold = MAX_SLUG_LENGTH

    if "--threshold" in args:
        idx = args.index("--threshold")
        if idx + 1 < len(args):
            threshold = int(args[idx + 1])

    asyncio.run(_run(threshold=threshold, dry_run=dry_run))


if __name__ == "__main__":
    main()
