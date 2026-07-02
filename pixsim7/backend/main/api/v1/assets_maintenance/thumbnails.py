from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select, or_
from pixsim7.backend.main.api.dependencies import CurrentAdminUser, DatabaseSession
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim_logging import get_logger
from .base import BackfillResultBase

router = APIRouter(tags=["assets-maintenance"])
logger = get_logger()


class BackfillThumbnailsResponse(BackfillResultBase):
    """Response from thumbnail backfill operation"""
    generated: int
    error_ids: list[int] = []


@router.post("/backfill-thumbnails", response_model=BackfillThumbnailsResponse)
async def backfill_thumbnails(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    limit: int = Query(50, ge=1, le=200, description="Max assets to process"),
    missing_only: bool = Query(True, description="Only process assets with missing thumbnail files"),
    include_missing_keys: bool = Query(
        False,
        description="Also process assets without thumbnail_key (downloads from remote_url if needed)",
    ),
):
    """
    Regenerate missing thumbnails for assets.

    Finds assets where the thumbnail file doesn't exist on disk and regenerates them.
    Optionally includes assets missing thumbnail_key (downloads from remote_url if needed).
    Useful after storage cleanup or migration.
    """
    from pixsim7.backend.main.services.asset.ingestion import AssetIngestionService
    from pixsim7.backend.main.services.storage import get_storage_service
    import os

    try:
        storage = get_storage_service()
        service = AssetIngestionService(db)

        # Find assets to inspect
        base_filters = [Asset.user_id == admin.id]
        if include_missing_keys:
            base_filters.append(
                or_(
                    Asset.thumbnail_key.isnot(None),
                    Asset.local_path.isnot(None),
                    Asset.remote_url.isnot(None),
                )
            )
        else:
            base_filters.extend([
                Asset.thumbnail_key.isnot(None),
                Asset.local_path.isnot(None),
            ])

        result = await db.execute(
            select(Asset).where(*base_filters).limit(limit * 3)  # Fetch more since we'll filter
        )
        assets = result.scalars().all()

        processed = 0
        generated = 0
        skipped = 0
        errors = 0
        error_ids: list[int] = []

        for asset in assets:
            if processed >= limit:
                break

            # Check if thumbnail file exists (only when we have a key)
            if missing_only and asset.thumbnail_key:
                thumb_path = storage.get_path(asset.thumbnail_key)
                if os.path.exists(thumb_path):
                    continue  # Skip - thumbnail exists

            processed += 1

            # Check if source file exists (local) or can be downloaded (remote_url)
            has_local = asset.local_path and os.path.exists(asset.local_path)
            if not has_local and not asset.remote_url:
                logger.warning(
                    "thumbnail_backfill_no_source",
                    asset_id=asset.id,
                    local_path=asset.local_path,
                )
                skipped += 1
                continue

            try:
                # Regenerate thumbnail only
                await service.ingest_asset(
                    asset.id,
                    force=True,
                    store_for_serving=False,
                    extract_metadata=False,
                    generate_thumbnails=True,
                    generate_previews=False,
                )
                generated += 1
                logger.info(
                    "thumbnail_backfill_success",
                    asset_id=asset.id,
                )
            except Exception as exc:
                logger.warning(
                    "thumbnail_backfill_failed",
                    asset_id=asset.id,
                    error=str(exc),
                )
                errors += 1
                error_ids.append(asset.id)

        await db.commit()

        return BackfillThumbnailsResponse(
            success=True,
            processed=processed,
            generated=generated,
            skipped=skipped,
            errors=errors,
            error_ids=error_ids[:20],  # Limit to first 20 errors
        )

    except Exception as exc:
        logger.error(
            "thumbnail_backfill_error",
            error=str(exc),
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to backfill thumbnails: {str(exc)}"
        )
