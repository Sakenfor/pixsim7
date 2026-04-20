#!/usr/bin/env python3
"""One-shot backfill: copy asset.media_metadata.generation_context.prompt
into the first-class assets.prompt column for legacy rows.

Applied 2026-04-19 on the primary DB (6 rows rescued).  Kept here so anyone
spinning up a new instance of an older schema can replay it, and as a
template for future data-only backfills — those now belong in ``tools/``
rather than ``alembic/versions/`` (alembic is for schema evolution; data
fixes should be runnable scripts that don't bloat the migration chain).

Usage:
    python tools/backfill_asset_prompt_from_blob.py           # dry-run (default)
    python tools/backfill_asset_prompt_from_blob.py --apply    # actually update

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


def _get_database_url() -> str:
    url = os.environ.get("PIXSIM_DATABASE_URL") or os.environ.get("DATABASE_URL", "")
    if not url:
        env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
        if os.path.exists(env_path):
            for line in open(env_path):
                line = line.strip()
                if line.startswith("DATABASE_URL=") or line.startswith("PIXSIM_DATABASE_URL="):
                    url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    if not url:
        raise RuntimeError("No DATABASE_URL found in env or .env")
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


async def backfill(apply: bool) -> None:
    url = _get_database_url()
    engine = create_async_engine(url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        count_sql = text(
            """
            SELECT count(*)
            FROM assets
            WHERE prompt IS NULL
              AND (media_metadata -> 'generation_context' ->> 'prompt') IS NOT NULL
              AND (media_metadata -> 'generation_context' ->> 'prompt') <> ''
            """
        )
        count = (await session.execute(count_sql)).scalar_one()
        print(f"Rows needing backfill: {count}")

        if count > 0 and apply:
            update_sql = text(
                """
                UPDATE assets
                SET prompt = media_metadata -> 'generation_context' ->> 'prompt'
                WHERE prompt IS NULL
                  AND (media_metadata -> 'generation_context' ->> 'prompt') IS NOT NULL
                  AND (media_metadata -> 'generation_context' ->> 'prompt') <> ''
                """
            )
            result = await session.execute(update_sql)
            await session.commit()
            print(f"Updated {result.rowcount} rows.")
        elif not apply and count > 0:
            print("Dry run — pass --apply to perform the update.")
        else:
            print("Nothing to do.")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="Actually perform the update (default is dry-run)")
    args = parser.parse_args()
    print(f"{'APPLYING' if args.apply else 'DRY RUN'}: backfill assets.prompt from blob\n")
    asyncio.run(backfill(apply=args.apply))


if __name__ == "__main__":
    main()
