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


class BackfillSignalScanResponse(BaseModel):
    """Result of a batch signal-scan backfill."""
    success: bool
    processed: int
    scanned: int
    broken: int
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


# ===== FOLDER CONTEXT STATS =====

class FolderContextStatsResponse(BaseModel):
    """Folder context coverage statistics for local assets"""
    total_local: int
    with_folder_context: int
    without_folder_context: int
    fixable_from_metadata: int
    fixable_from_prefs: int
    unfixable: int
    percentage: float


class BackfillFolderContextResponse(BaseModel):
    """Response from folder context backfill operation"""
    success: bool
    updated: int
    phase1_bootstrapped: int
    phase2_named: int
    phase3_subfolder: int
    skipped: int
    errors: int


@router.get("/folder-context-stats", response_model=FolderContextStatsResponse)
async def get_folder_context_stats(
    admin: CurrentAdminUser,
    db: DatabaseSession,
) -> FolderContextStatsResponse:
    """
    Get statistics about folder context coverage for local assets.

    Shows how many local assets have upload_context with source_folder_id,
    and which ones can be recovered from media_metadata or user preferences.
    """
    from sqlalchemy import text

    uid = {"user_id": admin.id}

    total_local_r = await db.execute(text("""
        SELECT count(*) FROM assets
        WHERE user_id = :user_id AND upload_method = 'local'
    """), uid)
    total_local = total_local_r.scalar() or 0

    with_ctx_r = await db.execute(text("""
        SELECT count(*) FROM assets
        WHERE user_id = :user_id
          AND upload_method = 'local'
          AND upload_context IS NOT NULL
          AND upload_context->>'source_folder_id' IS NOT NULL
    """), uid)
    with_folder_context = with_ctx_r.scalar() or 0

    without_folder_context = total_local - with_folder_context

    fixable_meta_r = await db.execute(text("""
        SELECT count(*) FROM assets
        WHERE user_id = :user_id
          AND upload_method = 'local'
          AND upload_context IS NULL
          AND media_metadata IS NOT NULL
          AND (
              media_metadata->'upload_attribution'->>'source_folder_id' IS NOT NULL
              OR media_metadata->'upload_history'->'context'->>'source_folder_id' IS NOT NULL
              OR media_metadata->>'source_folder_id' IS NOT NULL
          )
    """), uid)
    fixable_from_metadata = fixable_meta_r.scalar() or 0

    fixable_prefs_r = await db.execute(text("""
        SELECT count(*) FROM assets
        WHERE user_id = :user_id
          AND upload_method = 'local'
          AND upload_context IS NOT NULL
          AND upload_context->>'source_folder_id' IS NOT NULL
          AND (upload_context->>'source_folder') IS NULL
    """), uid)
    fixable_from_prefs = fixable_prefs_r.scalar() or 0

    unfixable = max(0, without_folder_context - fixable_from_metadata)
    percentage = (with_folder_context / total_local * 100) if total_local > 0 else 0

    return FolderContextStatsResponse(
        total_local=total_local,
        with_folder_context=with_folder_context,
        without_folder_context=without_folder_context,
        fixable_from_metadata=fixable_from_metadata,
        fixable_from_prefs=fixable_from_prefs,
        unfixable=unfixable,
        percentage=round(percentage, 2),
    )


# ===== FOLDER CONTEXT BACKFILL =====

