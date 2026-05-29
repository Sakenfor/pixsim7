#!/usr/bin/env python3
"""One-shot backfill: populate assets.gen_seed for existing rows.

Derives the "same seed" sibling-grouping value (the provider generation seed)
the same way the live creation path does — ``extract_gen_seed`` over the linked
generation's ``canonical_params``. New assets get ``gen_seed`` stamped at
creation in ``services/asset/_creation.py`` and on the sync/enrich path in
``services/generation/synthetic.py``; this script handles rows that predate
those changes.

Sentinel seeds (<= 0, i.e. provider "random seed" markers) are intentionally
left NULL — same rule as ``extract_gen_seed`` — so they don't lump unrelated
assets into one huge cohort.

Usage:
    python tools/backfill_asset_gen_seed.py            # dry-run (default)
    python tools/backfill_asset_gen_seed.py --apply     # actually update

Requires DATABASE_URL (or PIXSIM_DATABASE_URL) in env or .env file.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from pixsim7.backend.main.services.generation.context import extract_gen_seed
from pixsim7.backend.main.services.diagnostics.applied_ledger import record_backfill_applied


def _get_database_url() -> str:
    from pixsim7.backend.main.shared.config import settings

    return settings.async_database_url


def _as_dict(value: object) -> dict | None:
    """canonical_params may arrive as a dict (SQLAlchemy json codec) or a raw
    JSON string depending on driver/casting — normalize to a dict."""
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return None
    return None


async def backfill(apply: bool) -> None:
    engine = create_async_engine(_get_database_url(), echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Candidate rows: no seed yet, with a linked generation that carries params.
    select_sql = text(
        """
        SELECT a.id, g.canonical_params
        FROM assets a
        JOIN generations g ON g.id = a.source_generation_id
        WHERE a.gen_seed IS NULL
          AND g.canonical_params IS NOT NULL
        """
    )
    update_sql = text("UPDATE assets SET gen_seed = :seed WHERE id = :id")

    async with async_session() as session:
        rows = (await session.execute(select_sql)).all()
        print(f"Candidate rows (no gen_seed, have a generation): {len(rows)}")

        updated = 0
        for asset_id, canonical_params in rows:
            seed = extract_gen_seed(_as_dict(canonical_params))
            if seed is None:
                continue
            if apply:
                await session.execute(update_sql, {"seed": seed, "id": asset_id})
            updated += 1

        if apply:
            await session.commit()
            print(f"Updated {updated} rows.")
        elif updated:
            print(f"Dry run — would update {updated} rows. Pass --apply to perform.")
        else:
            print("Nothing to do.")

    if apply:
        await record_backfill_applied(__file__, rows_affected=updated)

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="Actually perform the update (default is dry-run)")
    args = parser.parse_args()
    print(f"{'APPLYING' if args.apply else 'DRY RUN'}: backfill assets.gen_seed\n")
    asyncio.run(backfill(apply=args.apply))


if __name__ == "__main__":
    main()
