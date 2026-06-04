#!/usr/bin/env python3
"""One-shot backfill: populate generations.prompt_text_hash for existing rows.

Derives the prompt-only grouping hash (SHA256 of the stripped prompt text) the
same way the live creation path does — ``Generation.compute_prompt_text_hash``
over ``canonical_params['prompt']``. New generations get it stamped at creation
in ``services/generation/creation.py`` (and on the sync path in
``services/generation/synthetic.py``); this script handles rows that predate
those changes.

The column is the index seek key for the prompt-stats chip. Rows with no
prompt (or an empty one) are intentionally left NULL — they can't match a
prompt query anyway.

Processed in keyset-paginated batches by id so we never load all 150k+
``canonical_params`` blobs into memory at once.

Usage:
    python tools/backfill_prompt_text_hash.py            # dry-run (default)
    python tools/backfill_prompt_text_hash.py --apply     # actually update

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

from pixsim7.backend.main.domain.generation.models import Generation
from pixsim7.backend.main.services.diagnostics.applied_ledger import record_backfill_applied

BATCH = 5000


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

    # Keyset pagination: candidates are rows still missing the hash. We page by
    # id so a single batch holds at most BATCH canonical_params blobs.
    select_sql = text(
        """
        SELECT id, canonical_params
        FROM generations
        WHERE prompt_text_hash IS NULL
          AND canonical_params IS NOT NULL
          AND id > :last_id
        ORDER BY id
        LIMIT :batch
        """
    )
    update_sql = text(
        "UPDATE generations SET prompt_text_hash = :h WHERE id = :id"
    )

    scanned = 0
    updated = 0
    last_id = 0

    async with async_session() as session:
        while True:
            rows = (
                await session.execute(
                    select_sql, {"last_id": last_id, "batch": BATCH}
                )
            ).all()
            if not rows:
                break
            scanned += len(rows)
            last_id = rows[-1][0]

            for gen_id, canonical_params in rows:
                h = Generation.prompt_text_hash_from_params(_as_dict(canonical_params))
                if h is None:
                    continue  # no/empty prompt — leave NULL
                if apply:
                    await session.execute(update_sql, {"h": h, "id": gen_id})
                updated += 1

            if apply:
                await session.commit()
            print(f"  ...scanned {scanned}, would-update {updated} (through id {last_id})")

    if apply:
        print(f"Updated {updated} rows (scanned {scanned}).")
    elif updated:
        print(f"Dry run — would update {updated} of {scanned} scanned. Pass --apply.")
    else:
        print(f"Nothing to do (scanned {scanned}).")

    if apply:
        await record_backfill_applied(__file__, rows_affected=updated)

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="Actually perform the update (default is dry-run)")
    args = parser.parse_args()
    print(f"{'APPLYING' if args.apply else 'DRY RUN'}: backfill generations.prompt_text_hash\n")
    asyncio.run(backfill(apply=args.apply))


if __name__ == "__main__":
    main()
