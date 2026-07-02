from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, case
from pixsim7.backend.main.api.dependencies import CurrentAdminUser, DatabaseSession
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.domain.enums import MediaType
from pixsim_logging import get_logger
from .base import BackfillResultBase

router = APIRouter(tags=["assets-maintenance"])
logger = get_logger()


class PreviewBackfillStats(BaseModel):
    """Preview derivative coverage statistics."""
    total_assets: int
    with_preview: int
    eligible_no_preview: int
    upgradeable: int
    not_eligible: int
    percentage: float
    target_size: int
    prev_cap: int


class BackfillPreviewsResponse(BackfillResultBase):
    """Response from preview backfill enqueue operation."""
    enqueued: int
    error_ids: list[int] = []


@router.get("/preview-backfill-stats", response_model=PreviewBackfillStats)
async def preview_backfill_stats(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    prev_cap: int = Query(
        800, ge=0, le=10000,
        description="Assumed prior preview_size cap (px). Sources larger than this "
                    "with an existing preview are reported as 'upgradeable'.",
    ),
):
    """Return preview coverage and regen backlog counts for the caller."""
    from pixsim7.backend.main.services.media.derivatives import _MIN_PREVIEW_SOURCE_SIZE
    from pixsim7.backend.main.services.media.settings import get_media_settings

    target_size = get_media_settings().preview_size[0]
    # COALESCE handles assets with NULL dimensions — they bucket as not_eligible.
    max_dim = func.coalesce(func.greatest(Asset.width, Asset.height), 0)
    has_preview = Asset.preview_key.isnot(None)

    q = select(
        func.count().label("total_assets"),
        func.coalesce(
            func.sum(case((has_preview, 1), else_=0)), 0
        ).label("with_preview"),
        func.coalesce(
            func.sum(case(
                (
                    (Asset.preview_key.is_(None)) & (max_dim >= _MIN_PREVIEW_SOURCE_SIZE),
                    1,
                ),
                else_=0,
            )),
            0,
        ).label("eligible_no_preview"),
        func.coalesce(
            func.sum(case(
                (has_preview & (max_dim > prev_cap), 1),
                else_=0,
            )),
            0,
        ).label("upgradeable"),
        func.coalesce(
            func.sum(case((max_dim < _MIN_PREVIEW_SOURCE_SIZE, 1), else_=0)),
            0,
        ).label("not_eligible"),
    ).where(
        Asset.user_id == admin.id,
        Asset.media_type.in_([MediaType.IMAGE, MediaType.VIDEO]),
        Asset.is_archived.is_(False),
        Asset.stored_key.isnot(None),
    )

    row = (await db.execute(q)).one()
    total = int(row.total_assets or 0)
    with_preview = int(row.with_preview or 0)
    eligible_no_preview = int(row.eligible_no_preview or 0)
    upgradeable = int(row.upgradeable or 0)
    not_eligible = int(row.not_eligible or 0)

    # Coverage = fraction of preview-eligible assets that already have a
    # preview at-or-above the prior cap.  Assets in `upgradeable` count as
    # done for the percentage (they have *some* preview); the prev_cap arg
    # exists for the backlog count, not the coverage metric.
    eligible_total = total - not_eligible
    pct = (with_preview / eligible_total * 100.0) if eligible_total > 0 else 100.0

    return PreviewBackfillStats(
        total_assets=total,
        with_preview=with_preview,
        eligible_no_preview=eligible_no_preview,
        upgradeable=upgradeable,
        not_eligible=not_eligible,
        percentage=round(pct, 2),
        target_size=int(target_size),
        prev_cap=prev_cap,
    )


@router.post("/backfill-previews", response_model=BackfillPreviewsResponse)
async def backfill_previews(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    limit: int = Query(50, ge=1, le=500, description="Max assets to enqueue"),
    prev_cap: int = Query(
        800, ge=0, le=10000,
        description="Sources at or below this size are skipped because a regen "
                    "can't produce a larger preview than the prior run.",
    ),
):
    """Enqueue preview-derivative regen jobs for eligible assets.

    Selects assets whose source resolution clears the preview threshold AND
    which would benefit from a regen (no preview yet, OR existing preview
    smaller than what the current `preview_size` could produce).  Each
    candidate gets an ARQ `process_ingestion` job with `generate_previews=
    True, generate_thumbnails=False`; the job id `ingest:{asset_id}`
    deduplicates against any concurrent ingestion of the same asset.

    Returns immediately after enqueue — actual ffmpeg/Pillow work happens
    in the worker.  Watch ARQ worker logs (`arq.process_ingestion`) for
    progress, or refresh the stats endpoint.
    """
    from pixsim7.backend.main.infrastructure.redis import get_arq_pool
    from pixsim7.backend.main.services.media.derivatives import _MIN_PREVIEW_SOURCE_SIZE

    try:
        # Newest-first; over-fetch since Python-side filter throws away
        # rows that don't meet the dim threshold.  3× is the same heuristic
        # `/backfill-thumbnails` uses.
        q = (
            select(
                Asset.id,
                Asset.width,
                Asset.height,
                Asset.preview_key,
                Asset.stored_key,
            )
            .where(
                Asset.user_id == admin.id,
                Asset.media_type.in_([MediaType.IMAGE, MediaType.VIDEO]),
                Asset.is_archived.is_(False),
                Asset.stored_key.isnot(None),
            )
            .order_by(Asset.id.desc())
            .limit(limit * 3)
        )
        rows = (await db.execute(q)).all()

        candidates: list[int] = []
        skipped = 0
        for row in rows:
            if len(candidates) >= limit:
                break
            max_dim = max(row.width or 0, row.height or 0)
            if max_dim < _MIN_PREVIEW_SOURCE_SIZE:
                # Below threshold — preview generation would no-op.
                skipped += 1
                continue
            if row.preview_key and max_dim <= prev_cap:
                # Existing preview already as large as the source can yield
                # under the prior cap; regen at the new cap can't grow it.
                skipped += 1
                continue
            candidates.append(row.id)

        pool = await get_arq_pool()
        enqueued = 0
        errors = 0
        error_ids: list[int] = []
        for asset_id in candidates:
            try:
                await pool.enqueue_job(
                    "process_ingestion",
                    asset_id,
                    _job_id=f"ingest:{asset_id}",
                    force=True,
                    store_for_serving=False,
                    extract_metadata=False,
                    generate_thumbnails=False,
                    generate_previews=True,
                    derivatives_mode="inline",
                )
                enqueued += 1
            except Exception as exc:
                logger.warning(
                    "preview_backfill_enqueue_failed",
                    asset_id=asset_id,
                    error=str(exc),
                )
                errors += 1
                error_ids.append(asset_id)

        return BackfillPreviewsResponse(
            success=True,
            processed=len(candidates),
            enqueued=enqueued,
            skipped=skipped,
            errors=errors,
            error_ids=error_ids[:20],
        )
    except Exception as exc:
        logger.error(
            "preview_backfill_error",
            error=str(exc),
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to backfill previews: {str(exc)}",
        )
