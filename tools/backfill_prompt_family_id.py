#!/usr/bin/env python3
"""One-shot backfill: populate assets.prompt_family_id for existing rows.

Copies ``PromptVersion.family_id`` onto each asset via its ``prompt_version_id``
(plan ``media-card-sibling-badges``, checkpoint ``be-prompt-family``). New
assets get it stamped at creation in ``services/asset/_creation.py``; this
script handles rows that predate that change.

Unlike the input-assets-key backfill this is pure SQL (a join + update), so it
runs in one statement.

Usage:
    python tools/backfill_prompt_family_id.py            # dry-run (default)
    python tools/backfill_prompt_family_id.py --apply     # actually update

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
    # Resolve via the app's own settings so this tool connects to exactly the
    # same DB as the server (settings reads DATABASE_URL from env / .env /
    # default). `async_database_url` already yields the asyncpg scheme.
    from pixsim7.backend.main.shared.config import settings

    return settings.async_database_url


async def backfill(apply: bool) -> None:
    url = _get_database_url()
    engine = create_async_engine(url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Rows that have a prompt version whose family is set, but no family stamped yet.
    count_sql = text(
        """
        SELECT count(*)
        FROM assets a
        JOIN prompt_versions pv ON a.prompt_version_id = pv.id
        WHERE a.prompt_family_id IS NULL
          AND pv.family_id IS NOT NULL
        """
    )
    update_sql = text(
        """
        UPDATE assets a
        SET prompt_family_id = pv.family_id
        FROM prompt_versions pv
        WHERE a.prompt_version_id = pv.id
          AND a.prompt_family_id IS NULL
          AND pv.family_id IS NOT NULL
        """
    )

    async with async_session() as session:
        count = (await session.execute(count_sql)).scalar_one()
        print(f"Rows needing prompt_family_id backfill: {count}")

        if count > 0 and apply:
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
    print(f"{'APPLYING' if args.apply else 'DRY RUN'}: backfill assets.prompt_family_id\n")
    asyncio.run(backfill(apply=args.apply))


if __name__ == "__main__":
    main()
