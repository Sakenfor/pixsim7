#!/usr/bin/env python3
"""One-shot backfill: populate the denormalized assets.signal_* columns.

Mirrors ``media_metadata.signal_metrics`` (score / scanner_version /
user_override) into the flat ``signal_score`` / ``signal_scanner_version`` /
``signal_override`` columns added by migration ``20260614_0001``. New/rescanned
rows get these stamped by ``SignalAnalysisService.probe_and_stamp`` and the
override endpoint; this script handles rows scanned before the columns existed.

Set-based — the projection is a pure JSON read, no per-row Python. Only touches
VIDEO rows whose column copy is out of sync with the JSON.

Usage:
    python tools/backfill_asset_signal_columns.py            # dry-run (default)
    python tools/backfill_asset_signal_columns.py --apply     # actually update

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
    from pixsim7.backend.main.shared.config import settings

    return settings.async_database_url


_PREDICATE = """
    media_type = 'VIDEO'
    AND (media_metadata -> 'signal_metrics') IS NOT NULL
    AND signal_scanner_version IS DISTINCT FROM (media_metadata -> 'signal_metrics' ->> 'scanner_version')
"""

_COUNT_SQL = text(f"SELECT count(*) FROM assets WHERE {_PREDICATE}")

_UPDATE_SQL = text(
    f"""
    UPDATE assets SET
      signal_score = (media_metadata -> 'signal_metrics' ->> 'score')::smallint,
      signal_scanner_version = media_metadata -> 'signal_metrics' ->> 'scanner_version',
      signal_override = media_metadata -> 'signal_metrics' ->> 'user_override'
    WHERE {_PREDICATE}
    """
)


async def backfill(apply: bool) -> None:
    engine = create_async_engine(_get_database_url(), echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        pending = (await session.execute(_COUNT_SQL)).scalar_one()
        print(f"Video rows with out-of-sync signal columns: {pending}")

        if not pending:
            print("Nothing to do.")
            await engine.dispose()
            return

        if apply:
            result = await session.execute(_UPDATE_SQL)
            await session.commit()
            updated = result.rowcount
            print(f"Updated {updated} rows.")
            await record_backfill_applied(__file__, rows_affected=updated)
        else:
            print(f"Dry run — would update {pending} rows. Pass --apply to perform.")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="Actually perform the update (default is dry-run)")
    args = parser.parse_args()
    print(f"{'APPLYING' if args.apply else 'DRY RUN'}: backfill assets.signal_* columns\n")
    asyncio.run(backfill(apply=args.apply))


if __name__ == "__main__":
    main()
