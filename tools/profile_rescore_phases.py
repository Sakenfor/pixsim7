#!/usr/bin/env python3
"""Profile where a signal-scan RESCORE spends its per-clip time: DB vs CPU.

Mirrors SignalAnalysisService.rescore_from_stored over a sample of the real
rescore population (scored videos), timing each phase separately:

  - select   : the batch SELECT (de-TOAST of media_metadata / chroma_fp read)
  - matcher  : _match_audio_ref  (pure-CPU fingerprint cross-correlation)
  - render   : render_context_for_asset  (per-asset DB query)
  - other    : payload build + attribute assignment (no commit)

Dry-run only (commit=False, rolled back) — never mutates. Tells us which lever
(parallelise matcher vs batch the render-context query) is worth implementing.

Usage:
    python tools/profile_rescore_phases.py --sample 400
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.services.asset.cohort_baselines import (
    load_cohort_baselines,
    render_context_for_asset,
)
from pixsim7.backend.main.services.asset.audio_fingerprint import (
    load_reference_fingerprints,
)
from pixsim7.backend.main.services.asset.signal_analysis import _match_audio_ref


def _get_database_url() -> str:
    from pixsim7.backend.main.shared.config import settings

    return settings.async_database_url


def _scope():
    # The rescore population: every scored, non-archived video (regardless of
    # version) — matches SignalBackfillService rescore _scope_conditions.
    return (
        Asset.media_type == "VIDEO",
        Asset.is_archived == False,  # noqa: E712
        Asset.signal_score.isnot(None),
    )


def _pct(x: float, total: float) -> str:
    return f"{(100.0 * x / total):.1f}%" if total else "n/a"


async def profile(sample: int) -> None:
    engine = create_async_engine(_get_database_url(), echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as session:
        baselines = await load_cohort_baselines(session)
        t0 = time.perf_counter()
        refs = await load_reference_fingerprints(session)
        t_refs = time.perf_counter() - t0
        print(
            f"baselines={len(baselines)} | pre-rotated refs={len(refs)} "
            f"(load {t_refs*1000:.0f}ms) | sample target={sample}"
        )

        # --- phase: SELECT (de-TOAST) -------------------------------------
        t0 = time.perf_counter()
        rows = (
            await session.execute(
                select(Asset).where(*_scope()).order_by(Asset.id.desc()).limit(sample)
            )
        ).scalars().all()
        t_select = time.perf_counter() - t0
        n = len(rows)
        if not n:
            print("No rows in scope.")
            await engine.dispose()
            return

        # Touch chroma_fp once so the JSONB is materialised inside the select
        # timing window above (SQLAlchemy lazy-loads attrs, but media_metadata
        # is a plain column so it's already resolved on fetch).
        with_fp = sum(
            1
            for a in rows
            if (a.media_metadata or {}).get("signal_metrics", {}).get("chroma_fp")
        )

        # --- per-asset phases ---------------------------------------------
        t_match = 0.0
        t_render = 0.0
        match_calls = 0
        render_ok = 0
        loop0 = time.perf_counter()
        for a in rows:
            sm = (a.media_metadata or {}).get("signal_metrics") or {}
            fp = sm.get("chroma_fp")

            t = time.perf_counter()
            _ = _match_audio_ref(fp, refs)
            t_match += time.perf_counter() - t
            if fp:
                match_calls += 1

            t = time.perf_counter()
            try:
                rc = await render_context_for_asset(session, a, baselines)
                if rc is not None:
                    render_ok += 1
            except Exception:  # noqa: BLE001
                rc = None
            t_render += time.perf_counter() - t
        loop_wall = time.perf_counter() - loop0

        per_clip_ms = loop_wall / n * 1000
        accounted = t_match + t_render
        other = max(0.0, loop_wall - accounted)

        print(f"\nsampled {n} clips | {with_fp} have chroma_fp ({_pct(with_fp, n)})")
        print(f"select/de-TOAST batch : {t_select*1000:8.0f} ms total "
              f"({t_select/n*1000:.2f} ms/clip)")
        print(f"per-clip loop wall    : {loop_wall*1000:8.0f} ms total "
              f"({per_clip_ms:.2f} ms/clip)\n")
        print("  phase breakdown (within loop):")
        print(f"    matcher (CPU)     : {t_match*1000:8.0f} ms  {_pct(t_match, loop_wall):>6}  "
              f"| {t_match/max(1,match_calls)*1000:.3f} ms per fp-clip")
        print(f"    render_ctx (DB)   : {t_render*1000:8.0f} ms  {_pct(t_render, loop_wall):>6}  "
              f"| {t_render/n*1000:.3f} ms/clip ({render_ok} returned ctx)")
        print(f"    other (build/etc) : {other*1000:8.0f} ms  {_pct(other, loop_wall):>6}")
        print(f"\n  throughput ~ {n/loop_wall*60:.0f} clips/min "
              f"(+ {t_select/n*1000:.2f} ms/clip select amortised over batch)")

        verdict = "CPU-bound (matcher)" if t_match > t_render else "DB-bound (render_ctx + select)"
        print(f"\n  => looks {verdict}")
        await session.rollback()

    await engine.dispose()


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--sample", type=int, default=400, help="clips to profile (default 400)")
    args = p.parse_args()
    asyncio.run(profile(args.sample))


if __name__ == "__main__":
    main()
