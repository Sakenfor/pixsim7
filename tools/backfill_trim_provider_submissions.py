#!/usr/bin/env python3
"""One-shot cleanup: trim pathologically large provider_submissions tails.

Before the per-round quota-rotation cap shipped, the worker could rotate
through every account on a quota error without bumping retry_count, producing
N submission rows per auto-retry round. Combined with high
auto_retry_max_attempts, single generations accumulated 300-400 rows that are
mostly redundant "still no credits" repeats with no unique forensic value.

Strategy per outlier generation (terminal status only — completed / cancelled /
failed; never paused or in-flight):

    Keep:
      - The first N rows by submitted_at  (initial rotation pattern across
        accounts — the genuinely informative part)
      - The last M rows by submitted_at   (final outcome / just-before)

    Note on submission-level "success": the provider_submissions.status
    column tracks whether the provider *accepted the submit call*, NOT
    whether the generation ultimately produced a usable asset. A 30-attempt
    generation can have 26 status='success' rows (each accepted, then
    filtered or expired during polling). We deliberately do NOT special-
    case successes — the last-M rule already captures whichever of those
    rows mattered (the final outcome lands in the tail), and intermediate
    "submitted but later went bad" rows carry no extra forensic value
    that isn't already in the first-N rotation pattern.

Defaults: threshold=20, keep_first=5, keep_last=3.

Skips analysis submissions (analysis_id IS NOT NULL) — they have a different
shape and aren't part of this pathology.

Usage:
    python tools/backfill_trim_provider_submissions.py             # dry-run (default)
    python tools/backfill_trim_provider_submissions.py --verify    # read-only check
    python tools/backfill_trim_provider_submissions.py --apply     # commit deletes
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
    from pixsim7.backend.main.shared.config import settings
    url = os.environ.get("PIXSIM_DATABASE_URL") or settings.database_url
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


# Generations in these states are terminal — safe to trim their submission logs.
# Excludes 'paused' (may resume), 'processing'/'pending' (in flight).
_TERMINAL_GEN_STATUSES = ("completed", "cancelled", "failed")


def _build_keep_cte(keep_first: int, keep_last: int) -> str:
    """Build the SQL CTE that identifies which rows to KEEP per outlier generation.

    Rules (UNIONed):
      1. First `keep_first` rows by submitted_at, id
      2. Last `keep_last` rows by submitted_at DESC, id DESC
    """
    return f"""
    WITH outliers AS (
        SELECT ps.generation_id, COUNT(*) AS n
        FROM provider_submissions ps
        JOIN generations g ON g.id = ps.generation_id
        WHERE ps.generation_id IS NOT NULL
          AND ps.analysis_id IS NULL
          AND g.status::text = ANY(:terminal_statuses)
        GROUP BY ps.generation_id
        HAVING COUNT(*) > :threshold
    ),
    ranked AS (
        SELECT
            ps.id,
            ps.generation_id,
            ps.status,
            ps.provider_job_id,
            ROW_NUMBER() OVER (
                PARTITION BY ps.generation_id
                ORDER BY ps.submitted_at ASC, ps.id ASC
            ) AS rn_first,
            ROW_NUMBER() OVER (
                PARTITION BY ps.generation_id
                ORDER BY ps.submitted_at DESC, ps.id DESC
            ) AS rn_last
        FROM provider_submissions ps
        JOIN outliers o ON o.generation_id = ps.generation_id
    ),
    keep AS (
        SELECT id FROM ranked WHERE rn_first <= {keep_first}
        UNION
        SELECT id FROM ranked WHERE rn_last <= {keep_last}
    )
    """


async def plan(
    session: AsyncSession,
    threshold: int,
    keep_first: int,
    keep_last: int,
) -> dict:
    """Compute the trim plan without modifying anything."""
    bind_params = {
        "threshold": threshold,
        "terminal_statuses": list(_TERMINAL_GEN_STATUSES),
    }

    cte = _build_keep_cte(keep_first, keep_last)

    # Outlier gens count + their total rows
    outlier_summary = (await session.execute(
        text("""
            SELECT
                COUNT(*) AS gen_count,
                COALESCE(SUM(n), 0) AS total_rows
            FROM (
                SELECT ps.generation_id, COUNT(*) AS n
                FROM provider_submissions ps
                JOIN generations g ON g.id = ps.generation_id
                WHERE ps.generation_id IS NOT NULL
                  AND ps.analysis_id IS NULL
                  AND g.status::text = ANY(:terminal_statuses)
                GROUP BY ps.generation_id
                HAVING COUNT(*) > :threshold
            ) o
        """),
        bind_params,
    )).first()

    # Rows that would be kept vs deleted
    keep_count = (await session.execute(
        text(cte + "SELECT COUNT(*) FROM keep"),
        bind_params,
    )).scalar_one()

    delete_count = (await session.execute(
        text(cte + """
            SELECT COUNT(*) FROM ranked
            WHERE id NOT IN (SELECT id FROM keep)
        """),
        bind_params,
    )).scalar_one()

    return {
        "outlier_gens": outlier_summary.gen_count,
        "outlier_total_rows": outlier_summary.total_rows,
        "rows_kept": keep_count,
        "rows_to_delete": delete_count,
    }


async def apply_trim(
    session: AsyncSession,
    threshold: int,
    keep_first: int,
    keep_last: int,
) -> int:
    """Execute the deletes; returns rowcount."""
    bind_params = {
        "threshold": threshold,
        "terminal_statuses": list(_TERMINAL_GEN_STATUSES),
    }
    cte = _build_keep_cte(keep_first, keep_last)
    result = await session.execute(
        text(cte + """
            DELETE FROM provider_submissions
            WHERE id IN (
                SELECT id FROM ranked WHERE id NOT IN (SELECT id FROM keep)
            )
        """),
        bind_params,
    )
    return result.rowcount


async def verify(engine, threshold: int) -> int:
    """Read-only sanity: count outlier generations that still exceed threshold.
    Returns count (0 = clean)."""
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        remaining = (await session.execute(
            text("""
                SELECT COUNT(*) FROM (
                    SELECT ps.generation_id
                    FROM provider_submissions ps
                    JOIN generations g ON g.id = ps.generation_id
                    WHERE ps.generation_id IS NOT NULL
                      AND ps.analysis_id IS NULL
                      AND g.status::text = ANY(:terminal_statuses)
                    GROUP BY ps.generation_id
                    HAVING COUNT(*) > :threshold
                ) o
            """),
            {
                "threshold": threshold,
                "terminal_statuses": list(_TERMINAL_GEN_STATUSES),
            },
        )).scalar_one()

        # Table size for context
        size_bytes = (await session.execute(
            text("SELECT pg_total_relation_size('provider_submissions')")
        )).scalar_one()

    print("Verify:")
    print(f"  Outlier gens still exceeding threshold ({threshold}): {remaining}")
    print(f"  provider_submissions table size: {size_bytes / 1024 / 1024:.0f} MB")
    return remaining


async def run(apply: bool, threshold: int, keep_first: int, keep_last: int) -> None:
    url = _get_database_url()
    engine = create_async_engine(url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            async with session.begin():
                p = await plan(session, threshold, keep_first, keep_last)
                deleted = 0
                if apply and p["rows_to_delete"]:
                    deleted = await apply_trim(session, threshold, keep_first, keep_last)
                if not apply:
                    await session.rollback()

        print(f"Mode: {'APPLY' if apply else 'DRY RUN'}")
        print(f"  threshold={threshold}, keep_first={keep_first}, keep_last={keep_last}")
        print(f"  Outlier generations: {p['outlier_gens']}")
        print(f"  Rows in outlier gens: {p['outlier_total_rows']}")
        print(f"  Rows kept (first {keep_first} + last {keep_last}): {p['rows_kept']}")
        print(f"  Rows to delete: {p['rows_to_delete']}")
        if apply:
            print(f"  Rows actually deleted: {deleted}")
            print()
            issues = await verify(engine, threshold)
            if issues:
                print(
                    f"NOTE: {issues} generations still exceed threshold "
                    "(may be expected if successes/provider_job_ids inflate keep set)."
                )
        else:
            print("  Dry run — pass --apply to commit.")
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true",
                        help="Commit the deletes (default is dry-run)")
    parser.add_argument("--verify", action="store_true",
                        help="Read-only sanity check; exits non-zero if outliers remain")
    parser.add_argument("--threshold", type=int, default=20,
                        help="Trim only generations with > N submissions (default: 20)")
    parser.add_argument("--keep-first", type=int, default=5,
                        help="Keep first K rows per outlier generation (default: 5)")
    parser.add_argument("--keep-last", type=int, default=3,
                        help="Keep last L rows per outlier generation (default: 3)")
    args = parser.parse_args()

    if args.verify and args.apply:
        parser.error("--verify and --apply are mutually exclusive")

    if args.verify:
        async def _run_verify() -> int:
            engine = create_async_engine(_get_database_url(), echo=False)
            try:
                return await verify(engine, args.threshold)
            finally:
                await engine.dispose()

        issues = asyncio.run(_run_verify())
        sys.exit(0 if issues == 0 else 1)

    asyncio.run(run(args.apply, args.threshold, args.keep_first, args.keep_last))


if __name__ == "__main__":
    main()
