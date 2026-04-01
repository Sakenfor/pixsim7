#!/usr/bin/env python3
"""One-shot backfill: populate EntityAudit.plan_id for review sub-entity rows.

The audit model hooks now set plan_id automatically, but rows created before
that change have plan_id=NULL for entity_types like plan_review_round,
plan_request, plan_review_node, and plan_review_delegation.

This script joins entity_audit against each sub-entity table on entity_id
(cast to UUID) and copies the sub-entity's plan_id into the audit row.

Usage:
    python tools/backfill_audit_plan_id.py          # dry-run (default)
    python tools/backfill_audit_plan_id.py --apply   # actually update

Requires DATABASE_URL (or PIXSIM_DATABASE_URL) in env or .env file.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

# Ensure project root is on sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker


SCHEMA = "dev_meta"

# entity_type in entity_audit → (sub-entity table, schema)
SUB_ENTITY_TABLES = {
    "plan_review_round": ("plan_review_rounds", SCHEMA),
    "plan_request": ("plan_review_requests", SCHEMA),
    "plan_review_node": ("plan_review_nodes", SCHEMA),
    "plan_review_delegation": ("plan_review_delegations", SCHEMA),
}


def _get_database_url() -> str:
    """Resolve async database URL from environment."""
    url = os.environ.get("PIXSIM_DATABASE_URL") or os.environ.get("DATABASE_URL", "")
    if not url:
        # Try loading from .env
        env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
        if os.path.exists(env_path):
            for line in open(env_path):
                line = line.strip()
                if line.startswith("DATABASE_URL=") or line.startswith("PIXSIM_DATABASE_URL="):
                    url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    if not url:
        raise RuntimeError("No DATABASE_URL found in env or .env")
    # Ensure async driver
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


async def backfill(apply: bool) -> None:
    url = _get_database_url()
    engine = create_async_engine(url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    total_updated = 0

    async with async_session() as session:
        for entity_type, (table_name, table_schema) in SUB_ENTITY_TABLES.items():
            # Count rows that need backfill
            count_sql = text(f"""
                SELECT count(*)
                FROM {SCHEMA}.entity_audit ea
                WHERE ea.entity_type = :entity_type
                  AND ea.domain = 'plan'
                  AND ea.plan_id IS NULL
                  AND EXISTS (
                    SELECT 1 FROM {table_schema}.{table_name} sub
                    WHERE sub.id = ea.entity_id::uuid
                  )
            """)
            result = await session.execute(count_sql, {"entity_type": entity_type})
            count = result.scalar_one()

            print(f"  {entity_type}: {count} rows to backfill")

            if count > 0 and apply:
                update_sql = text(f"""
                    UPDATE {SCHEMA}.entity_audit ea
                    SET plan_id = sub.plan_id
                    FROM {table_schema}.{table_name} sub
                    WHERE ea.entity_type = :entity_type
                      AND ea.domain = 'plan'
                      AND ea.plan_id IS NULL
                      AND sub.id = ea.entity_id::uuid
                """)
                result = await session.execute(update_sql, {"entity_type": entity_type})
                updated = result.rowcount
                print(f"    → updated {updated} rows")
                total_updated += updated

        if apply:
            await session.commit()
            print(f"\nDone. {total_updated} rows updated total.")
        else:
            print(f"\nDry run complete. Use --apply to execute updates.")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill EntityAudit.plan_id for review sub-entities")
    parser.add_argument("--apply", action="store_true", help="Actually perform the updates (default is dry-run)")
    args = parser.parse_args()

    print(f"{'APPLYING' if args.apply else 'DRY RUN'}: backfill entity_audit.plan_id\n")
    asyncio.run(backfill(apply=args.apply))


if __name__ == "__main__":
    main()
