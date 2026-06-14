"""Per-cohort render-time baselines for the broken-video heuristic.

The signal scanner's primary signal is *cohort-relative generation time*: a
clip that rendered much faster than the typical clip in its cohort
(provider / operation / model / quality / requested-duration) is likely a
fast-failed generation (model bailed early, returned a canned rejection).

Computing that needs a per-cohort baseline (median render seconds), which the
per-asset scan path doesn't have on its own.  Rather than a dedicated table
(only ~dozens of cohorts exist) we persist a single regenerable JSON blob in
``system_config`` and refresh it from a batch pass.  The scorer reads the
cached map at scan time; cold cohorts (n < MIN_COHORT_N) yield no render
signal and the scorer falls back to corroboration-only.

Shape of the stored blob (namespace ``signal_scan_cohort_baselines``)::

    {
      "refreshed_at": ISO8601,
      "min_cohort_n": 20,
      "cohorts": {
        "<cohort_key>": {"p10": float, "p50": float, "n": int},
        ...
      }
    }

``<cohort_key>`` is the pipe-joined, lower-cased cohort tuple (see
``cohort_key``) so it round-trips cleanly through JSON object keys.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.services.system_config.service import get_config, set_config
from pixsim_logging import get_logger

logger = get_logger()

BASELINE_NAMESPACE = "signal_scan_cohort_baselines"

# A cohort needs at least this many completed generations before its baseline
# is trusted as a render-time reference. Below it, the scorer gets no render
# signal (cold-start) and leans on corroborating audio/visual only.
MIN_COHORT_N = 20


def _norm(v: Any) -> str:
    """Normalize a cohort key component to a stable string token.

    Enum values collapse to their ``.value``; ``None`` becomes the literal
    ``"_"`` so a missing model/quality/duration stays a distinct, stable slot.
    """
    if v is None:
        return "_"
    v = getattr(v, "value", v)
    return str(v).strip().lower()


def cohort_key(
    provider_id: Any,
    operation_type: Any,
    model: Any,
    quality: Any,
    req_duration: Any,
) -> str:
    """Build the stable string key for a cohort tuple."""
    return "|".join(
        _norm(x) for x in (provider_id, operation_type, model, quality, req_duration)
    )


# ---------------------------------------------------------------------------
# Refresh (batch) — recompute baselines from generations ⨝ assets
# ---------------------------------------------------------------------------

async def refresh_cohort_baselines(
    db: AsyncSession,
    *,
    user_id: Optional[int] = None,
) -> dict[str, Any]:
    """Recompute per-cohort render-time baselines and persist the blob.

    Aggregates completed video generations into per-cohort p10/p50/n of
    wall-clock render seconds (``completed_at - started_at``). Returns a
    summary dict ``{cohorts, trusted, refreshed_at}``.
    """
    # Local import to avoid a module-load cycle (generation domain imports
    # asset services in places).
    from pixsim7.backend.main.domain.generation.models import Generation

    cp = func.cast(Generation.canonical_params, JSONB)
    model_text = cp.op("->>")("model")
    quality_text = cp.op("->>")("quality")
    duration_text = cp.op("->>")("duration")
    dur_expr = func.extract(
        "epoch", Generation.completed_at - Generation.started_at
    )

    inner = (
        select(
            Generation.provider_id.label("provider"),
            Generation.operation_type.label("op"),
            model_text.label("model"),
            quality_text.label("quality"),
            duration_text.label("req_dur"),
            dur_expr.label("dur"),
        )
        .select_from(Asset)
        .join(Generation, Generation.id == Asset.source_generation_id)
        .where(
            Asset.media_type == "VIDEO",
            Asset.is_archived == False,  # noqa: E712
            Generation.started_at.isnot(None),
            Generation.completed_at.isnot(None),
            dur_expr > 0,
        )
        .subquery()
    )

    p10 = func.percentile_cont(0.1).within_group(inner.c.dur.asc())
    p50 = func.percentile_cont(0.5).within_group(inner.c.dur.asc())

    stmt = (
        select(
            inner.c.provider,
            inner.c.op,
            inner.c.model,
            inner.c.quality,
            inner.c.req_dur,
            func.count().label("n"),
            p10.label("p10"),
            p50.label("p50"),
        )
        .group_by(
            inner.c.provider,
            inner.c.op,
            inner.c.model,
            inner.c.quality,
            inner.c.req_dur,
        )
    )

    rows = (await db.execute(stmt)).all()

    cohorts: dict[str, dict[str, Any]] = {}
    trusted = 0
    for r in rows:
        n = int(r.n or 0)
        if r.p50 is None or r.p50 <= 0:
            continue
        key = cohort_key(r.provider, r.op, r.model, r.quality, r.req_dur)
        cohorts[key] = {
            "p10": round(float(r.p10), 2) if r.p10 is not None else None,
            "p50": round(float(r.p50), 2),
            "n": n,
        }
        if n >= MIN_COHORT_N:
            trusted += 1

    refreshed_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    blob = {
        "refreshed_at": refreshed_at,
        "min_cohort_n": MIN_COHORT_N,
        "cohorts": cohorts,
    }
    await set_config(db, BASELINE_NAMESPACE, blob, user_id=user_id)
    logger.info(
        "signal_scan_baselines_refreshed",
        cohorts=len(cohorts),
        trusted=trusted,
    )
    return {"cohorts": len(cohorts), "trusted": trusted, "refreshed_at": refreshed_at}


# ---------------------------------------------------------------------------
# Read path — load cached baselines + compute a render ratio for an asset
# ---------------------------------------------------------------------------

async def load_cohort_baselines(db: AsyncSession) -> dict[str, dict[str, Any]]:
    """Return the cached ``{cohort_key: {p10, p50, n}}`` map (empty if unset)."""
    blob = await get_config(db, BASELINE_NAMESPACE)
    if not blob:
        return {}
    return dict(blob.get("cohorts") or {})


async def render_context_for_asset(
    db: AsyncSession,
    asset: Asset,
    baselines: dict[str, dict[str, Any]],
) -> Optional[dict[str, Any]]:
    """Compute the cohort-relative render context for ``asset``.

    Returns ``{render_ratio, cohort_n, cohort_p50_sec}`` when the asset's
    source generation has a usable render time AND its cohort baseline is
    trusted (n >= MIN_COHORT_N); otherwise ``None`` (cold cohort / no render
    time / no generation link).
    """
    gen_id = getattr(asset, "source_generation_id", None)
    if not gen_id or not baselines:
        return None

    from pixsim7.backend.main.domain.generation.models import Generation

    gen = (
        await db.execute(select(Generation).where(Generation.id == gen_id))
    ).scalar_one_or_none()
    if gen is None or gen.started_at is None or gen.completed_at is None:
        return None

    dur = (gen.completed_at - gen.started_at).total_seconds()
    if dur <= 0:
        return None

    params = gen.canonical_params or {}
    key = cohort_key(
        gen.provider_id,
        gen.operation_type,
        params.get("model"),
        params.get("quality"),
        params.get("duration"),
    )
    baseline = baselines.get(key)
    if not baseline:
        return None
    n = int(baseline.get("n") or 0)
    p50 = baseline.get("p50")
    if n < MIN_COHORT_N or not p50 or p50 <= 0:
        return None

    return {
        "render_ratio": round(dur / float(p50), 3),
        "cohort_n": n,
        "cohort_p50_sec": float(p50),
    }
