from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Dict, List, Optional
from sqlalchemy import select, func, case, Integer
from sqlalchemy.dialects.postgresql import JSONB
from pixsim7.backend.main.api.dependencies import CurrentAdminUser, DatabaseSession
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.services.asset.signal_scoring_params import ScoringParams
from pixsim_logging import get_logger
from .base import BackfillResultBase

router = APIRouter(tags=["assets-maintenance"])
logger = get_logger()


class SignalScanStatsResponse(BaseModel):
    """Coverage stats for the broken-video heuristic scan."""
    total_videos: int
    scanned: int
    unscanned: int
    broken: int
    clean: int
    borderline: int
    overridden: int
    scanner_version: str
    percentage: float


class BackfillSignalScanResponse(BackfillResultBase):
    """Result of a batch signal-scan backfill."""
    scanned: int
    broken: int


class CohortBucket(BaseModel):
    """Per-bucket duration distribution within one cohort."""
    count: int
    p10: Optional[float] = None
    p50: Optional[float] = None
    p90: Optional[float] = None


class CohortRow(BaseModel):
    """One generation cohort with per-bucket duration percentiles.

    `separation` is `(clean.p10 - suspicious.p90) / clean.p50` clamped to [-1, 1].
    Positive values = broken durations sit cleanly below clean ones (real signal).
    Near zero or negative = distributions overlap (noise).
    """
    provider: str
    operation_type: str
    model: Optional[str] = None
    quality: Optional[str] = None
    requested_length_sec: Optional[float] = None
    buckets: Dict[str, CohortBucket]
    suggested_threshold_sec: Optional[float] = None
    separation: Optional[float] = None
    n_total: int
    # The baseline the scorer actually uses for this cohort (persisted
    # render-time median + sample size), plus the effective "flag if faster
    # than" duration = weak render-ratio cutoff x median. None if the cohort
    # has no trusted baseline yet.
    baseline_p50_sec: Optional[float] = None
    baseline_n: Optional[int] = None
    flag_under_sec: Optional[float] = None


class SignalScanCohortsResponse(BaseModel):
    """Per-cohort duration breakdown for the broken-video heuristic."""
    cohorts: List[CohortRow]
    scanner_version: str
    min_clean_count: int
    min_suspicious_count: int
    sample_size: int
    sample_limit: int


@router.get("/signal-scan-stats", response_model=SignalScanStatsResponse)
async def get_signal_scan_stats(
    admin: CurrentAdminUser,
    db: DatabaseSession,
) -> SignalScanStatsResponse:
    """Coverage stats for the broken-video heuristic scan.

    Coverage is measured against the CURRENT scanner version: an asset counts
    as "scanned" only if its stored signal_metrics were stamped by the active
    SCANNER_VERSION. Entries from an older scanner (or none at all) count as
    "unscanned" so a model/threshold bump surfaces as work to re-scan rather
    than silently reading as 100% covered. Buckets (broken/borderline/clean)
    likewise count only current-version entries; overridden is version-agnostic
    (user labels persist across re-scans).
    """
    # Counts come from the denormalized signal_* columns (not the TOASTed
    # media_metadata blob) via a short-TTL cached snapshot — see
    # services/asset/signal_stats_cache.py. Writes (backfill, override) bust it.
    from pixsim7.backend.main.services.asset.signal_stats_cache import (
        get_signal_stats_cached,
    )

    stats = await get_signal_stats_cached(db, admin.id)
    return SignalScanStatsResponse(**stats)


