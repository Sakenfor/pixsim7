#!/usr/bin/env python3
"""Print the video-health calibration report — model vs your broken/clean labels.

Read-only. Reuses each asset's stored scan metrics, so no probing. Run it once
you've flagged a meaningful number of videos (>= ~20 broken and ~20 clean) to
see how well the current detector matches your judgment and what render-time
cutoff would best separate your labels.

Usage:
    python tools/signal_calibration_report.py
    python tools/signal_calibration_report.py --user-id 1
    python tools/signal_calibration_report.py --json     # raw report dict

Requires DATABASE_URL (or PIXSIM_DATABASE_URL) in env or .env file.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from pixsim7.backend.main.services.asset.signal_calibration import compute_calibration


def _get_database_url() -> str:
    from pixsim7.backend.main.shared.config import settings

    return settings.async_database_url


def _print_human(r: dict) -> None:
    lab = r["labels"]
    print(f"Scanner version: {r['scanner_version']}")
    print(f"Labels: {lab['broken']} broken, {lab['clean']} clean ({lab['total']} total)")
    print(f"Sufficient for calibration (>= {r['min_per_class']}/class): {r['sufficient']}")

    cm = r.get("current_model")
    if cm:
        print("\nCurrent model vs your labels:")
        print(f"  TP {cm['tp']}  FP {cm['fp']}  FN {cm['fn']}  TN {cm['tn']}")
        print(f"  precision {cm['precision']}  recall {cm['recall']}  f1 {cm['f1']}  accuracy {cm['accuracy']}")

    rr = r.get("render_ratio")
    if rr:
        b, c = rr["broken"], rr["clean"]
        print("\nRender ratio (vs cohort median) — lower = faster-failed:")
        print(f"  broken (n={b['n']}): p10 {b['p10']}  p50 {b['p50']}  p90 {b['p90']}")
        print(f"  clean  (n={c['n']}): p10 {c['p10']}  p50 {c['p50']}  p90 {c['p90']}")
        sug = rr.get("suggested_cutoff")
        if sug:
            print(f"  suggested cutoff: ratio < {sug['cutoff']}  (precision {sug['precision']}, "
                  f"recall {sug['recall']}, f1 {sug['f1']})  | current weak cutoff {rr['current_weak_cutoff']}")
        else:
            print(f"  suggested cutoff: (need both classes with render ratios) | current weak {rr['current_weak_cutoff']}")

    bsp = r.get("broken_signal_presence")
    if bsp:
        print("\nWhich signals your broken labels trip:")
        print(f"  render-fast {bsp['render_fast']}  audio-quiet {bsp['audio_quiet']}  "
              f"visual-static {bsp['visual_static']}  NO-signal {bsp['no_signal']}  (of {bsp['of_total']})")

    print(f"\n>> {r['recommendation']}")


async def run(user_id: int, as_json: bool) -> None:
    engine = create_async_engine(_get_database_url(), echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as session:
        report = await compute_calibration(session, user_id)
    await engine.dispose()
    if as_json:
        print(json.dumps(report, indent=2))
    else:
        _print_human(report)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--user-id", type=int, default=1, help="User to report on (default 1)")
    parser.add_argument("--json", action="store_true", help="Emit raw JSON report")
    args = parser.parse_args()
    asyncio.run(run(args.user_id, args.json))


if __name__ == "__main__":
    main()
