#!/usr/bin/env python3
"""Render-only scoring pass for never-probed videos — no ffmpeg, no file.

Many videos were never signal-scanned because they have no local file: most
are tiered to the ``archive`` storage root (file lives on MinIO, addressed by
``stored_key``), so the local_path-only scanner skipped them. But the *primary*
signal — cohort-relative render time — comes from the generation's timing, not
the file. So this scores them from DB data alone: instant, no fetch, no decode.

Each result is a partial tagged ``scan_mode='render_only'`` (audio/visual null);
under the conservative model only a strong fast render flags broken without
corroboration. A later full ffmpeg probe (when a file is available) upgrades it.

Targets video assets with no prior score and a source generation; keyset
pagination over ``id`` keeps it flat. Works regardless of storage tier.

Usage:
    python tools/score_render_only.py                 # dry-run (default)
    python tools/score_render_only.py --apply          # persist
    python tools/score_render_only.py --limit 500      # cap (e.g. preview)
    python tools/score_render_only.py --chunk 1000     # rows per commit

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


def _never_probed_filter():
    """Video rows never scored, not at current version, with a source generation."""
    return (
        Asset.media_type == "VIDEO",
        Asset.is_archived == False,  # noqa: E712
        Asset.signal_score.is_(None),
        Asset.signal_scanner_version.is_distinct_from(SCANNER_VERSION),
        Asset.source_generation_id.isnot(None),
    )


async def run(apply: bool, limit: int | None, chunk: int) -> None:
    engine = create_async_engine(_get_database_url(), echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as session:
        baselines = await load_cohort_baselines(session)
        if not baselines:
            print("No cohort baselines — run refresh-signal-cohort-baselines first.")
            await engine.dispose()
            return
        total = (
            await session.execute(select(func.count()).select_from(Asset).where(*_never_probed_filter()))
        ).scalar_one()
        print(f"Cohort baselines: {len(baselines)} | never-probed videos w/ a generation: {total}")
        if not total:
            print("Nothing to do.")
            await engine.dispose()
            return

        svc = SignalAnalysisService(session)
        cursor: int | None = None
        processed = scored = broken = no_render = errors = 0

        while True:
            if limit is not None and processed >= limit:
                break
            conds = list(_never_probed_filter())
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
                try:
                    p = await svc.score_render_only(a, cohort_baselines=baselines, commit=False)
                except Exception as e:  # noqa: BLE001
                    errors += 1
                    print(f"  ! asset {a.id}: {e}")
                    continue
                if p is None:
                    no_render += 1  # cold cohort / no usable render time
                    continue
                scored += 1
                if p.get("suspicious"):
                    broken += 1

            if apply:
                await session.commit()
            print(
                f"  processed {processed}/{total if limit is None else min(limit, total)} "
                f"| scored {scored} | broken {broken} | no-render {no_render} | errors {errors}",
                flush=True,
            )

        if apply:
            from pixsim7.backend.main.services.asset.signal_stats_cache import (
                invalidate_signal_stats_cache,
            )
            await invalidate_signal_stats_cache(session)
            await record_backfill_applied(__file__, rows_affected=scored)
            print(f"\nApplied. Render-only scored {scored} videos ({broken} broken); "
                  f"{no_render} had no usable render context.")
        else:
            print(f"\nDry run — would render-only score {scored} videos "
                  f"({broken} broken, {no_render} skipped no-render). Pass --apply.")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="Persist (default is dry-run)")
    parser.add_argument("--limit", type=int, default=None, help="Cap rows processed (default: all)")
    parser.add_argument("--chunk", type=int, default=500, help="Rows per commit (default 500)")
    args = parser.parse_args()
    print(f"{'APPLYING' if args.apply else 'DRY RUN'}: render-only scoring to {SCANNER_VERSION}\n")
    asyncio.run(run(apply=args.apply, limit=args.limit, chunk=args.chunk))


if __name__ == "__main__":
    main()