@router.post("/backfill-folder-context", response_model=BackfillFolderContextResponse)
async def backfill_folder_context(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    limit: int = Query(default=200, ge=1, le=1000, description="Max assets per phase"),
) -> BackfillFolderContextResponse:
    """
    Three-phase idempotent backfill of folder context for local assets.

    Phase 1: Bootstrap upload_context from media_metadata hints
    Phase 2: Resolve source_folder display name from user preferences
    Phase 3: Derive source_subfolder from source_relative_path
    """
    from sqlalchemy import text

    try:
        uid = admin.id

        # Phase 1: Bootstrap upload_context from media_metadata
        phase1_result = await db.execute(text("""
            WITH candidates AS (
                SELECT id,
                    COALESCE(
                        media_metadata->'upload_attribution'->>'source_folder_id',
                        media_metadata->'upload_history'->'context'->>'source_folder_id',
                        media_metadata->>'source_folder_id'
                    ) AS folder_id,
                    COALESCE(
                        media_metadata->'upload_attribution'->>'source_relative_path',
                        media_metadata->'upload_history'->'context'->>'source_relative_path',
                        media_metadata->>'source_relative_path'
                    ) AS rel_path
                FROM assets
                WHERE user_id = :user_id
                  AND upload_method = 'local'
                  AND upload_context IS NULL
                  AND media_metadata IS NOT NULL
                  AND (
                      media_metadata->'upload_attribution'->>'source_folder_id' IS NOT NULL
                      OR media_metadata->'upload_history'->'context'->>'source_folder_id' IS NOT NULL
                      OR media_metadata->>'source_folder_id' IS NOT NULL
                  )
                LIMIT :limit
            )
            UPDATE assets a
            SET upload_context = jsonb_strip_nulls(jsonb_build_object(
                'source_folder_id', c.folder_id,
                'source_relative_path', c.rel_path
            ))
            FROM candidates c
            WHERE a.id = c.id
        """), {"user_id": uid, "limit": limit})
        phase1_bootstrapped = phase1_result.rowcount

        # Phase 2: Resolve folder name from user preferences
        phase2_result = await db.execute(text("""
            WITH folder_map AS (
                SELECT
                    u.id AS user_id,
                    f->>'id' AS folder_id,
                    f->>'name' AS folder_name
                FROM users u,
                     jsonb_array_elements((u.preferences->'localFolders')::jsonb) AS f
                WHERE u.id = :user_id
                  AND u.preferences->'localFolders' IS NOT NULL
                  AND jsonb_typeof((u.preferences->'localFolders')::jsonb) = 'array'
            )
            UPDATE assets a
            SET upload_context = a.upload_context || jsonb_build_object('source_folder', fm.folder_name)
            FROM folder_map fm
            WHERE a.user_id = fm.user_id
              AND a.upload_method = 'local'
              AND a.upload_context IS NOT NULL
              AND a.upload_context->>'source_folder_id' = fm.folder_id
              AND (a.upload_context->>'source_folder') IS NULL
        """), {"user_id": uid})
        phase2_named = phase2_result.rowcount

        # Phase 3: Derive source_subfolder from source_relative_path
        phase3_result = await db.execute(text("""
            UPDATE assets
            SET upload_context = upload_context || jsonb_build_object(
                'source_subfolder',
                split_part(
                    replace(upload_context->>'source_relative_path', E'\\\\', '/'),
                    '/', 1
                )
            )
            WHERE user_id = :user_id
              AND upload_method = 'local'
              AND upload_context IS NOT NULL
              AND upload_context->>'source_relative_path' IS NOT NULL
              AND (upload_context->>'source_subfolder') IS NULL
              AND position('/' in replace(upload_context->>'source_relative_path', E'\\\\', '/')) > 0
        """), {"user_id": uid})
        phase3_subfolder = phase3_result.rowcount

        await db.commit()

        updated = phase1_bootstrapped + phase2_named + phase3_subfolder

        logger.info(
            "folder_context_backfill_complete",
            user_id=uid,
            phase1=phase1_bootstrapped,
            phase2=phase2_named,
            phase3=phase3_subfolder,
            total_updated=updated,
        )

        return BackfillFolderContextResponse(
            success=True,
            updated=updated,
            phase1_bootstrapped=phase1_bootstrapped,
            phase2_named=phase2_named,
            phase3_subfolder=phase3_subfolder,
            skipped=0,
            errors=0,
        )
    except Exception as exc:
        logger.error(
            "folder_context_backfill_error",
            error=str(exc),
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to backfill folder context: {str(exc)}"
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


# ===== FORMAT CONVERSION STATS & BACKFILL =====

class FormatBreakdown(BaseModel):
    """Per-format count and size"""
    mime_type: str
    count: int
    size_bytes: int
    size_human: str


class FormatConversionStatsResponse(BaseModel):
    """Statistics for image format distribution and conversion potential"""
    total_images: int
    formats: list[FormatBreakdown]
    convertible_count: int
    convertible_size_bytes: int
    convertible_size_human: str
    target_format: str
    estimated_savings_pct: float


class FormatConversionResponse(BaseModel):
    """Response from format conversion operation"""
    success: bool
    processed: int
    converted: int
    skipped: int
    errors: int
    bytes_before: int
    bytes_after: int
    savings_bytes: int
    savings_human: str
    error_ids: list[int] = []


def _human_size(size_bytes: int | float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if abs(size_bytes) < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"


# Estimated compression ratios (source → webp)
_ESTIMATED_SAVINGS: dict[str, float] = {
    "image/png": 65.0,
    "image/jpeg": 15.0,
    "image/bmp": 90.0,
    "image/tiff": 85.0,
}


@router.get("/format-conversion-stats", response_model=FormatConversionStatsResponse)
async def get_format_conversion_stats(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    target_format: str = Query("webp", description="Target format to estimate savings for: 'webp' or 'jpeg'"),
    source_format: str = Query("", description="Only count this source MIME type (empty = all non-target)"),
):
    """
    Preview image format distribution and potential conversion savings.

    Returns per-format breakdown and how many images could be converted
    to the target format.
    """
    from sqlalchemy import select, func, case
    from pixsim7.backend.main.domain.assets.models import Asset

    target_mime = {
        "webp": "image/webp",
        "jpeg": "image/jpeg",
        "jpg": "image/jpeg",
    }.get(target_format.lower(), f"image/{target_format.lower()}")

    try:
        # Per-format breakdown
        fmt_result = await db.execute(
            select(
                Asset.mime_type,
                func.count().label("cnt"),
                func.coalesce(func.sum(Asset.file_size_bytes), 0).label("total_bytes"),
            ).where(
                Asset.stored_key.isnot(None),
                Asset.media_type == "image",
                Asset.mime_type.isnot(None),
            ).group_by(Asset.mime_type).order_by(func.sum(Asset.file_size_bytes).desc())
        )
        rows = fmt_result.fetchall()

        formats = []
        total_images = 0
        convertible_count = 0
        convertible_bytes = 0
        weighted_savings = 0.0

        for row in rows:
            mime, count, size_bytes = row.mime_type, row.cnt, row.total_bytes
            total_images += count
            formats.append(FormatBreakdown(
                mime_type=mime,
                count=count,
                size_bytes=size_bytes,
                size_human=_human_size(size_bytes),
            ))

            # Is this format convertible to target?
            if mime != target_mime:
                if not source_format or mime == source_format:
                    convertible_count += count
                    convertible_bytes += size_bytes
                    savings = _ESTIMATED_SAVINGS.get(mime, 30.0)
                    weighted_savings += savings * size_bytes

        est_pct = (weighted_savings / convertible_bytes) if convertible_bytes > 0 else 0.0

        return FormatConversionStatsResponse(
            total_images=total_images,
            formats=formats,
            convertible_count=convertible_count,
            convertible_size_bytes=convertible_bytes,
            convertible_size_human=_human_size(convertible_bytes),
            target_format=target_format,
            estimated_savings_pct=round(est_pct, 1),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/convert-format", response_model=FormatConversionResponse)
async def convert_asset_format(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    target_format: str = Query("webp", description="Target format: 'webp' or 'jpeg'"),
    quality: int = Query(90, ge=60, le=100, description="Conversion quality (1-100)"),
    limit: int = Query(50, ge=1, le=500, description="Max assets to process per batch"),
    source_format: str = Query("image/png", description="Source MIME type to convert"),
    dry_run: bool = Query(False, description="Preview what would be converted without modifying anything"),
    require_smaller: bool = Query(
        False,
        description=(
            "Skip assets when the converted output is not smaller than the "
            "original. Opt-in safety guard — off by default so the endpoint "
            "stays usable as a generic format converter."
        ),
    ),
):
    """
    Convert existing images to a more space-efficient format.

    Processes in batches — call repeatedly until png_count reaches 0.
    The original remains available on the provider CDN via remote_url.
    """
    import hashlib
    import io
    import os
    from pathlib import Path
    from sqlalchemy import select
    from sqlalchemy.orm import attributes
    from pixsim7.backend.main.domain.assets.models import Asset
    from pixsim7.backend.main.services.storage import get_storage_service

    fmt_upper = target_format.upper()
    if fmt_upper == "JPG":
        fmt_upper = "JPEG"
    if fmt_upper not in ("WEBP", "JPEG"):
        raise HTTPException(status_code=400, detail=f"Unsupported format: {target_format}")

    target_ext = ".webp" if fmt_upper == "WEBP" else ".jpg"
    target_mime = "image/webp" if fmt_upper == "WEBP" else "image/jpeg"

    try:
        from PIL import Image

        storage = get_storage_service()

        result = await db.execute(
            select(Asset).where(
                Asset.mime_type == source_format,
                Asset.stored_key.isnot(None),
                Asset.media_type == "image",
            ).order_by(Asset.id.asc()).limit(limit)
        )
        assets = result.scalars().all()

        processed = 0
        converted = 0
        skipped = 0
        errors = 0
        error_ids: list[int] = []
        bytes_before = 0
        bytes_after = 0

        for asset in assets:
            processed += 1

            # Get source file path
            source_path = storage.get_path(asset.stored_key)
            if not os.path.exists(source_path):
                skipped += 1
                continue

            original_size = os.path.getsize(source_path)

            if dry_run:
                # Estimate: WebP ~65% smaller, JPEG ~50% smaller for PNGs.
                # Guard is a live-only check — we can't know the exact output
                # size without actually encoding.
                est_ratio = 0.35 if fmt_upper == "WEBP" else 0.50
                bytes_before += original_size
                bytes_after += int(original_size * est_ratio)
                converted += 1
                continue

            try:
                # Convert
                with Image.open(source_path) as img:
                    if fmt_upper == "JPEG" and img.mode in ("RGBA", "LA", "P"):
                        if img.mode == "RGBA":
                            background = Image.new("RGB", img.size, (255, 255, 255))
                            background.paste(img, mask=img.split()[3])
                            img = background
                        else:
                            img = img.convert("RGB")

                    buf = io.BytesIO()
                    save_kwargs = {"quality": quality, "optimize": True}
                    if fmt_upper == "WEBP":
                        save_kwargs["method"] = 4
                    img.save(buf, format=fmt_upper, **save_kwargs)
                    new_content = buf.getvalue()

                new_size = len(new_content)

                # Opt-in guard: skip when the converted output isn't smaller.
                # Bytes counters are untouched for skipped assets so the final
                # savings number only reflects real conversions.
                if require_smaller and new_size >= original_size:
                    skipped += 1
                    logger.info(
                        "format_conversion_skipped_not_smaller",
                        asset_id=asset.id,
                        original_bytes=original_size,
                        would_be_bytes=new_size,
                    )
                    continue

                bytes_before += original_size
                bytes_after += new_size

                # Store with new hash
                new_sha256 = hashlib.sha256(new_content).hexdigest()
                new_key = await storage.store_with_hash(
                    user_id=asset.user_id,
                    sha256=new_sha256,
                    content=new_content,
                    extension=target_ext,
                )
                new_path = storage.get_path(new_key)

                # Preserve original MIME in metadata
                if not asset.media_metadata:
                    asset.media_metadata = {}
                asset.media_metadata["original_mime_type"] = asset.mime_type
                asset.media_metadata["original_stored_key"] = asset.stored_key

                # Update asset
                old_key = asset.stored_key
                asset.stored_key = new_key
                asset.local_path = new_path
                asset.sha256 = new_sha256
                asset.mime_type = target_mime
                asset.file_size_bytes = new_size
                asset.logical_size_bytes = new_size
                attributes.flag_modified(asset, "media_metadata")

                # Commit per-asset so a failure partway through a long batch
                # doesn't discard earlier successful conversions.
                await db.commit()

                # Post-commit: delete old blob if no other asset references it.
                # Done after commit so the row's new stored_key is persisted
                # before we remove the old file (avoids races with readers).
                from sqlalchemy import func
                sibling_count = (await db.execute(
                    select(func.count()).select_from(Asset).where(
                        Asset.stored_key == old_key,
                    )
                )).scalar() or 0
                if sibling_count == 0 and os.path.exists(source_path):
                    try:
                        os.remove(source_path)
                    except OSError as del_err:
                        logger.warning(
                            "format_conversion_old_blob_delete_failed",
                            asset_id=asset.id,
                            old_key=old_key,
                            error=str(del_err),
                        )

                converted += 1

                logger.info(
                    "format_conversion_success",
                    asset_id=asset.id,
                    original_bytes=original_size,
                    new_bytes=new_size,
                    savings_pct=round((1 - new_size / original_size) * 100, 1),
                )

            except Exception as exc:
                # Roll back the current asset's pending mutations so the next
                # iteration starts from a clean session state.
                try:
                    await db.rollback()
                except Exception:
                    pass
                errors += 1
                error_ids.append(asset.id)
                logger.warning(
                    "format_conversion_failed",
                    asset_id=asset.id,
                    error=str(exc),
                )

        savings = bytes_before - bytes_after

        return FormatConversionResponse(
            success=True,
            processed=processed,
            converted=converted,
            skipped=skipped,
            errors=errors,
            bytes_before=bytes_before,
            bytes_after=bytes_after,
            savings_bytes=savings,
            savings_human=_human_size(savings),
            error_ids=error_ids[:20],
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "format_conversion_error",
            error=str(exc),
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to convert formats: {str(exc)}"
        )


# ===== DUPLICATES =====

class DuplicatesStatsResponse(BaseModel):
    """Aggregate stats for sha256-based duplicate groups."""
    group_count: int
    total_duplicates: int
    wasted_bytes: int


class DuplicateAssetInfo(BaseModel):
    """Asset summary for duplicate group listing."""
    id: int
    created_at: Optional[str] = None
    file_size_bytes: Optional[int] = None
    mime_type: Optional[str] = None
    media_type: Optional[str] = None
    upload_method: Optional[str] = None
    asset_kind: Optional[str] = None
    source_folder: Optional[str] = None
    source_relative_path: Optional[str] = None
    thumbnail_url: Optional[str] = None


class DuplicateGroup(BaseModel):
    """One sha256 group with its member assets."""
    sha256: str
    count: int
    total_bytes: int
    assets: list[DuplicateAssetInfo]


class DuplicatesResponse(BaseModel):
    """Paginated duplicate groups."""
    groups: list[DuplicateGroup]
    total_groups: int
    offset: int
    limit: int


@router.get("/duplicates-stats", response_model=DuplicatesStatsResponse)
async def get_duplicates_stats(
    admin: CurrentAdminUser,
    db: DatabaseSession,
) -> DuplicatesStatsResponse:
    """
    Aggregate stats for sha256-based duplicates across the user's library.

    A "duplicate group" is 2+ assets sharing the same sha256. `wasted_bytes`
    counts file_size_bytes for every asset beyond the first in each group
    (what could be reclaimed by keeping one copy per group).
    """
    from sqlalchemy import text

    row = (await db.execute(text("""
        WITH dup_groups AS (
            SELECT sha256,
                   count(*) AS cnt,
                   coalesce(sum(file_size_bytes), 0) AS total_bytes,
                   coalesce(min(file_size_bytes), 0) AS min_bytes
            FROM assets
            WHERE user_id = :user_id
              AND sha256 IS NOT NULL
            GROUP BY sha256
            HAVING count(*) > 1
        )
        SELECT count(*) AS group_count,
               coalesce(sum(cnt), 0) AS total_assets,
               coalesce(sum(total_bytes - min_bytes), 0) AS wasted
        FROM dup_groups
    """), {"user_id": admin.id})).fetchone()

    group_count = int(row.group_count or 0) if row else 0
    total_assets = int(row.total_assets or 0) if row else 0
    wasted = int(row.wasted or 0) if row else 0

    # total_duplicates = assets-above-one in each group
    total_duplicates = max(0, total_assets - group_count)

    return DuplicatesStatsResponse(
        group_count=group_count,
        total_duplicates=total_duplicates,
        wasted_bytes=wasted,
    )


@router.get("/duplicates", response_model=DuplicatesResponse)
async def list_duplicates(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> DuplicatesResponse:
    """
    List sha256 duplicate groups with member asset details.

    Groups ordered by count desc, then total bytes desc.
    """
    from sqlalchemy import text, select
    from pixsim7.backend.main.domain.assets.models import Asset
    from pixsim7.backend.main.shared.storage_utils import storage_key_to_url

    # Total group count for pagination
    total_row = (await db.execute(text("""
        SELECT count(*) AS n
        FROM (
            SELECT sha256
            FROM assets
            WHERE user_id = :user_id AND sha256 IS NOT NULL
            GROUP BY sha256
            HAVING count(*) > 1
        ) g
    """), {"user_id": admin.id})).fetchone()
    total_groups = int(total_row.n or 0) if total_row else 0

    # Page of groups
    group_rows = (await db.execute(text("""
        SELECT sha256,
               count(*) AS cnt,
               coalesce(sum(file_size_bytes), 0) AS total_bytes
        FROM assets
        WHERE user_id = :user_id AND sha256 IS NOT NULL
        GROUP BY sha256
        HAVING count(*) > 1
        ORDER BY cnt DESC, total_bytes DESC, sha256 ASC
        OFFSET :offset LIMIT :limit
    """), {"user_id": admin.id, "offset": offset, "limit": limit})).fetchall()

    if not group_rows:
        return DuplicatesResponse(groups=[], total_groups=total_groups, offset=offset, limit=limit)

    sha_list = [r.sha256 for r in group_rows]

    # Fetch all member assets for this page in one query
    assets_result = await db.execute(
        select(Asset).where(
            Asset.user_id == admin.id,
            Asset.sha256.in_(sha_list),
        ).order_by(Asset.sha256, Asset.created_at.asc())
    )
    assets = assets_result.scalars().all()

    by_sha: dict[str, list[DuplicateAssetInfo]] = {}
    for a in assets:
        ctx = a.upload_context or {}
        by_sha.setdefault(a.sha256, []).append(DuplicateAssetInfo(
            id=a.id,
            created_at=a.created_at.isoformat() if a.created_at else None,
            file_size_bytes=a.file_size_bytes,
            mime_type=a.mime_type,
            media_type=a.media_type,
            upload_method=a.upload_method,
            asset_kind=getattr(a, 'asset_kind', None),
            source_folder=ctx.get('source_folder') if isinstance(ctx, dict) else None,
            source_relative_path=ctx.get('source_relative_path') if isinstance(ctx, dict) else None,
            thumbnail_url=storage_key_to_url(a.thumbnail_key),
        ))

    groups = [
        DuplicateGroup(
            sha256=r.sha256,
            count=int(r.cnt),
            total_bytes=int(r.total_bytes or 0),
            assets=by_sha.get(r.sha256, []),
        )
        for r in group_rows
    ]

    return DuplicatesResponse(
        groups=groups,
        total_groups=total_groups,
        offset=offset,
        limit=limit,
    )


# ===== SIGNAL SCAN (broken-video heuristic coverage + batch backfill) =====

@router.get("/signal-scan-stats", response_model=SignalScanStatsResponse)
async def get_signal_scan_stats(
    admin: CurrentAdminUser,
    db: DatabaseSession,
) -> SignalScanStatsResponse:
    """Coverage stats for the broken-video heuristic scan.

    Counts video assets bucketed by their stored signal_metrics:
    scanned/unscanned, broken (score >= 3 minus user-overridden as clean),
    clean (score == 0 minus user-overridden as broken), borderline (1-2),
    and overridden.
    """
    from sqlalchemy import select, func, case
    from sqlalchemy.dialects.postgresql import JSONB
    from pixsim7.backend.main.domain.assets.models import Asset
    from pixsim7.backend.main.services.asset.signal_analysis import (
        SCANNER_VERSION,
        SUSPICIOUS_THRESHOLD,
    )

    # JSON path expressions — media_metadata is JSON, cast then -> / ->>.
    sm = func.cast(Asset.media_metadata, JSONB).op("->")("signal_metrics")
    score_text = sm.op("->>")("score")
    version_text = sm.op("->>")("scanner_version")
    override_text = sm.op("->>")("user_override")
    score = score_text.cast(__import__("sqlalchemy").Integer)

    base_filter = [
        Asset.user_id == admin.id,
        Asset.media_type == "VIDEO",
        Asset.is_archived == False,  # noqa: E712
    ]

    # Single aggregating query — one round trip.
    stmt = select(
        func.count(Asset.id).label("total"),
        func.count(case((score_text.isnot(None), 1))).label("scanned"),
        func.count(
            case((
                (score_text.isnot(None))
                & (score >= SUSPICIOUS_THRESHOLD)
                & (func.coalesce(override_text, "") != "clean"),
                1,
            ))
        ).label("broken"),
        func.count(
            case((
                (score_text.isnot(None))
                & (score == 0)
                & (func.coalesce(override_text, "") != "broken"),
                1,
            ))
        ).label("clean"),
        func.count(
            case((
                (score_text.isnot(None))
                & (score >= 1)
                & (score < SUSPICIOUS_THRESHOLD),
                1,
            ))
        ).label("borderline"),
        func.count(case((override_text.isnot(None), 1))).label("overridden"),
    ).where(*base_filter)

    row = (await db.execute(stmt)).one()
    total = int(row.total or 0)
    scanned = int(row.scanned or 0)
    return SignalScanStatsResponse(
        total_videos=total,
        scanned=scanned,
        unscanned=total - scanned,
        broken=int(row.broken or 0),
        clean=int(row.clean or 0),
        borderline=int(row.borderline or 0),
        overridden=int(row.overridden or 0),
        scanner_version=SCANNER_VERSION,
        percentage=round((scanned / total * 100) if total > 0 else 0, 2),
    )


@router.post("/backfill-signal-scan", response_model=BackfillSignalScanResponse)
async def backfill_signal_scan(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    limit: int = Query(default=100, ge=1, le=500, description="Max videos to scan"),
) -> BackfillSignalScanResponse:
    """Scan up to `limit` unscanned (or stale-version) video assets.

    Uses SignalAnalysisService — same logic as the ingest hook and the
    one-shot rescan endpoint. Skips assets without a local file.
    """
    from sqlalchemy import select, or_
    from sqlalchemy.dialects.postgresql import JSONB
    from pixsim7.backend.main.domain.assets.models import Asset
    from pixsim7.backend.main.services.asset.signal_analysis import (
        SCANNER_VERSION,
        SignalAnalysisService,
    )

    sm = __import__("sqlalchemy").func.cast(Asset.media_metadata, JSONB).op("->")("signal_metrics")
    version_text = sm.op("->>")("scanner_version")

    stmt = (
        select(Asset)
        .where(
            Asset.user_id == admin.id,
            Asset.media_type == "VIDEO",
            Asset.is_archived == False,  # noqa: E712
            Asset.local_path.isnot(None),
            or_(version_text.is_(None), version_text != SCANNER_VERSION),
        )
        .order_by(Asset.id.desc())
        .limit(limit)
    )
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
            payload = await service.probe_and_stamp(asset, force=True, commit=False)
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

    return BackfillSignalScanResponse(
        success=True,
        processed=processed,
        scanned=scanned,
        broken=broken,
        skipped=skipped,
        errors=errors,
    )
