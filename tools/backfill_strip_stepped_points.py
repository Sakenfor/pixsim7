#!/usr/bin/env python3
"""One-shot backfill: strip stale explicit points from step-tracked checkpoints.

A checkpoint is EITHER step-tracked (``steps[]``) OR points-tracked (explicit
``points_total``/``points_done``), never both — steps win on read
(``_derive_checkpoint_points``). Rows written before the steps-XOR-points
write-time enforcement may carry redundant or conflicting explicit points
alongside steps[]. Those stale numbers never surface (they're overridden on
read) but they're a latent data-lie and would now trip the write-time
``steps_points_no_conflict`` rejection on a full-array round-trip.

This sweeps every plan in ``dev_meta.plan_registry`` (including hidden/archived)
and removes points_done/points_total from any checkpoint that has a usable
steps[] array, reusing the same ``strip_stepped_points`` canonicalizer the
write path uses so there is one definition of the canonical shape.

Usage:
    python tools/backfill_strip_stepped_points.py           # dry-run (default)
    python tools/backfill_strip_stepped_points.py --apply    # persist changes

Requires DATABASE_URL (or PIXSIM_DATABASE_URL) in env or .env file.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys

# Ensure project root is on sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from pixsim7.backend.main.services.diagnostics.applied_ledger import record_backfill_applied
from pixsim7.backend.main.services.docs.plan_authoring_policy import strip_stepped_points

SCHEMA = "dev_meta"


def _get_database_url() -> str:
    """Resolve async database URL from environment."""
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


def _as_checkpoints(raw) -> list:
    """Normalize the JSON column value to a list of checkpoint dicts."""
    if raw is None:
        return []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (TypeError, ValueError):
            return []
    return raw if isinstance(raw, list) else []


async def backfill(apply: bool) -> None:
    engine = create_async_engine(_get_database_url(), echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    plans_changed = 0
    checkpoints_changed = 0

    async with async_session() as session:
        rows = (await session.execute(
            text(f"SELECT id, checkpoints FROM {SCHEMA}.plan_registry")
        )).all()

        for plan_id, raw in rows:
            checkpoints = _as_checkpoints(raw)
            touched: list[str] = []
            for cp in checkpoints:
                if isinstance(cp, dict) and strip_stepped_points(cp):
                    touched.append(str(cp.get("id") or "?"))
            if not touched:
                continue
            plans_changed += 1
            checkpoints_changed += len(touched)
            print(f"  {plan_id}: strip points from {len(touched)} stepped checkpoint(s) "
                  f"-> {', '.join(touched)}")
            if apply:
                await session.execute(
                    text(
                        f"UPDATE {SCHEMA}.plan_registry "
                        f"SET checkpoints = CAST(:cp AS json), updated_at = now() WHERE id = :id"
                    ),
                    {"cp": json.dumps(checkpoints), "id": plan_id},
                )

        if apply:
            await session.commit()
            print(f"\nDone. {checkpoints_changed} checkpoint(s) across {plans_changed} plan(s) updated.")
            await record_backfill_applied(__file__, rows_affected=checkpoints_changed)
        else:
            print(f"\nDry run complete: {checkpoints_changed} checkpoint(s) across "
                  f"{plans_changed} plan(s) would change. Use --apply to execute.")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Strip stale explicit points from step-tracked checkpoints"
    )
    parser.add_argument("--apply", action="store_true", help="Persist changes (default is dry-run)")
    args = parser.parse_args()

    print(f"{'APPLYING' if args.apply else 'DRY RUN'}: strip stepped-checkpoint points\n")
    asyncio.run(backfill(apply=args.apply))


if __name__ == "__main__":
    main()
