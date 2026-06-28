#!/usr/bin/env python3
"""Backfill audio_ref_match for clips ingested WITHOUT the fingerprint matcher.

Until fix(signal) d844278dc, the ingest path scored fresh clips with no
references loaded, so every video generated after the last full rescore got
``audio_ref_match = None`` — missing the primary v5 audio signal — until a
rescore. This re-applies the matcher (no ffmpeg) over a bounded id range (the
clips above the last rescore's cursor), loading the signalref:* references the
ingest path skipped. Idempotent: clips that don't match any reference stay None.

Keyset pagination over id keeps memory flat. Dry-run by default.

Usage:
    python tools/backfill_null_audio_ref.py --min-id 185416            # dry-run
    python tools/backfill_null_audio_ref.py --min-id 185416 --apply    # persist
    python tools/backfill_null_audio_ref.py --min-id 185416 --chunk 300
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
from pixsim7.backend.main.services.asset.signal_analysis import SignalAnalysisService
from pixsim7.backend.main.services.asset.cohort_baselines import load_cohort_baselines
from pixsim7.backend.main.services.asset.audio_fingerprint import (
    load_reference_fingerprints,
)


def _get_database_url() -> str:
    from pixsim7.backend.main.shared.config import settings

    return settings.async_database_url


def _scope(min_id: int):
    return (
        Asset.media_type == "VIDEO",
        Asset.is_archived == False,  # noqa: E712
        Asset.signal_score.isnot(None),
        Asset.id > min_id,
    )


async def run(apply: bool, min_id: int, chunk: int) -> None:
    engine = create_async_engine(_get_database_url(), echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as session:
        baselines = await load_cohort_baselines(session)
        refs = await load_reference_fingerprints(session)
        total = (
            await session.execute(select(func.count()).select_from(Asset).where(*_scope(min_id)))
        ).scalar_one()
        print(f"references: {len(refs)} rotated | cohort baselines: {len(baselines)} "
              f"| videos id>{min_id}: {total}")
        if not total:
            print("Nothing to do.")
            await engine.dispose()
            return

        svc = SignalAnalysisService(session)
        cursor: int | None = None
        processed = matched = newly_matched = broken = skipped = 0

        while True:
            conds = list(_scope(min_id))
            if cursor is not None:
                conds.append(Asset.id > cursor)
            rows = (
                await session.execute(
                    select(Asset).where(*conds).order_by(Asset.id.asc()).limit(chunk)
                )
            ).scalars().all()
            if not rows:
                break
            cursor = rows[-1].id

            for a in rows:
                processed += 1
                prev = (a.media_metadata or {}).get("signal_metrics", {}).get("audio_ref_match")
                p = await svc.rescore_from_stored(
                    a, commit=False, cohort_baselines=baselines, ref_fingerprints=refs
                )
                if p is None:
                    skipped += 1
                    continue
                arm = p.get("audio_ref_match")
                if arm is not None:
                    matched += 1
                    if prev is None:
                        newly_matched += 1
                if p.get("suspicious"):
                    broken += 1

            if apply:
                await session.commit()
            else:
                session.expunge_all()
            print(f"  processed {processed}/{total} | matched {matched} "
                  f"(newly {newly_matched}) | broken {broken} | skipped {skipped}", flush=True)

        if apply:
            from pixsim7.backend.main.services.asset.signal_stats_cache import (
                invalidate_signal_stats_cache,
            )
            await invalidate_signal_stats_cache(session)
            print(f"\nApplied. {newly_matched} clips gained an audio_ref_match "
                  f"across {processed} re-scored rows.")
        else:
            print(f"\nDry run — would re-score {processed} rows "
                  f"({newly_matched} would gain a match, {broken} would be broken). Pass --apply.")

    await engine.dispose()


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--apply", action="store_true", help="Persist (default dry-run)")
    p.add_argument("--min-id", type=int, required=True,
                   help="Only clips with id greater than this (the last rescore cursor)")
    p.add_argument("--chunk", type=int, default=300, help="Rows per commit (default 300)")
    args = p.parse_args()
    print(f"{'APPLYING' if args.apply else 'DRY RUN'}: audio_ref_match backfill for id>{args.min_id}\n")
    asyncio.run(run(apply=args.apply, min_id=args.min_id, chunk=args.chunk))


if __name__ == "__main__":
    main()
