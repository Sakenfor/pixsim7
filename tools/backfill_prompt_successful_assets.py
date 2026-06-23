#!/usr/bin/env python3
"""One-shot backfill: populate prompt_versions.successful_assets from existing assets.

``successful_assets`` is the "proven" signal the prompt similarity hybrid
re-rank boosts on (see PromptEmbeddingService / the /prompts/search/similar
``rank=hybrid`` path). Going forward it is incremented on every successful
generation in ``GenerationLifecycleService._increment_prompt_metrics`` (the
mark_completed success path). This script reconstructs the count for prompt
versions that predate that wiring, using the number of assets already attributed
to each version via ``assets.prompt_version_id`` (one asset per successful
generation, matching the runtime increment).

Only touches rows where ``successful_assets`` is still 0/NULL, so it never
clobbers counts the runtime has already started accumulating — safe to re-run.
``generation_count`` is left untouched (it is already runtime-populated).

Pure SQL (a grouped count + join update), so it runs in one statement.

Usage:
    python tools/backfill_prompt_successful_assets.py            # dry-run (default)
    python tools/backfill_prompt_successful_assets.py --apply     # actually update

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

from pixsim7.backend.main.services.diagnostics.applied_ledger import record_backfill_applied


def _get_database_url() -> str:
    # Resolve via the app's own settings so this tool connects to exactly the
    # same DB as the server.
    from pixsim7.backend.main.shared.config import settings

    return settings.async_database_url


async def backfill(apply: bool) -> None:
    url = _get_database_url()
    engine = create_async_engine(url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Prompt versions that have attributed assets but no successful_assets yet.
    count_sql = text(
        """
        SELECT count(*)
        FROM prompt_versions pv
        WHERE COALESCE(pv.successful_assets, 0) = 0
          AND EXISTS (
            SELECT 1 FROM assets a WHERE a.prompt_version_id = pv.id
          )
        """
    )
    update_sql = text(
        """
        UPDATE prompt_versions pv
        SET successful_assets = sub.cnt
        FROM (
            SELECT prompt_version_id, count(*) AS cnt
            FROM assets
            WHERE prompt_version_id IS NOT NULL
            GROUP BY prompt_version_id
        ) sub
        WHERE pv.id = sub.prompt_version_id
          AND COALESCE(pv.successful_assets, 0) = 0
        """
    )

    async with async_session() as session:
        count = (await session.execute(count_sql)).scalar_one()
        print(f"Prompt versions needing successful_assets backfill: {count}")

        if count > 0 and apply:
            result = await session.execute(update_sql)
            await session.commit()
            print(f"Updated {result.rowcount} prompt versions.")
            await record_backfill_applied(__file__, rows_affected=result.rowcount)
        elif not apply and count > 0:
            print("Dry run — pass --apply to perform the update.")
        else:
            print("Nothing to do.")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="Actually perform the update (default is dry-run)")
    args = parser.parse_args()
    print(f"{'APPLYING' if args.apply else 'DRY RUN'}: backfill prompt_versions.successful_assets\n")
    asyncio.run(backfill(apply=args.apply))


if __name__ == "__main__":
    main()
