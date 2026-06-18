#!/usr/bin/env python3
"""One-shot bulk re-score of video-health (signal-scan) scores to the current
SCANNER_VERSION — WITHOUT ffmpeg.

A SCANNER_VERSION bump changes only the SCORING, not the probes, so every
already-scanned video can be brought current by recomputing from its stored
audio/visual metrics plus the cohort-relative render signal — no decoding, no
local file. This clears the whole stale backlog in one run instead of clicking
the 200-at-a-time maintenance "Scan" button (which now uses the same ffmpeg-free
path, but in request-sized batches).

Reuses ``SignalAnalysisService.rescore_from_stored`` so the scoring stays
identical to the live path. Keyset pagination over ``id`` keeps memory flat and
never re-processes a row.

Usage:
    python tools/rescore_signal_v2.py                 # dry-run (default)
    python tools/rescore_signal_v2.py --apply          # persist
    python tools/rescore_signal_v2.py --limit 500      # cap rows (e.g. preview)
    python tools/rescore_signal_v2.py --chunk 1000     # rows per commit

Requires DATABASE_URL (or PIXSIM_DATABASE_URL) in env or .env file.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.services.asset.signal_analysis import (
    SCANNER_VERSION,
    SignalAnalysisService,
)
from pixsim7.backend.main.services.asset.cohort_baselines import load_cohort_baselines
from pixsim7.backend.main.services.diagnostics.applied_ledger import record_backfill_applied


def _get_database_url() -> str:
    from pixsim7.backend.main.shared.config import settings

    return settings.async_database_url


def _stale_filter():
    """Video rows with a prior score but not at the current scanner version."""
    return (
        Asset.media_type == "VIDEO",
        Asset.is_archived == False,  # noqa: E712
        Asset.signal_score.isnot(None),
        Asset.signal_scanner_version.is_distinct_from(SCANNER_VERSION),
    )


async def rescore(apply: bool, limit: int | None, chunk: int) -> None:
    engine = create_async_engine(_get_database_url(), echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as session:
        baselines = await load_cohort_baselines(session)
        total = (
            await session.execute(select(func.count()).select_from(Asset).where(*_stale_filter()))
        ).scalar_one()
        print(f"Cohort baselines: {len(baselines)} | stale-scored videos: {total}")
        if not total:
            print("Nothing to do.")
            await engine.dispose()
            return

        svc = SignalAnalysisService(session)
        cursor: int | None = None
        processed = changed = with_render = broken = skipped = errors = 0

        while True:
            if limit is not None and processed >= limit:
                break
            conds = list(_stale_filter())
            if cursor is not None:
                conds.append(Asset.id < cursor)
            take = chunk if limit is None else min(chunk, limit - processed)
            rows = (
                await session.execute(
                    select(Asset).where(*conds).order_by(Asset.id.desc()).limit(take)
                )
            ).scalars().all()
            if not rows:
                break
            cursor = rows[-1].id

            for a in rows:
                processed += 1
                old = (a.media_metadata or {}).get("signal_metrics", {}).get("score")
                try:
                    p = await svc.rescore_from_stored(a, commit=False, cohort_baselines=baselines)
                except Exception as e:  # noqa: BLE001
                    errors += 1
                    print(f"  ! asset {a.id}: {e}")
                    continue
                if p is None:
                    skipped += 1
                    continue
                if p.get("render_ratio") is not None:
                    with_render += 1
                if p.get("suspicious"):
                    broken += 1
                if p.get("score") != old:
                    changed += 1

            if apply:
                await session.commit()
            print(
                f"  processed {processed}/{total if limit is None else min(limit, total)} "
                f"| changed {changed} | broken {broken} | render {with_render} "
                f"| skipped {skipped} | errors {errors}",
                flush=True,
            )

        if apply:
            # Drop cached coverage snapshot so the dashboard reflects new scores.
            from pixsim7.backend.main.services.asset.signal_stats_cache import (
                invalidate_signal_stats_cache,
            )
            await invalidate_signal_stats_cache(session)
            await record_backfill_applied(__file__, rows_affected=changed)
            print(f"\nApplied. {changed} scores changed across {processed} re-scored rows.")
        else:
            print(
                f"\nDry run — would re-score {processed} rows "
                f"({changed} would change, {broken} would be broken). Pass --apply."
            )

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="Persist (default is dry-run)")
    parser.add_argument("--limit", type=int, default=None, help="Cap rows processed (default: all)")
    parser.add_argument("--chunk", type=int, default=500, help="Rows per commit (default 500)")
    args = parser.parse_args()
    print(f"{'APPLYING' if args.apply else 'DRY RUN'}: re-score signal scores to {SCANNER_VERSION}\n")
    asyncio.run(rescore(apply=args.apply, limit=args.limit, chunk=args.chunk))


if __name__ == "__main__":
    main()
