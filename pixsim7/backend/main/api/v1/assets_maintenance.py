"""
Asset maintenance API endpoints

SHA hash management, storage sync, and backfill operations.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from pixsim7.backend.main.api.dependencies import CurrentAdminUser, AssetSvc, DatabaseSession
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
    duplicates: int = 0
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


class ContentBlobStatsResponse(BaseModel):
    """Content blob linkage statistics"""
    total_assets: int
    with_content_id: int
    missing_content_id: int
    missing_with_sha: int
    missing_logical_size: int
    percentage: float


class BackfillContentBlobsResponse(BaseModel):
    """Response from content blob backfill operation"""
    success: bool
    processed: int
    linked: int
    updated_sizes: int
    skipped: int
    errors: int


# ===== SHA STATS =====

@router.get("/sha-stats", response_model=SHAStatsResponse)
async def get_sha_stats(
    admin: CurrentAdminUser,
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
        select(func.count(Asset.id)).where(Asset.user_id == admin.id)
    )
    total = total_result.scalar() or 0

    # Count assets with SHA
    with_sha_result = await db.execute(
        select(func.count(Asset.id)).where(
            Asset.user_id == admin.id,
            Asset.sha256.isnot(None)
        )
    )
    with_sha = with_sha_result.scalar() or 0

    # Count assets without SHA but with local files (can be backfilled)
    without_sha_with_local_result = await db.execute(
        select(func.count(Asset.id)).where(
            Asset.user_id == admin.id,
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

@router.post("/backfill-sha", response_model=BackfillSHAResponse)
async def backfill_sha_hashes(
    admin: CurrentAdminUser,
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
                Asset.user_id == admin.id,
                Asset.sha256.is_(None),
                Asset.local_path.isnot(None)
            ).limit(limit)
        )
        assets = result.scalars().all()

        # Get existing SHA256s for this user to avoid constraint violations
        existing_result = await db.execute(
            select(Asset.sha256).where(
                Asset.user_id == admin.id,
                Asset.sha256.isnot(None)
            )
        )
        existing_sha256s = set(row[0] for row in existing_result.fetchall())

        processed = 0
        updated = 0
        skipped = 0
        duplicates = 0
        errors = 0

        # Track SHA256s we're adding in this batch to avoid intra-batch conflicts
        batch_sha256s: dict[str, int] = {}  # sha256 -> first asset id in batch

        for asset in assets:
            processed += 1

            # Check if local file exists
            if not asset.local_path or not os.path.exists(asset.local_path):
                skipped += 1
                continue

            try:
                # Compute SHA256
                sha256 = asset_service._compute_sha256(asset.local_path)

                # Check for duplicates - either existing in DB or earlier in this batch
                if sha256 in existing_sha256s:
                    logger.info(
                        "sha_backfill_duplicate_existing",
                        asset_id=asset.id,
                        sha256=sha256[:16]
                    )
                    duplicates += 1
                    continue
                elif sha256 in batch_sha256s:
                    logger.info(
                        "sha_backfill_duplicate_batch",
                        asset_id=asset.id,
                        original_id=batch_sha256s[sha256],
                        sha256=sha256[:16]
                    )
                    duplicates += 1
                    continue

                asset.sha256 = sha256
                batch_sha256s[sha256] = asset.id
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
            duplicates=duplicates,
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

@router.get("/storage-sync-stats", response_model=StorageSyncStatsResponse)
async def get_storage_sync_stats(
    admin: CurrentAdminUser,
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

    percentage = (new_storage / total * 100) if total > 0 else 0

    return StorageSyncStatsResponse(
        total_assets=total,
        new_storage=new_storage,
        old_storage=old_storage,
        no_local=no_local,
        percentage=round(percentage, 2)
    )


# ===== BULK SYNC STORAGE =====

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
    from sqlalchemy import select, or_
    from pixsim7.backend.main.domain.assets.models import Asset

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


# ===== CONTENT BLOB STATS =====

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
    from sqlalchemy import select, func, and_
    from pixsim7.backend.main.domain.assets.models import Asset

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

    percentage = (with_content / total * 100) if total > 0 else 0

    return ContentBlobStatsResponse(
        total_assets=total,
        with_content_id=with_content,
        missing_content_id=missing_content,
        missing_with_sha=missing_with_sha,
        missing_logical_size=missing_logical_size,
        percentage=round(percentage, 2),
    )


# ===== CONTENT BLOB BACKFILL =====

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
    from sqlalchemy import select, or_, and_
    from pixsim7.backend.main.domain.assets.models import Asset
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


# ===== THUMBNAIL BACKFILL =====

class BackfillThumbnailsResponse(BaseModel):
    """Response from thumbnail backfill operation"""
    success: bool
    processed: int
    generated: int
    skipped: int
    errors: int
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
    from sqlalchemy import select, or_
    from pixsim7.backend.main.domain.assets.models import Asset
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


# ===== UPLOAD METHOD STATS =====

class UploadMethodStatsResponse(BaseModel):
    """Upload method coverage statistics"""
    total_assets: int
    with_upload_method: int
    without_upload_method: int
    by_method: dict[str, int]
    percentage: float


class InferenceRuleInfo(BaseModel):
    """Info about an upload method inference rule"""
    name: str
    description: str


class UploadMethodConfigResponse(BaseModel):
    """Upload method configuration and available rules"""
    default_method: str
    available_methods: dict[str, str]
    inference_rules: list[InferenceRuleInfo]


@router.get("/upload-method-config", response_model=UploadMethodConfigResponse)
async def get_upload_method_config(
    admin: CurrentAdminUser,
) -> UploadMethodConfigResponse:
    """
    Get upload method configuration including available methods and inference rules.

    Useful for understanding how upload_method is inferred during backfill.
    """
    from pixsim7.backend.main.domain.assets.upload_attribution import (
        DEFAULT_UPLOAD_METHOD,
        UPLOAD_METHOD_LABELS,
        INFERENCE_RULES,
    )

    rules = [
        InferenceRuleInfo(
            name=name,
            description=fn.__doc__.strip() if fn.__doc__ else f"Rule: {name}",
        )
        for name, fn in INFERENCE_RULES
    ]

    return UploadMethodConfigResponse(
        default_method=DEFAULT_UPLOAD_METHOD,
        available_methods=UPLOAD_METHOD_LABELS,
        inference_rules=rules,
    )


@router.get("/upload-method-stats", response_model=UploadMethodStatsResponse)
async def get_upload_method_stats(
    admin: CurrentAdminUser,
    db: DatabaseSession,
) -> UploadMethodStatsResponse:
    """
    Get statistics about upload_method coverage for user's assets.

    Shows how many assets have upload_method set, and breakdown by method.
    Useful for identifying assets that need backfill.
    """
    from sqlalchemy import select, func
    from pixsim7.backend.main.domain.assets.models import Asset

    # Total assets
    total_result = await db.execute(
        select(func.count(Asset.id)).where(Asset.user_id == admin.id)
    )
    total = total_result.scalar() or 0

    # Assets with upload_method
    with_method_result = await db.execute(
        select(func.count(Asset.id)).where(
            Asset.user_id == admin.id,
            Asset.upload_method.isnot(None)
        )
    )
    with_method = with_method_result.scalar() or 0

    without_method = total - with_method

    # Breakdown by method
    by_method_result = await db.execute(
        select(Asset.upload_method, func.count(Asset.id))
        .where(
            Asset.user_id == admin.id,
            Asset.upload_method.isnot(None)
        )
        .group_by(Asset.upload_method)
    )
    by_method = {row[0]: row[1] for row in by_method_result.fetchall()}

    percentage = (with_method / total * 100) if total > 0 else 0

    return UploadMethodStatsResponse(
        total_assets=total,
        with_upload_method=with_method,
        without_upload_method=without_method,
        by_method=by_method,
        percentage=round(percentage, 2),
    )


# ===== UPLOAD METHOD BACKFILL =====

class BackfillUploadMethodResponse(BaseModel):
    """Response from upload method backfill operation"""
    success: bool
    processed: int
    updated: int
    by_method: dict[str, int]
    skipped: int
    errors: int


@router.post("/backfill-upload-method", response_model=BackfillUploadMethodResponse)
async def backfill_upload_method(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    limit: int = Query(default=500, ge=1, le=2000, description="Max assets to process"),
    dry_run: bool = Query(default=False, description="If true, don't actually update"),
) -> BackfillUploadMethodResponse:
    """
    Backfill upload_method from asset metadata using centralized inference rules.

    Uses the rule-based inference system from upload_attribution module which checks:
    - Explicit upload_method in metadata (normalized)
    - source_folder_id -> 'local'
    - Pixverse metadata/provider -> 'pixverse_sync'
    - source_url/source_site -> 'web'
    - source_generation_id -> 'generated'
    - Default fallback -> 'web'

    Rules can be extended by adding to INFERENCE_RULES in upload_attribution.py
    """
    from sqlalchemy import select
    from pixsim7.backend.main.domain.assets.models import Asset
    from pixsim7.backend.main.domain.assets.upload_attribution import infer_upload_method_from_asset

    try:
        # Get assets without upload_method
        result = await db.execute(
            select(Asset).where(
                Asset.user_id == admin.id,
                Asset.upload_method.is_(None)
            ).limit(limit)
        )
        assets = result.scalars().all()

        processed = 0
        updated = 0
        skipped = 0
        errors = 0
        by_method: dict[str, int] = {}

        for asset in assets:
            processed += 1
            try:
                # Use centralized inference from upload_attribution module
                inferred_method = infer_upload_method_from_asset(asset)

                if inferred_method:
                    if not dry_run:
                        asset.upload_method = inferred_method
                        db.add(asset)
                    updated += 1
                    by_method[inferred_method] = by_method.get(inferred_method, 0) + 1
                else:
                    skipped += 1
            except Exception as exc:
                logger.warning(
                    "upload_method_backfill_failed",
                    asset_id=asset.id,
                    error=str(exc),
                )
                errors += 1

        if not dry_run:
            await db.commit()

        return BackfillUploadMethodResponse(
            success=True,
            processed=processed,
            updated=updated,
            by_method=by_method,
            skipped=skipped,
            errors=errors,
        )
    except Exception as exc:
        logger.error(
            "upload_method_backfill_error",
            error=str(exc),
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to backfill upload method: {str(exc)}"
        )
