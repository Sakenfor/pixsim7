#!/usr/bin/env python3
"""Cutover: copy automation config tables from main DB to automation DB and
drop all 7 automation tables from main DB.

Plan: automation-package-extraction Phase 2c.

This script is a one-shot, opt-in migration. Run it ONLY after:
  1. Setting AUTOMATION_DATABASE_URL to a separate Postgres database in your
     environment (otherwise main and automation point at the same DB and
     the cutover is a no-op + drop, which would lose data).
  2. Running `alembic -c alembic_automation.ini upgrade head` against that
     separate DB to create the schema (7 tables + 6 enums).

Behaviour:
  - Copies user-configured config (preserves data the user authored):
        app_action_presets, execution_loops, android_devices, device_agents
  - Drops all 7 tables from the main DB (history tables are dropped without
    copy; they're per-run audit logs that can be recreated empty):
        automation_executions, execution_loop_history, pairing_requests,
        + the 4 above after copy
  - Idempotent-ish: dry-run by default. PG sequences are reset on the
    automation side after copy so future inserts don't collide with copied IDs.

Usage:
    python tools/migrate_automation_tables.py            # dry-run (default)
    python tools/migrate_automation_tables.py --apply    # commit cutover
    python tools/migrate_automation_tables.py --skip-drop  # copy only, keep
                                                            # main-DB tables
                                                            # (for safety
                                                            # checks before
                                                            # the second pass)
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from pixsim7.backend.main.shared.config import settings


# Order matters for both copy and drop:
# - Copy: parents before children (respect remaining intra-automation FKs).
# - Drop: children before parents.
COPY_ORDER = [
    "app_action_presets",   # self-FK
    "device_agents",
    "android_devices",      # FKs -> device_agents, self
    "execution_loops",      # FK -> presets, devices
]

DROP_HISTORY = [
    "execution_loop_history",
    "automation_executions",
    "pairing_requests",
]

# Full drop order in main DB after cutover (children before parents).
DROP_ORDER = [
    "execution_loop_history",
    "automation_executions",
    "execution_loops",
    "android_devices",
    "device_agents",
    "app_action_presets",
    "pairing_requests",
]


async def _table_count(session: AsyncSession, table: str) -> int:
    result = await session.execute(text(f"SELECT COUNT(*) FROM {table}"))
    return int(result.scalar_one())


async def _table_exists(session: AsyncSession, table: str) -> bool:
    result = await session.execute(
        text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
            "WHERE table_name = :t)"
        ),
        {"t": table},
    )
    return bool(result.scalar_one())


async def _column_names(session: AsyncSession, table: str) -> list[str]:
    result = await session.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = :t ORDER BY ordinal_position"
        ),
        {"t": table},
    )
    return [row[0] for row in result]


async def _copy_table(
    main: AsyncSession,
    auto: AsyncSession,
    table: str,
) -> tuple[int, int]:
    """Stream rows from main.{table} → automation.{table}.

    Returns (rows_in_main, rows_copied). For tables that already have rows
    in the automation DB (e.g., previous partial cutover), we skip rather than
    duplicate-key — caller must clean up first.
    """
    main_count = await _table_count(main, table)
    auto_count = await _table_count(auto, table)
    if auto_count > 0:
        print(f"  ! {table}: automation DB already has {auto_count} rows; skipping copy")
        return main_count, 0
    if main_count == 0:
        return 0, 0

    cols = await _column_names(main, table)
    col_list = ", ".join(f'"{c}"' for c in cols)
    select_sql = f'SELECT {col_list} FROM "{table}"'
    insert_sql = (
        f'INSERT INTO "{table}" ({col_list}) VALUES '
        f'({", ".join(":" + c for c in cols)})'
    )

    result = await main.execute(text(select_sql))
    rows = [dict(zip(cols, r)) for r in result]
    if rows:
        await auto.execute(text(insert_sql), rows)

    return main_count, len(rows)


async def _reset_sequence(session: AsyncSession, table: str) -> None:
    """After copying with explicit IDs, bump the SERIAL sequence past max(id)."""
    seq_name = f"{table}_id_seq"
    result = await session.execute(
        text("SELECT to_regclass(:seq)"),
        {"seq": f"public.{seq_name}"},
    )
    if result.scalar_one() is None:
        return  # No sequence (e.g., UUID PK or composite PK)
    await session.execute(
        text(
            f'SELECT setval(\'"{seq_name}"\', '
            f'COALESCE((SELECT MAX(id) FROM "{table}"), 0) + 1, false)'
        )
    )


async def main_async(*, apply: bool, skip_drop: bool) -> int:
    main_url = settings.async_database_url
    auto_url = settings.async_automation_database_url
    if main_url == auto_url:
        print(
            "ABORT: AUTOMATION_DATABASE_URL is unset (or equal to DATABASE_URL).\n"
            "  Both engines point at the same DB. Running --apply would drop\n"
            "  the source tables. Set AUTOMATION_DATABASE_URL first.",
            file=sys.stderr,
        )
        return 2

    print(f"main DB: {main_url}")
    print(f"automation DB: {auto_url}")
    print(f"mode: {'APPLY' if apply else 'DRY-RUN'}{' (skip-drop)' if skip_drop else ''}")
    print()

    main_engine = create_async_engine(main_url, poolclass=NullPool)
    auto_engine = create_async_engine(auto_url, poolclass=NullPool)

    try:
        async with AsyncSession(main_engine) as main_s, AsyncSession(auto_engine) as auto_s:
            print("== copy plan ==")
            for table in COPY_ORDER:
                if not await _table_exists(main_s, table):
                    print(f"  - {table}: missing in main DB, skipping")
                    continue
                if not await _table_exists(auto_s, table):
                    print(
                        f"  ! {table}: missing in automation DB — "
                        f"run alembic upgrade first"
                    )
                    return 3
                src_count = await _table_count(main_s, table)
                dst_count = await _table_count(auto_s, table)
                print(f"  - {table}: main={src_count} rows, automation={dst_count} rows")

            print()
            print("== drop plan (main DB) ==")
            for table in DROP_ORDER:
                if not await _table_exists(main_s, table):
                    print(f"  - {table}: already absent")
                else:
                    n = await _table_count(main_s, table)
                    label = " (history — will be dropped without copy)" if table in DROP_HISTORY else ""
                    print(f"  - {table}: {n} rows{label}")

            if not apply:
                print()
                print("Dry-run only. Re-run with --apply to execute.")
                return 0

            print()
            print("== copying ==")
            for table in COPY_ORDER:
                if not await _table_exists(main_s, table):
                    continue
                src, copied = await _copy_table(main_s, auto_s, table)
                print(f"  ok {table}: copied {copied} of {src} rows")
                if copied > 0:
                    await _reset_sequence(auto_s, table)
            await auto_s.commit()
            print("  automation DB committed.")

            if skip_drop:
                print()
                print("--skip-drop: leaving main-DB tables in place. Verify, then re-run without --skip-drop.")
                return 0

            print()
            print("== dropping from main DB ==")
            for table in DROP_ORDER:
                if not await _table_exists(main_s, table):
                    continue
                await main_s.execute(text(f'DROP TABLE "{table}" CASCADE'))
                print(f"  ok {table}: dropped")
            await main_s.commit()
            print("  main DB committed.")

        return 0
    finally:
        await main_engine.dispose()
        await auto_engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Commit changes (default: dry-run)")
    parser.add_argument(
        "--skip-drop",
        action="store_true",
        help="Copy only; do not drop tables from main DB",
    )
    args = parser.parse_args()

    rc = asyncio.run(main_async(apply=args.apply, skip_drop=args.skip_drop))
    sys.exit(rc)


if __name__ == "__main__":
    main()
