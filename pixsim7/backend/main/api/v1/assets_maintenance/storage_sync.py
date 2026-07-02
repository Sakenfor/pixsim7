from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from pixsim7.backend.main.api.dependencies import CurrentAdminUser, AssetSvc, DatabaseSession
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim_logging import get_logger
from .base import BackfillResultBase, _coverage_pct

router = APIRouter(tags=["assets-maintenance"])
logger = get_logger()


class StorageSyncStatsResponse(BaseModel):
    """Storage sync statistics for user's assets"""
    total_assets: int
    new_storage: int
    old_storage: int
    no_local: int
    percentage: float


class BulkSyncResponse(BackfillResultBase):
    """Response from bulk storage sync operation"""
    synced: int


@router.get("/storage-sync-stats", response_model=StorageSyncStatsResponse)
async def get_storage_sync_stats(
    admin: CurrentAdminUser,
    db: DatabaseSession,
) -> StorageSyncStatsResponse:
    """
    Get statistics about storage system migration status.

    Returns counts of assets on old vs new storage systems.
    """

    # Count total assets
    total_result = await db.execute(
        select(func.count(Asset.id)).where(Asset.user_id == admin.id)
    )
    total = total_result.scalar() or 0

    # Count assets using new content-addressed storage
    new_storage_result = await db.execute(
        select(func.count(Asset.id)).where(
            Asset.user_id == admin.id,
            Asset.stored_key.isnot(None),
            Asset.stored_key.like('u/%/content/%')
        )
    )
    new_storage = new_storage_result.scalar() or 0

    # Count assets with local_path but not on new storage (old system or asset-id based)
    old_storage_result = await db.execute(
        select(func.count(Asset.id)).where(
            Asset.user_id == admin.id,
            Asset.local_path.isnot(None),
            or_(
                Asset.stored_key.is_(None),
                ~Asset.stored_key.like('u/%/content/%')
            )
        )
    )
    old_storage = old_storage_result.scalar() or 0

    # Count assets without local files (remote-only)
    no_local_result = await db.execute(
        select(func.count(Asset.id)).where(
            Asset.user_id == admin.id,
            Asset.local_path.is_(None)
        )
    )
    no_local = no_local_result.scalar() or 0

    percentage = _coverage_pct(new_storage, total)

    return StorageSyncStatsResponse(
        total_assets=total,
        new_storage=new_storage,
        old_storage=old_storage,
        no_local=no_local,
        percentage=round(percentage, 2)
    )


@router.post("/bulk-sync-storage", response_model=BulkSyncResponse)
async def bulk_sync_storage(
    admin: CurrentAdminUser,
    asset_service: AssetSvc,
    db: DatabaseSession,
    limit: int = Query(default=50, ge=1, le=200, description="Max assets to sync"),
) -> BulkSyncResponse:
    """
    Bulk re-sync assets from old storage to new content-addressed storage.

    Finds assets with provider URLs that are on old storage and re-downloads them
    to the new content-addressed storage system.
    """

    try:
        # Find assets that need syncing:
        # - Has remote_url (can be downloaded)
        # - AND either: no stored_key, old storage format, or not fully ingested
        # Note: we don't check sha256.is_(None) because duplicate-content assets
        # intentionally skip sha256 but are still "completed"
        result = await db.execute(
            select(Asset).where(
                Asset.user_id == admin.id,
                Asset.remote_url.isnot(None),
                or_(
                    Asset.stored_key.is_(None),
                    ~Asset.stored_key.like('u/%/content/%'),  # Not content-addressed
                    Asset.ingest_status.is_(None),  # Never ingested
                    Asset.ingest_status != 'completed',  # Ingestion not finished
                )
            ).limit(limit)
        )
        assets_to_sync = result.scalars().all()

        logger.info(
            "bulk_sync_starting",
            assets_found=len(assets_to_sync),
            limit=limit,
        )

        processed = 0
        synced = 0
        skipped = 0
        errors = 0

        for asset in assets_to_sync:
            processed += 1
            try:
                logger.info(
                    "bulk_sync_asset_starting",
                    asset_id=asset.id,
                    progress=f"{processed}/{len(assets_to_sync)}",
                )
                await asset_service.sync_asset(asset_id=asset.id, user=admin)
                synced += 1
                logger.info(
                    "bulk_sync_asset_completed",
                    asset_id=asset.id,
                    progress=f"{synced}/{len(assets_to_sync)}",
                )
            except Exception as e:
                logger.warning(
                    "bulk_sync_asset_failed",
                    asset_id=asset.id,
                    error=str(e)
                )
                errors += 1
                # Rollback to clear any pending transaction state before processing next asset
                await db.rollback()

        return BulkSyncResponse(
            success=True,
            processed=processed,
            synced=synced,
            skipped=skipped,
            errors=errors
        )

    except Exception as e:
        logger.error(
            "bulk_sync_storage_failed",
            error=str(e),
            exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to bulk sync storage: {str(e)}"
        )