@router.post("/backfill-signal-scan", response_model=BackfillSignalScanResponse)
async def backfill_signal_scan(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    limit: int = Query(default=100, ge=1, le=500, description="Max videos to scan"),
    reprobe: bool = Query(
        default=False,
        description=(
            "Re-run ffmpeg probes (slow, ~1s/clip, needs local file). Default "
            "False re-scores from already-stored metrics with no ffmpeg — the "
            "right mode for a scoring-model (SCANNER_VERSION) bump."
        ),
    ),
) -> BackfillSignalScanResponse:
    """Bring up to `limit` stale-version video assets to the current scanner.

    A SCANNER_VERSION bump changes only the SCORING, not the probes, so the
    default path (`reprobe=False`) recomputes scores from the audio/visual
    metrics already stored on each asset — no ffmpeg, no local file — folding
    in the cohort-relative render signal. This makes a full-library re-score a
    cheap DB pass instead of hours of decoding (and avoids the request
    timeouts the probe path hit on large batches).

    `reprobe=True` re-runs ffmpeg (for assets that were never probed, or to
    refresh the underlying metrics); it requires a local file and is slow.

    Either way the per-cohort render-time baselines are refreshed once up front
    and fed into the scorer.
    """
    from pixsim7.backend.main.services.asset.signal_analysis import (
        SCANNER_VERSION,
        SignalAnalysisService,
        stale_signal_video_conditions,
    )
    from pixsim7.backend.main.services.asset.cohort_baselines import (
        load_cohort_baselines,
        refresh_cohort_baselines,
    )

    await refresh_cohort_baselines(db, user_id=admin.id)
    baselines = await load_cohort_baselines(db)

    # Load the broken-audio fingerprint references (signalref:* clips with a
    # stored chroma_fp) once for the whole batch. Empty until those refs have
    # been probed under v5; matching then falls back to render + corroboration.
    from pixsim7.backend.main.services.asset.audio_fingerprint import (
        load_reference_fingerprints,
    )
    ref_fingerprints = await load_reference_fingerprints(db)

    # Select stale rows via the fast denormalized column (no media_metadata
    # de-TOAST). Reprobe mode needs a resolvable source to decode (shared with
    # the durable SignalBackfillService); default mode needs a prior score to
    # re-score from.
    if reprobe:
        conds = stale_signal_video_conditions(SCANNER_VERSION, admin.id)
    else:
        conds = [
            Asset.user_id == admin.id,
            Asset.media_type == "VIDEO",
            Asset.is_archived == False,  # noqa: E712
            Asset.signal_scanner_version.is_distinct_from(SCANNER_VERSION),
            Asset.signal_score.isnot(None),
        ]
    stmt = select(Asset).where(*conds).order_by(Asset.id.desc()).limit(limit)
    assets = (await db.execute(stmt)).scalars().all()

    service = SignalAnalysisService(db)
    scanned = 0
    broken = 0
    skipped = 0
    errors = 0
    processed = 0
    for asset in assets:
        processed += 1
        try:
            if reprobe:
                payload = await service.probe_and_stamp(
                    asset, force=True, commit=False, cohort_baselines=baselines,
                    ref_fingerprints=ref_fingerprints,
                )
            else:
                payload = await service.rescore_from_stored(
                    asset, commit=False, cohort_baselines=baselines,
                    ref_fingerprints=ref_fingerprints,
                )
        except Exception as e:  # noqa: BLE001 — surface but don't fail the batch
            logger.warning("signal_scan_backfill_failed", asset_id=asset.id, error=str(e))
            errors += 1
            continue
        if payload is None:
            skipped += 1
            continue
        scanned += 1
        if payload.get("suspicious"):
            broken += 1

    if scanned > 0 or skipped > 0:
        await db.commit()

    if scanned > 0:
        # Scores changed — drop the cached coverage snapshot.
        from pixsim7.backend.main.services.asset.signal_stats_cache import (
            invalidate_signal_stats_cache,
        )
        await invalidate_signal_stats_cache(db, admin.id)

    return BackfillSignalScanResponse(
        success=True,
        processed=processed,
        scanned=scanned,
        broken=broken,
        skipped=skipped,
        errors=errors,
    )


@router.post("/refresh-signal-cohort-baselines")
async def refresh_signal_cohort_baselines(
    admin: CurrentAdminUser,
    db: DatabaseSession,
) -> dict:
    """Recompute the per-cohort render-time baselines used by the scanner.

    Cheap aggregate (one query over completed video generations); persists the
    result to system_config. Does NOT re-score assets — run backfill-signal-scan
    for that (which also refreshes baselines first).
    """
    from pixsim7.backend.main.services.asset.cohort_baselines import (
        refresh_cohort_baselines,
    )

    summary = await refresh_cohort_baselines(db, user_id=admin.id)
    return {"success": True, **summary}


