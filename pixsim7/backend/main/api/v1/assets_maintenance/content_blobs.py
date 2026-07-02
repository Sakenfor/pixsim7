from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, or_, and_
from pixsim7.backend.main.api.dependencies import CurrentAdminUser, DatabaseSession
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim_logging import get_logger
from .base import BackfillResultBase, _coverage_pct

router = APIRouter(tags=["assets-maintenance"])
logger = get_logger()


class ContentBlobStatsResponse(BaseModel):
    """Content blob linkage statistics"""
    total_assets: int
    with_content_id: int
    missing_content_id: int
    missing_with_sha: int
    missing_logical_size: int
    percentage: float


class BackfillContentBlobsResponse(BackfillResultBase):
    """Response from content blob backfill operation"""
    linked: int
    updated_sizes: int


@router.get("/content-blob-stats", response_model=ContentBlobStatsResponse)
async def get_content_blob_stats(
    admin: CurrentAdminUser,
    db: DatabaseSession,
) -> ContentBlobStatsResponse:
    """
    Get statistics about content blob linkage for user's assets.

    Content blobs enable future cross-user deduplication by linking
    assets to a global SHA256 record.
    """

    total_result = await db.execute(
        select(func.count(Asset.id)).where(Asset.user_id == admin.id)
    )
    total = total_result.scalar() or 0

    with_content_result = await db.execute(
        select(func.count(Asset.id)).where(
            Asset.user_id == admin.id,
            Asset.content_id.isnot(None)
        )
    )
    with_content = with_content_result.scalar() or 0

    missing_content = total - with_content

    missing_with_sha_result = await db.execute(
        select(func.count(Asset.id)).where(
            Asset.user_id == admin.id,
            Asset.content_id.is_(None),
            Asset.sha256.isnot(None)
        )
    )
    missing_with_sha = missing_with_sha_result.scalar() or 0

    missing_logical_size_result = await db.execute(
        select(func.count(Asset.id)).where(
            Asset.user_id == admin.id,
            Asset.logical_size_bytes.is_(None),
            Asset.file_size_bytes.isnot(None)
        )
    )
    missing_logical_size = missing_logical_size_result.scalar() or 0

    percentage = _coverage_pct(with_content, total)

    return ContentBlobStatsResponse(
        total_assets=total,
        with_content_id=with_content,
        missing_content_id=missing_content,
        missing_with_sha=missing_with_sha,
        missing_logical_size=missing_logical_size,
        percentage=round(percentage, 2),
    )


@router.post("/backfill-content-blobs", response_model=BackfillContentBlobsResponse)
async def backfill_content_blobs(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    limit: int = Query(default=100, ge=1, le=500, description="Max assets to process"),
) -> BackfillContentBlobsResponse:
    """
    Backfill content blob links and logical size for assets.

    Links assets that have SHA256 but no content_id, and fills
    logical_size_bytes from file_size_bytes when missing.
    """
    from pixsim7.backend.main.services.asset.content import ensure_content_blob

    try:
        result = await db.execute(
            select(Asset).where(
                Asset.user_id == admin.id,
                or_(
                    and_(Asset.sha256.isnot(None), Asset.content_id.is_(None)),
                    and_(Asset.logical_size_bytes.is_(None), Asset.file_size_bytes.isnot(None)),
                )
            ).limit(limit)
        )
        assets = result.scalars().all()

        processed = 0
        linked = 0
        updated_sizes = 0
        skipped = 0
        errors = 0

        for asset in assets:
            processed += 1
            updated = False

            try:
                if asset.sha256 and asset.content_id is None:
                    content = await ensure_content_blob(
                        db,
                        sha256=asset.sha256,
                        size_bytes=asset.file_size_bytes,
                        mime_type=asset.mime_type,
                    )
                    asset.content_id = content.id
                    linked += 1
                    updated = True

                if asset.logical_size_bytes is None and asset.file_size_bytes is not None:
                    asset.logical_size_bytes = asset.file_size_bytes
                    updated_sizes += 1
                    updated = True

                if updated:
                    db.add(asset)
                else:
                    skipped += 1
            except Exception as exc:
                logger.warning(
                    "content_blob_backfill_failed",
                    asset_id=asset.id,
                    error=str(exc),
                )
                errors += 1

        await db.commit()

        return BackfillContentBlobsResponse(
            success=True,
            processed=processed,
            linked=linked,
            updated_sizes=updated_sizes,
            skipped=skipped,
            errors=errors,
        )
    except Exception as exc:
        logger.error(
            "content_blob_backfill_error",
            error=str(exc),
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to backfill content blobs: {str(exc)}"
        )
