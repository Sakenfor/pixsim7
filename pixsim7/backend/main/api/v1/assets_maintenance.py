"""
Asset maintenance API endpoints

SHA hash management, storage sync, and backfill operations.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from pixsim7.backend.main.api.dependencies import CurrentUser, AssetSvc, DatabaseSession
from pixsim_logging import get_logger

router = APIRouter(tags=["assets-maintenance"])
logger = get_logger()


# ===== SCHEMAS =====

class SHAStatsResponse(BaseModel):
    """SHA hash coverage statistics"""
    total_assets: int
    with_sha: int
    without_sha: int
    without_sha_with_local: int
    without_sha_no_local: int
    percentage: float


class BackfillSHAResponse(BaseModel):
    """Response from SHA backfill operation"""
    success: bool
    processed: int
    updated: int
    skipped: int
    errors: int


class StorageSyncStatsResponse(BaseModel):
    """Storage sync statistics for user's assets"""
    total_assets: int
    new_storage: int
    old_storage: int
    no_local: int
    percentage: float


class BulkSyncResponse(BaseModel):
    """Response from bulk storage sync operation"""
    success: bool
    processed: int
    synced: int
    skipped: int
    errors: int


# ===== SHA STATS =====

@router.get("/assets/sha-stats", response_model=SHAStatsResponse)
async def get_sha_stats(
    user: CurrentUser,
    db: DatabaseSession,
) -> SHAStatsResponse:
    """
    Get statistics about SHA256 hash coverage for user's assets.

    Returns counts of assets with/without SHA hashes, and which ones
    can be backfilled (have local files).
    """
    from sqlalchemy import select, func
    from pixsim7.backend.main.domain.assets.models import Asset

    # Count total assets
    total_result = await db.execute(
        select(func.count(Asset.id)).where(Asset.user_id == user.id)
    )
    total = total_result.scalar() or 0

    # Count assets with SHA
    with_sha_result = await db.execute(
        select(func.count(Asset.id)).where(
            Asset.user_id == user.id,
            Asset.sha256.isnot(None)
        )
    )
    with_sha = with_sha_result.scalar() or 0

    # Count assets without SHA but with local files (can be backfilled)
    without_sha_with_local_result = await db.execute(
        select(func.count(Asset.id)).where(
            Asset.user_id == user.id,
            Asset.sha256.is_(None),
            Asset.local_path.isnot(None)
        )
    )
    without_sha_with_local = without_sha_with_local_result.scalar() or 0

    # Calculate derived stats
    without_sha = total - with_sha
    without_sha_no_local = without_sha - without_sha_with_local
    percentage = (with_sha / total * 100) if total > 0 else 0

    return SHAStatsResponse(
        total_assets=total,
        with_sha=with_sha,
        without_sha=without_sha,
        without_sha_with_local=without_sha_with_local,
        without_sha_no_local=without_sha_no_local,
        percentage=round(percentage, 2)
    )


# ===== BACKFILL SHA =====

@router.post("/assets/backfill-sha", response_model=BackfillSHAResponse)
async def backfill_sha_hashes(
    user: CurrentUser,
    asset_service: AssetSvc,
    db: DatabaseSession,
    limit: int = Query(default=100, ge=1, le=500, description="Max assets to process"),
) -> BackfillSHAResponse:
    """
    Backfill SHA256 hashes for assets that have local files but no hash.

    This enables duplicate detection for older assets that were created
    before SHA hashing was implemented.
    """
    from sqlalchemy import select
    from pixsim7.backend.main.domain.assets.models import Asset
    import os

    try:
        # Find assets without SHA but with local files
        result = await db.execute(
            select(Asset).where(
                Asset.user_id == user.id,
                Asset.sha256.is_(None),
                Asset.local_path.isnot(None)
            ).limit(limit)
        )
        assets = result.scalars().all()

        processed = 0
        updated = 0
        skipped = 0
        errors = 0

        for asset in assets:
            processed += 1

            # Check if local file exists
            if not asset.local_path or not os.path.exists(asset.local_path):
                skipped += 1
                continue

            try:
                # Compute SHA256
                sha256 = asset_service._compute_sha256(asset.local_path)
                asset.sha256 = sha256
                updated += 1
            except Exception as e:
                logger.warning(
                    "sha_backfill_asset_failed",
                    asset_id=asset.id,
                    error=str(e)
                )
                errors += 1

        await db.commit()

        return BackfillSHAResponse(
            success=True,
            processed=processed,
            updated=updated,
            skipped=skipped,
            errors=errors
        )

    except Exception as e:
        logger.error(
            "sha_backfill_failed",
            error=str(e),
            exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to backfill SHA hashes: {str(e)}"
        )


# ===== STORAGE SYNC STATS =====

@router.get("/assets/storage-sync-stats", response_model=StorageSyncStatsResponse)
async def get_storage_sync_stats(
    user: CurrentUser,
    db: DatabaseSession,
) -> StorageSyncStatsResponse:
    """
    Get statistics about storage system migration status.

    Returns counts of assets on old vs new storage systems.
    """
    from sqlalchemy import select, func, or_
    from pixsim7.backend.main.domain.assets.models import Asset

    # Count total assets
    total_result = await db.execute(
        select(func.count(Asset.id)).where(Asset.user_id == user.id)
    )
    total = total_result.scalar() or 0

    # Count assets using new content-addressed storage (have stored_key)
    new_storage_result = await db.execute(
        select(func.count(Asset.id)).where(
            Asset.user_id == user.id,
            Asset.stored_key.isnot(None),
            Asset.stored_key.like('u/%/content/%')
        )
    )
    new_storage = new_storage_result.scalar() or 0

    # Count assets with local_path but not on new storage (old system)
    old_storage_result = await db.execute(
        select(func.count(Asset.id)).where(
            Asset.user_id == user.id,
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
            Asset.user_id == user.id,
            Asset.local_path.is_(None)
        )
    )
    no_local = no_local_result.scalar() or 0

    percentage = (new_storage / total * 100) if total > 0 else 0

    return StorageSyncStatsResponse(
        total_assets=total,
        new_storage=new_storage,
        old_storage=old_storage,
        no_local=no_local,
        percentage=round(percentage, 2)
    )


# ===== BULK SYNC STORAGE =====

@router.post("/assets/bulk-sync-storage", response_model=BulkSyncResponse)
async def bulk_sync_storage(
    user: CurrentUser,
    asset_service: AssetSvc,
    db: DatabaseSession,
    limit: int = Query(default=50, ge=1, le=200, description="Max assets to sync"),
) -> BulkSyncResponse:
    """
    Bulk re-sync assets from old storage to new content-addressed storage.

    Finds assets with provider URLs that are on old storage and re-downloads them
    to the new content-addressed storage system.
    """
    from sqlalchemy import select, or_
    from pixsim7.backend.main.domain.assets.models import Asset

    try:
        # Find assets on old storage with remote URLs (can be re-synced)
        result = await db.execute(
            select(Asset).where(
                Asset.user_id == user.id,
                Asset.remote_url.isnot(None),
                or_(
                    Asset.stored_key.is_(None),
                    ~Asset.stored_key.like('u/%/content/%')
                )
            ).limit(limit)
        )
        assets_to_sync = result.scalars().all()

        processed = 0
        synced = 0
        skipped = 0
        errors = 0

        for asset in assets_to_sync:
            processed += 1
            try:
                await asset_service.sync_asset(asset_id=asset.id, user=user)
                synced += 1
            except Exception as e:
                logger.warning(
                    "bulk_sync_asset_failed",
                    asset_id=asset.id,
                    error=str(e)
                )
                errors += 1

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