@router.get("/signal-scan-cohorts", response_model=SignalScanCohortsResponse)
async def get_signal_scan_cohorts(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    min_clean: int = Query(default=20, ge=0, le=10000),
    min_suspicious: int = Query(default=5, ge=0, le=10000),
    sample_limit: int = Query(default=3000, ge=100, le=20000),
) -> SignalScanCohortsResponse:
    """Per-cohort generation duration percentiles split by signal-scan score bucket.

    Cohort key: (provider_id, operation_type, model, quality, requested duration).
    Buckets: clean (score 0), borderline (1-2), suspicious (>=3), unscanned.

    For each cohort, the response includes a suggested duration threshold
    (the more conservative of `clean.p10` and `(clean.p10 + suspicious.p90)/2`)
    and a `separation` score so the UI can rank cohorts by how cleanly the
    duration signal actually distinguishes broken from clean clips.

    Bounded to the `sample_limit` most recent matching assets so the JSON
    extraction + percentile aggregation stays fast even on large libraries.
    Sparse cohorts (both buckets below their min thresholds) are dropped.
    """
    from pixsim7.backend.main.domain.generation.models import Generation
    from pixsim7.backend.main.services.asset.signal_analysis import (
        SCANNER_VERSION,
        load_scoring_params,
    )
    from pixsim7.backend.main.services.asset.cohort_baselines import (
        cohort_key,
        load_cohort_baselines,
    )

    # Live tuned thresholds so this diagnostic table's buckets + effective render
    # cutoff match what the scorer actually applies (see load_scoring_params).
    _params = load_scoring_params()

    # The render-time baselines the scorer actually divides by (persisted),
    # so the table can show each cohort's real reference + effective cutoff.
    baselines = await load_cohort_baselines(db)

    sm = func.cast(Asset.media_metadata, JSONB).op("->")("signal_metrics")
    score_text = sm.op("->>")("score")
    score_int = score_text.cast(Integer)

    bucket_expr = case(
        (score_text.is_(None), "unscanned"),
        (score_int >= _params.suspicious_threshold, "suspicious"),
        (score_int == 0, "clean"),
        else_="borderline",
    )

    cp = func.cast(Generation.canonical_params, JSONB)
    model_text = cp.op("->>")("model")
    quality_text = cp.op("->>")("quality")
    duration_text = cp.op("->>")("duration")

    # Wall-clock = our PENDING->PROCESSING transition to terminal completion.
    # Includes provider queue + compute (see lifecycle.py:112). For a fixed
    # cohort the bias is uniform, so within-cohort comparisons stay valid.
    duration_sec_expr = func.extract(
        "epoch", Generation.completed_at - Generation.started_at
    )

    # Inner: pull the latest N matching rows with cohort key + duration + bucket
    # already extracted. Bounding here keeps JSON parsing + percentile_cont work
    # proportional to sample_limit, not to the full library.
    inner = (
        select(
            Generation.provider_id.label("provider"),
            Generation.operation_type.label("operation_type"),
            model_text.label("model"),
            quality_text.label("quality"),
            duration_text.label("req_duration"),
            bucket_expr.label("bucket"),
            duration_sec_expr.label("dur"),
        )
        .select_from(Asset)
        .join(Generation, Generation.id == Asset.source_generation_id)
        .where(
            Asset.user_id == admin.id,
            Asset.media_type == "VIDEO",
            Asset.is_archived == False,  # noqa: E712
            Generation.started_at.isnot(None),
            Generation.completed_at.isnot(None),
        )
        .order_by(Asset.id.desc())
        .limit(sample_limit)
        .subquery()
    )

    p10 = func.percentile_cont(0.1).within_group(inner.c.dur.asc())
    p50 = func.percentile_cont(0.5).within_group(inner.c.dur.asc())
    p90 = func.percentile_cont(0.9).within_group(inner.c.dur.asc())

    stmt = (
        select(
            inner.c.provider,
            inner.c.operation_type,
            inner.c.model,
            inner.c.quality,
            inner.c.req_duration,
            inner.c.bucket,
            func.count().label("n"),
            p10.label("p10"),
            p50.label("p50"),
            p90.label("p90"),
        )
        .group_by(
            inner.c.provider,
            inner.c.operation_type,
            inner.c.model,
            inner.c.quality,
            inner.c.req_duration,
            inner.c.bucket,
        )
    )

    rows = (await db.execute(stmt)).all()

    # Pivot bucket-rows into per-cohort dicts
    cohorts: dict[tuple, dict] = {}
    for r in rows:
        op_str = r.operation_type.value if hasattr(r.operation_type, "value") else str(r.operation_type)
        key = (r.provider, op_str, r.model, r.quality, r.req_duration)
        cohort = cohorts.setdefault(key, {"buckets": {}, "n_total": 0})
        cohort["buckets"][r.bucket] = CohortBucket(
            count=int(r.n or 0),
            p10=float(r.p10) if r.p10 is not None else None,
            p50=float(r.p50) if r.p50 is not None else None,
            p90=float(r.p90) if r.p90 is not None else None,
        )
        cohort["n_total"] += int(r.n or 0)

    out: List[CohortRow] = []
    for (provider, op_str, model, quality, req_duration), data in cohorts.items():
        buckets = data["buckets"]
        clean = buckets.get("clean")
        susp = buckets.get("suspicious")

        # Drop cohorts where both relevant buckets are too sparse to read.
        clean_n = clean.count if clean else 0
        susp_n = susp.count if susp else 0
        if clean_n < min_clean and susp_n < min_suspicious:
            continue

        suggested: Optional[float] = None
        separation: Optional[float] = None
        if (
            clean and susp
            and clean.p10 is not None
            and susp.p90 is not None
            and clean.p50 is not None
            and clean.p50 > 0
        ):
            midpoint = (clean.p10 + susp.p90) / 2.0
            suggested = round(min(clean.p10, midpoint), 2)
            sep_raw = (clean.p10 - susp.p90) / clean.p50
            separation = round(max(-1.0, min(1.0, sep_raw)), 3)

        try:
            req_len = float(req_duration) if req_duration is not None else None
        except (TypeError, ValueError):
            req_len = None

        # Scorer's actual baseline for this cohort (persisted median over all
        # completed gens), and the effective flag threshold = weak cutoff x p50.
        bl = baselines.get(cohort_key(provider, op_str, model, quality, req_duration))
        bl_p50 = bl.get("p50") if bl else None
        bl_n = bl.get("n") if bl else None
        flag_under = round(_params.render_ratio_weak * bl_p50, 1) if bl_p50 else None

        out.append(CohortRow(
            provider=provider,
            operation_type=op_str,
            model=model,
            quality=quality,
            requested_length_sec=req_len,
            buckets=buckets,
            suggested_threshold_sec=suggested,
            separation=separation,
            n_total=int(data["n_total"]),
            baseline_p50_sec=bl_p50,
            baseline_n=bl_n,
            flag_under_sec=flag_under,
        ))

    # Best signal first; cohorts without a separation score sink to the bottom,
    # ordered by total count desc within each tier.
    out.sort(
        key=lambda c: (
            -(c.separation if c.separation is not None else -2.0),
            -c.n_total,
        )
    )

    sample_size = sum(
        b.count for data in cohorts.values() for b in data["buckets"].values()
    )

    return SignalScanCohortsResponse(
        cohorts=out,
        scanner_version=SCANNER_VERSION,
        min_clean_count=min_clean,
        min_suspicious_count=min_suspicious,
        sample_size=sample_size,
        sample_limit=sample_limit,
    )


