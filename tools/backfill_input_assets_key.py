#!/usr/bin/env python3
"""One-shot backfill: populate assets.input_assets_key for existing rows.

Derives the "same input assets" sibling-grouping key from each asset's
``media_metadata.generation_context.source_asset_ids`` (plan
``media-card-sibling-badges``, checkpoint ``be-backfill``). New assets get the
key stamped at creation in ``services/asset/_creation.py``; this script handles
rows that predate that change.

The key is a SHA256 over the sorted, de-duplicated id set — the same function
the creation path uses — so it can't be expressed in pure SQL. We stream rows
that have source_asset_ids but no key yet and compute it in Python.

Usage:
    python tools/backfill_input_assets_key.py            # dry-run (default)
    python tools/backfill_input_assets_key.py --apply     # actually update

Requires DATABASE_URL (or PIXSIM_DATABASE_URL) in env or .env file.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from pixsim7.backend.main.services.generation.context import compute_input_assets_key


def _get_database_url() -> str:
    # Resolve via the app's own settings so this tool connects to exactly the
    # same DB as the server (settings reads DATABASE_URL from env / .env /
    # default). `async_database_url` already yields the asyncpg scheme.
    from pixsim7.backend.main.shared.config import settings

    return settings.async_database_url


async def backfill(apply: bool) -> None:
    url = _get_database_url()
    engine = create_async_engine(url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Candidate rows: have a source_asset_ids array in the stamped context but
    # no key yet. (Rows with an empty/absent array correctly stay NULL.)
    select_sql = text(
        """
        SELECT id, media_metadata #> '{generation_context,source_asset_ids}' AS ids
        FROM assets
        WHERE input_assets_key IS NULL
          AND jsonb_array_length(
                COALESCE(media_metadata #> '{generation_context,source_asset_ids}', '[]'::jsonb)
              ) > 0
        """
    )
    update_sql = text(
        "UPDATE assets SET input_assets_key = :key WHERE id = :id"
    )

    async with async_session() as session:
        rows = (await session.execute(select_sql)).all()
        print(f"Rows with input assets but no key: {len(rows)}")

        updated = 0
        for asset_id, ids in rows:
            source_ids = [int(i) for i in (ids or []) if i is not None]
            key = compute_input_assets_key(source_ids)
            if key is None:
                continue
            if apply:
                await session.execute(update_sql, {"key": key, "id": asset_id})
            updated += 1

        if apply:
            await session.commit()
            print(f"Updated {updated} rows.")
        elif updated:
            print(f"Dry run — would update {updated} rows. Pass --apply to perform.")
        else:
            print("Nothing to do.")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="Actually perform the update (default is dry-run)")
    args = parser.parse_args()
    print(f"{'APPLYING' if args.apply else 'DRY RUN'}: backfill assets.input_assets_key\n")
    asyncio.run(backfill(apply=args.apply))


if __name__ == "__main__":
    main()
