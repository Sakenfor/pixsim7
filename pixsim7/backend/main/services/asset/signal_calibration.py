"""Calibration report — measure the video-health model against user labels.

Closes the feedback loop the scanner was always pointed at: you flag videos
``broken`` / ``clean`` as you browse (``signal_metrics.user_override``), and
this turns those labels into a verdict on the current detector plus concrete
threshold suggestions.

Read-only. Reuses the stored per-asset metrics from the last scan
(``render_ratio``, score, audio/visual values) so it needs no probing.

What it reports:
  * confusion matrix + precision/recall/F1 of the current model (``suspicious``
    flag) against your labels;
  * render-ratio distributions for your broken vs clean labels, and the single
    cohort-relative cutoff that best separates them (swept to maximize F1);
  * which signals actually carry your broken labels (render-fast / audio-quiet /
    visual-static), exposing blind spots;
  * an honest sufficiency gate — below ``MIN_PER_CLASS`` labelled per class the
    numbers are informational only.

Sister to the scorer in ``signal_analysis.py`` (whose thresholds this would
inform) and the cohort baselines in ``cohort_baselines.py``.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.assets.models import Asset

# Below this many labels per class, treat the report as directional only.
MIN_PER_CLASS = 20


def _percentile(values: list[float], q: float) -> Optional[float]:
    """Linear-interpolated percentile (q in 0..1); None for empty input."""
    if not values:
        return None
    s = sorted(values)
    if len(s) == 1:
        return round(s[0], 3)
    pos = q * (len(s) - 1)
    lo = int(pos)
    frac = pos - lo
    hi = min(lo + 1, len(s) - 1)
    return round(s[lo] + (s[hi] - s[lo]) * frac, 3)


def _prf(tp: int, fp: int, fn: int) -> dict[str, float]:
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    return {"precision": round(precision, 3), "recall": round(recall, 3), "f1": round(f1, 3)}


def _best_render_cutoff(labeled: list[tuple[float, bool]]) -> Optional[dict[str, Any]]:
    """Sweep render-ratio cutoffs; pick the one maximizing F1.

    ``labeled`` is [(render_ratio, is_broken)] for rows that HAVE a ratio.
    Predicts broken when ratio < cutoff (faster-than-cohort = more suspicious).
    """
    rated = [(r, b) for r, b in labeled if r is not None]
    if not rated or not any(b for _, b in rated) or all(b for _, b in rated):
        return None  # need both classes among rated rows
    # Candidate cutoffs: just above each observed ratio, so "ratio < cutoff"
    # can include that point.
    cands = sorted({round(r + 1e-6, 6) for r, _ in rated})
    best = None
    for c in cands:
        tp = sum(1 for r, b in rated if r < c and b)
        fp = sum(1 for r, b in rated if r < c and not b)
        fn = sum(1 for r, b in rated if r >= c and b)
        m = _prf(tp, fp, fn)
        key = (m["f1"], m["recall"], -c)  # tie-break: recall, then lower cutoff
        if best is None or key > best["_key"]:
            best = {"cutoff": round(c, 3), **m, "_key": key}
    if best:
        best.pop("_key", None)
    return best


async def compute_calibration(db: AsyncSession, user_id: int) -> dict[str, Any]:
    """Build the calibration report for a user's flagged videos."""
    from pixsim7.backend.main.services.asset.signal_analysis import (
        RMS_DB_THRESHOLD,
        PEAK_DB_THRESHOLD,
        PHASH_FIRST_TO_LAST_THRESHOLD,
        PHASH_MEAN_DIV_THRESHOLD,
        RENDER_RATIO_WEAK,
        SUSPICIOUS_THRESHOLD,
        SCANNER_VERSION,
    )

    rows = (
        await db.execute(
            select(Asset.media_metadata).where(
                Asset.user_id == user_id,
                Asset.media_type == "VIDEO",
                Asset.is_archived == False,  # noqa: E712
                Asset.signal_override.isnot(None),
            )
        )
    ).all()

    broken: list[dict[str, Any]] = []
    clean: list[dict[str, Any]] = []
    for (meta,) in rows:
        sm = (meta or {}).get("signal_metrics") or {}
        label = sm.get("user_override")
        if label not in ("broken", "clean"):
            continue
        (broken if label == "broken" else clean).append(sm)

    n_broken, n_clean = len(broken), len(clean)
    report: dict[str, Any] = {
        "scanner_version": SCANNER_VERSION,
        "labels": {"broken": n_broken, "clean": n_clean, "total": n_broken + n_clean},
        "sufficient": n_broken >= MIN_PER_CLASS and n_clean >= MIN_PER_CLASS,
        "min_per_class": MIN_PER_CLASS,
    }
    if n_broken == 0 and n_clean == 0:
        report["recommendation"] = "No labels yet — flag some videos broken/clean as you browse."
        return report

    def is_quiet(sm: dict) -> bool:
        rms, peak = sm.get("audio_rms_db"), sm.get("audio_peak_db")
        return (rms is not None and rms < RMS_DB_THRESHOLD) or (
            peak is not None and peak < PEAK_DB_THRESHOLD
        )

    def is_static(sm: dict) -> bool:
        f2l, mdf = sm.get("phash_first_to_last"), sm.get("phash_mean_div_from_first")
        return (f2l is not None and f2l < PHASH_FIRST_TO_LAST_THRESHOLD) or (
            mdf is not None and mdf < PHASH_MEAN_DIV_THRESHOLD
        )

    def predicted_broken(sm: dict) -> bool:
        s = sm.get("suspicious")
        if s is not None:
            return bool(s)
        sc = sm.get("score")
        return sc is not None and sc >= SUSPICIOUS_THRESHOLD

    # Confusion matrix of the current model vs labels.
    tp = sum(1 for sm in broken if predicted_broken(sm))
    fn = n_broken - tp
    fp = sum(1 for sm in clean if predicted_broken(sm))
    tn = n_clean - fp
    total = n_broken + n_clean
    report["current_model"] = {
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "accuracy": round((tp + tn) / total, 3) if total else 0.0,
        **_prf(tp, fp, fn),
    }

    # Render-ratio separation + best cutoff.
    rr_broken = [sm["render_ratio"] for sm in broken if sm.get("render_ratio") is not None]
    rr_clean = [sm["render_ratio"] for sm in clean if sm.get("render_ratio") is not None]
    report["render_ratio"] = {
        "broken": {
            "n": len(rr_broken),
            "p10": _percentile(rr_broken, 0.1),
            "p50": _percentile(rr_broken, 0.5),
            "p90": _percentile(rr_broken, 0.9),
        },
        "clean": {
            "n": len(rr_clean),
            "p10": _percentile(rr_clean, 0.1),
            "p50": _percentile(rr_clean, 0.5),
            "p90": _percentile(rr_clean, 0.9),
        },
        "current_weak_cutoff": RENDER_RATIO_WEAK,
        "suggested_cutoff": _best_render_cutoff(
            [(sm.get("render_ratio"), True) for sm in broken]
            + [(sm.get("render_ratio"), False) for sm in clean]
        ),
    }

    # Which signals carry the broken labels (blind-spot finder).
    if n_broken:
        rfast = sum(1 for sm in broken if (sm.get("render_ratio") or 99) < RENDER_RATIO_WEAK)
        quiet = sum(1 for sm in broken if is_quiet(sm))
        static = sum(1 for sm in broken if is_static(sm))
        none = sum(
            1 for sm in broken
            if not ((sm.get("render_ratio") or 99) < RENDER_RATIO_WEAK or is_quiet(sm) or is_static(sm))
        )
        report["broken_signal_presence"] = {
            "render_fast": rfast,
            "audio_quiet": quiet,
            "visual_static": static,
            "no_signal": none,  # broken clips the model has NO signal for — true blind spots
            "of_total": n_broken,
        }

    # Headline recommendation.
    if not report["sufficient"]:
        report["recommendation"] = (
            f"Directional only — need >= {MIN_PER_CLASS} labels per class "
            f"(have broken={n_broken}, clean={n_clean}). Keep flagging, "
            f"especially CLEAN on any false positives, to tune precision."
        )
    else:
        cm = report["current_model"]
        sug = report["render_ratio"]["suggested_cutoff"]
        parts = [
            f"Current model: precision {cm['precision']}, recall {cm['recall']} "
            f"({cm['fp']} false positives, {cm['fn']} misses)."
        ]
        if sug:
            parts.append(
                f"Best render cutoff vs your labels: ratio < {sug['cutoff']} "
                f"(F1 {sug['f1']}) vs current weak cutoff {RENDER_RATIO_WEAK}."
            )
        bsp = report.get("broken_signal_presence")
        if bsp and bsp["no_signal"]:
            parts.append(
                f"{bsp['no_signal']}/{bsp['of_total']} broken clips trip NO current "
                f"signal — a blind spot needing a new feature."
            )
        report["recommendation"] = " ".join(parts)

    return report
