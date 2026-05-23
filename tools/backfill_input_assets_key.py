#!/usr/bin/env python3
"""One-shot backfill: populate assets.input_assets_key for existing rows.

Derives the "same input assets" sibling-grouping key (plan
``media-card-sibling-badges``, checkpoint ``be-backfill``). New assets get the
key stamped at creation in ``services/asset/_creation.py`` (normal path) and
``services/generation/synthetic.py`` (sync/enrich path); this script handles
rows that predate those changes.

Two id sources, in priority order — both mirror the normal creation path, which
keys off ``Generation.inputs``:
  1. The asset's ``source_generation_id`` → that generation's ``inputs`` JSON.
     This is authoritative and covers synced/enriched assets whose stamped
     ``generation_context`` was never written (older sync paths).
  2. Fallback: ``media_metadata.generation_context.source_asset_ids`` for assets
     that have a stamped context but no generation row.

The key is a SHA256 over the sorted, de-duplicated id set — the same function
the creation path uses — so it can't be expressed in pure SQL. We stream
candidate rows and compute it in Python.

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

from pixsim7.backend.main.services.generation.context import (
    compute_input_assets_key,
    extract_source_asset_ids,
)


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

    # Candidate rows: no key yet, and a source of input asset ids available —
    # either the linked generation's `inputs` JSON (authoritative, preferred)
    # or a stamped generation_context.source_asset_ids array (fallback).
    select_sql = text(
        """
        SELECT a.id,
               g.inputs::jsonb AS gen_inputs,
               a.media_metadata #> '{generation_context,source_asset_ids}' AS ctx_ids
        FROM assets a
        LEFT JOIN generations g ON g.id = a.source_generation_id
        WHERE a.input_assets_key IS NULL
          AND (
                jsonb_array_length(COALESCE(g.inputs::jsonb, '[]'::jsonb)) > 0
                OR jsonb_array_length(
                     COALESCE(a.media_metadata #> '{generation_context,source_asset_ids}', '[]'::jsonb)
                   ) > 0
              )
        """
    )
    update_sql = text(
        "UPDATE assets SET input_assets_key = :key WHERE id = :id"
    )

    async with async_session() as session:
        rows = (await session.execute(select_sql)).all()
        print(f"Candidate rows (no key, have input ids): {len(rows)}")

        updated = 0
        for asset_id, gen_inputs, ctx_ids in rows:
            # Prefer the generation's inputs (same as the live creation path),
            # fall back to the stamped context's source_asset_ids.
            if gen_inputs:
                source_ids = extract_source_asset_ids(gen_inputs)
            else:
                source_ids = [int(i) for i in (ctx_ids or []) if i is not None]
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