@router.get("/signal-calibration")
async def get_signal_calibration(
    admin: CurrentAdminUser,
    db: DatabaseSession,
) -> dict:
    """Calibration report — the current model measured against your broken/clean
    flags (``signal_metrics.user_override``).

    Read-only and cheap (reads only the labelled rows' stored metrics, no
    probing). Returns confusion matrix + precision/recall vs labels, render-ratio
    distributions for broken vs clean and the F1-optimal cohort-relative cutoff,
    a signal-presence breakdown of broken labels, and a sufficiency gate. See
    services/asset/signal_calibration.py.
    """
    from pixsim7.backend.main.services.asset.signal_calibration import (
        compute_calibration,
    )

    return await compute_calibration(db, admin.id)


@router.post("/signal-calibration/preview")
async def preview_signal_calibration(
    candidate: ScoringParams,
    admin: CurrentAdminUser,
    db: DatabaseSession,
) -> dict:
    """Grade a CANDIDATE set of scoring thresholds against your broken/clean flags
    without changing anything.

    Body is a full ``ScoringParams`` (the live values + your edits). Re-scores the
    labelled clips' stored metrics with both the live params and the candidate and
    returns both confusion matrices, so the tuning panel can show the precision /
    recall delta BEFORE you save + rescore. Read-only and cheap (no probing). See
    services/asset/signal_calibration.preview_calibration.
    """
    from pixsim7.backend.main.services.asset.signal_calibration import (
        preview_calibration,
    )

    return await preview_calibration(db, admin.id, candidate)
