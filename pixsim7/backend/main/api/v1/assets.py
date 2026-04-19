"""
Asset management API endpoints

Core CRUD operations. Additional endpoints split into:
- assets_search.py: Search, groups, filter options, autocomplete
- assets_upload.py: Upload, upload-from-url, frame extraction, reupload
- assets_enrich.py: Enrichment (metadata sync from provider)
- assets_maintenance.py: SHA stats, storage sync, backfill
- assets_bulk.py: Bulk operations (tags, delete, export)
- assets_tags.py: Tag management
- assets_upload_helper.py: Shared upload preparation logic
"""
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi import status as http_status
from fastapi.responses import FileResponse
from pixsim7.backend.main.shared.errors import InvalidOperationError
from pixsim7.backend.main.api.dependencies import CurrentUser, AssetSvc, DatabaseSession
from pixsim7.backend.main.shared.schemas.asset_schemas import (
    AssetResponse,
    AssetGenerationContext,
    AssetListResponse,
    AssetSearchRequest,
)
from pixsim7.backend.main.shared.errors import ResourceNotFoundError
import os
from pydantic import BaseModel, Field
from typing import Optional, List
from pixsim_logging import get_logger

# Shared helper (used by this module and sub-modules)
from pixsim7.backend.main.api.v1.assets_helpers import (
    build_asset_response_with_tags,
    get_effective_owner_user_id,
)

# Sub-routers for modular organization
from pixsim7.backend.main.api.v1 import assets_maintenance
from pixsim7.backend.main.api.v1 import assets_storage_overview
from pixsim7.backend.main.api.v1 import assets_bulk
from pixsim7.backend.main.api.v1 import assets_tags
from pixsim7.backend.main.api.v1 import assets_versions
from pixsim7.backend.main.api.v1 import assets_search
from pixsim7.backend.main.api.v1 import assets_upload
from pixsim7.backend.main.api.v1 import assets_enrich

router = APIRouter(prefix="/assets")
logger = get_logger()

# Include sub-routers
router.include_router(assets_maintenance.router)
router.include_router(assets_storage_overview.router)
router.include_router(assets_bulk.router)
router.include_router(assets_tags.router)
router.include_router(assets_versions.router)
router.include_router(assets_search.router)
router.include_router(assets_upload.router)
router.include_router(assets_enrich.router)


# Backward-compatible export for callers that imported search from this module.
async def search_assets(
    user: CurrentUser,
    asset_service: AssetSvc,
    db: DatabaseSession,
    request: AssetSearchRequest,
) -> AssetListResponse:
    original_builder = assets_search.build_asset_response_with_tags
    assets_search.build_asset_response_with_tags = build_asset_response_with_tags
    try:
        return await assets_search.search_assets(
            user=user,
            asset_service=asset_service,
            db=db,
            request=request,
        )
    finally:
        assets_search.build_asset_response_with_tags = original_builder


# ===== GET ASSET =====

@router.get("/{asset_id}", response_model=AssetResponse)
async def get_asset(
    asset_id: int,
    user: CurrentUser,
    asset_service: AssetSvc,
    db: DatabaseSession,
):
    """
    Get asset details

    Returns detailed information about a specific asset including:
    - URLs (provider and local)
    - Sync status
    - Video metadata (duration, resolution, format)
    - Thumbnail

    Users can only access their own assets.
    """
    try:
        asset = await asset_service.get_asset_for_user(asset_id, user)
        return await build_asset_response_with_tags(asset, db)

    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Asset not found")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get asset: {str(e)}")


# ===== ASSET GENERATION CONTEXT =====


@router.get("/{asset_id}/generation-context", response_model=AssetGenerationContext)
async def get_asset_generation_context(
    asset_id: int,
    user: CurrentUser,
    asset_service: AssetSvc,
    db: DatabaseSession,
):
    """
    Resolve generation context for an asset.

    Always tries to resolve from the asset's own media_metadata first
    (same logic for synced AND app-generated assets).  Falls back to
    the Generation record only when metadata lacks usable data, and
    even then returns flat provider params — never the raw
    GenerationNodeConfigSchema wrapper.

    Returns 404 if no context can be resolved.
    """
    try:
        asset = await asset_service.get_asset_for_user(asset_id, user)
    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Asset not found")

    from pixsim7.backend.main.services.generation.context import (
        extract_flat_provider_params,
        extract_source_asset_ids,
    )

    # ── Fast path: stamped generation_context in media_metadata ──
    meta = asset.media_metadata or {}
    gen_ctx = meta.get("generation_context") if isinstance(meta, dict) else None
    if gen_ctx and isinstance(gen_ctx, dict):
        canonical_params = gen_ctx.get("params", {})
        if not isinstance(canonical_params, dict):
            canonical_params = {}

        source_asset_ids = gen_ctx.get("source_asset_ids", [])
        if not isinstance(source_asset_ids, list):
            source_asset_ids = []

        # Backward-compat: older stamped contexts may be missing params like aspect_ratio
        # (or even source_asset_ids). When we have a Generation record reference, supplement
        # missing fields from the Generation record without overwriting stamped values.
        if asset.source_generation_id and (
            ("aspect_ratio" not in canonical_params and "aspectRatio" not in canonical_params)
            or ("preferred_account_id" not in canonical_params and "preferredAccountId" not in canonical_params)
            or len(source_asset_ids) == 0
        ):
            try:
                from pixsim7.backend.main.domain import Generation
                generation = await db.get(Generation, asset.source_generation_id)
                if generation:
                    supplement = extract_flat_provider_params(generation.canonical_params or {})
                    if supplement:
                        canonical_params = {**supplement, **canonical_params}
                    if generation.preferred_account_id is not None:
                        canonical_params.setdefault("preferred_account_id", generation.preferred_account_id)
                    if len(source_asset_ids) == 0:
                        source_asset_ids = extract_source_asset_ids(generation.inputs or [])
            except Exception as e:
                logger.warning(
                    "generation_context_supplement_failed",
                    asset_id=asset_id,
                    generation_id=asset.source_generation_id,
                    error=str(e),
                )

        return AssetGenerationContext(
            source="metadata",
            operation_type=gen_ctx.get("operation_type", "text_to_image"),
            provider_id=gen_ctx.get("provider_id", asset.provider_id),
            final_prompt=asset.prompt or gen_ctx.get("prompt"),
            canonical_params=canonical_params,
            raw_params={},
            inputs=[],
            source_asset_ids=source_asset_ids,
        )

    # ── Legacy: Try metadata resolution (synced assets without stamped context) ──
    from pixsim7.backend.main.services.generation.synthetic import (
        resolve_generation_context_from_metadata,
    )

    if isinstance(meta, dict):
        customer_paths = meta.get("customer_paths", {})
        if not isinstance(customer_paths, dict):
            customer_paths = {}
        has_prompt = bool(
            customer_paths.get("prompt")
            or meta.get("prompt")
            or meta.get("text")
        )
        has_create_mode = bool(
            customer_paths.get("create_mode")
            or meta.get("create_mode")
        )
    else:
        has_prompt = False
        has_create_mode = False

    if has_prompt or has_create_mode:
        try:
            ctx = await resolve_generation_context_from_metadata(db, asset)
            # If metadata didn't have a prompt but Generation record does, supplement it
            if not ctx["final_prompt"] and asset.source_generation_id:
                from pixsim7.backend.main.domain import Generation
                generation = await db.get(Generation, asset.source_generation_id)
                if generation and generation.final_prompt:
                    ctx["final_prompt"] = generation.final_prompt
            return AssetGenerationContext(**ctx)
        except Exception as e:
            logger.error(
                "generation_context_metadata_failed",
                asset_id=asset_id,
                error=str(e),
                exc_info=True,
            )
            # Fall through to Generation record path

    # ── Fallback: extract flat params from Generation record ──
    if asset.source_generation_id:
        from pixsim7.backend.main.domain import Generation
        generation = await db.get(Generation, asset.source_generation_id)
        if generation:
            source_asset_ids = extract_source_asset_ids(generation.inputs or [])

            # Extract flat provider params from the canonical_params wrapper
            flat_params = extract_flat_provider_params(generation.canonical_params or {})
            if generation.preferred_account_id is not None:
                flat_params.setdefault("preferred_account_id", generation.preferred_account_id)

            return AssetGenerationContext(
                source="generation",
                operation_type=generation.operation_type.value if generation.operation_type else "text_to_image",
                provider_id=generation.provider_id or asset.provider_id,
                final_prompt=generation.final_prompt,
                canonical_params=flat_params,
                raw_params={},
                inputs=generation.inputs or [],
                source_asset_ids=source_asset_ids,
            )

    raise HTTPException(
        status_code=404,
        detail="No generation context available for this asset",
    )


# ===== CHECK ASSET BY HASH =====

class CheckByHashRequest(BaseModel):
    """Request body for checking if an asset exists by SHA256 hash."""
    sha256: str = Field(..., min_length=64, max_length=64, description="SHA256 hash of file content")
    provider_id: Optional[str] = Field(None, description="Optional: Check if uploaded to specific provider")


class CheckByHashResponse(BaseModel):
    """Response for hash check - returns asset info if found."""
    exists: bool = Field(..., description="Whether an asset with this hash exists")
    asset_id: Optional[int] = Field(None, description="Asset ID if found")
    provider_id: Optional[str] = Field(None, description="Original provider ID if found")
    uploaded_to_providers: Optional[List[str]] = Field(None, description="List of providers this asset is uploaded to")
    note: Optional[str] = Field(None, description="Additional information")


@router.post("/check-by-hash", response_model=CheckByHashResponse)
async def check_asset_by_hash(
    user: CurrentUser,
    asset_service: AssetSvc,
    request: CheckByHashRequest,
):
    """
    Check if an asset with the given SHA256 hash already exists for the current user.

    Returns asset metadata if found. This is a read-only check that does NOT
    update last_accessed_at or modify any data.

    Use this before uploading to avoid duplicate uploads.
    """
    try:
        owner_user_id = get_effective_owner_user_id(user)

        # Find asset by hash (read-only, doesn't update last_accessed_at)
        from sqlmodel import select
        from pixsim7.backend.main.domain.assets.models import Asset

        stmt = select(Asset).where(
            Asset.user_id == owner_user_id,
            Asset.sha256 == request.sha256
        )
        result = await asset_service.db.execute(stmt)
        asset = result.scalars().first()

        if not asset:
            return CheckByHashResponse(
                exists=False,
                note="No asset found with this hash"
            )

        # Build list of providers this asset is uploaded to
        uploaded_providers = [asset.provider_id]
        if asset.provider_uploads:
            uploaded_providers.extend(asset.provider_uploads.keys())

        # Check if uploaded to specific provider (if requested)
        note = "Asset exists"
        if request.provider_id:
            if request.provider_id in uploaded_providers:
                note = f"Asset already uploaded to {request.provider_id}"
            else:
                note = f"Asset exists but not uploaded to {request.provider_id}"

        return CheckByHashResponse(
            exists=True,
            asset_id=asset.id,
            provider_id=asset.provider_id,
            uploaded_to_providers=uploaded_providers,
            note=note
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "check_by_hash_failed",
            sha256=request.sha256[:16],
            error=str(e),
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check asset by hash: {str(e)}"
        )


# ===== BATCH CHECK ASSETS BY HASH =====

class BatchCheckByHashRequest(BaseModel):
    """Request body for checking multiple assets by SHA256 hashes."""
    hashes: List[str] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="List of SHA256 hashes to check (max 500)"
    )


class BatchHashResult(BaseModel):
    """Result for a single hash in batch check."""
    sha256: str
    exists: bool
    asset_id: Optional[int] = None


class BatchCheckByHashResponse(BaseModel):
    """Response for batch hash check."""
    results: List[BatchHashResult] = Field(..., description="Results for each hash")
    found_count: int = Field(..., description="Number of hashes that matched existing assets")


@router.post("/check-by-hash-batch", response_model=BatchCheckByHashResponse)
async def check_assets_by_hash_batch(
    user: CurrentUser,
    asset_service: AssetSvc,
    request: BatchCheckByHashRequest,
):
    """
    Check if assets with the given SHA256 hashes already exist for the current user.

    Returns a list of results indicating which hashes have matching assets.
    This is a read-only check that does NOT modify any data.

    Use this to check multiple local files at once before uploading.
    """
    try:
        owner_user_id = get_effective_owner_user_id(user)

        from sqlmodel import select
        from pixsim7.backend.main.domain.assets.models import Asset

        # Validate hashes (64 hex chars)
        valid_hashes = [h for h in request.hashes if len(h) == 64]
        logger.debug(
            "batch_check_by_hash",
            user_id=owner_user_id,
            total_hashes=len(request.hashes),
            valid_hashes=len(valid_hashes),
        )
        if not valid_hashes:
            return BatchCheckByHashResponse(results=[], found_count=0)

        # Query all matching assets in one query
        stmt = select(Asset.sha256, Asset.id).where(
            Asset.user_id == owner_user_id,
            Asset.sha256.in_(valid_hashes)
        )
        result = await asset_service.db.execute(stmt)
        found_assets = {row.sha256: row.id for row in result.all()}
        logger.debug(
            "batch_check_by_hash_result",
            user_id=owner_user_id,
            found_count=len(found_assets),
        )

        # Build results
        results = []
        for sha256 in valid_hashes:
            asset_id = found_assets.get(sha256)
            results.append(BatchHashResult(
                sha256=sha256,
                exists=asset_id is not None,
                asset_id=asset_id
            ))

        return BatchCheckByHashResponse(
            results=results,
            found_count=len(found_assets)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "batch_check_by_hash_failed",
            hash_count=len(request.hashes),
            error=str(e),
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check assets by hash: {str(e)}"
        )


@router.post("/{asset_id}/sync", response_model=AssetResponse, status_code=http_status.HTTP_200_OK)
async def sync_asset(asset_id: int, user: CurrentUser, asset_service: AssetSvc):
    """Download remote provider asset locally and optionally extract embedded assets."""
    try:
        asset = await asset_service.sync_asset(asset_id=asset_id, user=user)
        return AssetResponse.model_validate(asset)
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Asset sync failed")


# ===== DELETE ASSET =====

@router.delete("/{asset_id}", status_code=204)
async def delete_asset(
    asset_id: int,
    user: CurrentUser,
    asset_service: AssetSvc,
    background_tasks: BackgroundTasks,
    delete_from_provider: bool = Query(
        default=True,
        description="Also delete asset from provider if it has a provider_asset_id"
    ),
):
    """
    Delete an asset

    Deletes the asset record and local file (if downloaded).
    Optionally deletes the asset from the provider (enabled by default).

    Users can only delete their own assets.
    """
    try:
        result = await asset_service.delete_asset(asset_id, user, delete_from_provider=delete_from_provider)
        # Run provider deletion and file cleanup in background so the
        # response returns immediately after the DB commit.
        if cleanup := result.get("post_commit_cleanup"):
            background_tasks.add_task(cleanup)
        return None

    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Asset not found")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete asset: {str(e)}")


# ===== ARCHIVE ASSET =====

class ArchiveAssetRequest(BaseModel):
    """Request body for archive/unarchive operation."""
    archived: bool = Field(description="True to archive, False to unarchive")


class ArchiveAssetResponse(BaseModel):
    """Response for archive operation."""
    id: int
    is_archived: bool
    message: str


@router.patch("/{asset_id}/archive", response_model=ArchiveAssetResponse)
async def archive_asset(
    asset_id: int,
    request: ArchiveAssetRequest,
    user: CurrentUser,
    asset_service: AssetSvc,
    db: DatabaseSession,
):
    """
    Archive or unarchive an asset.

    Archived assets are soft-hidden from the default gallery view but remain
    in the database and can be restored at any time.

    Example request:
    ```json
    {"archived": true}
    ```
    """
    try:
        asset = await asset_service.get_asset_for_user(asset_id, user)
        asset.is_archived = request.archived
        db.add(asset)
        await db.commit()
        await db.refresh(asset)

        action = "archived" if request.archived else "unarchived"
        return ArchiveAssetResponse(
            id=asset.id,
            is_archived=asset.is_archived,
            message=f"Asset {action} successfully"
        )

    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Asset not found")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.error(
            "archive_asset_failed",
            asset_id=asset_id,
            archived=request.archived,
            error=str(e),
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail=f"Failed to archive asset: {str(e)}")


# ===== SIGNAL ANALYSIS (heuristic broken-video scan + manual override) =====

class SignalScanResponse(BaseModel):
    id: int
    signal_metrics: Optional[dict] = Field(
        default=None,
        description="Result of the scan; null if asset wasn't eligible (non-video / no local file)",
    )


@router.post("/{asset_id}/scan-signal-metrics", response_model=SignalScanResponse)
async def scan_signal_metrics(
    asset_id: int,
    user: CurrentUser,
    asset_service: AssetSvc,
    db: DatabaseSession,
    force: bool = Query(default=True, description="Re-scan even if scanner_version matches"),
):
    """Run the broken-video heuristic scan on a single asset.

    Stamps `media_metadata.signal_metrics` with audio/visual metrics and a
    score. Preserves any existing `user_override`. Returns the new metrics
    payload (or null if the asset isn't eligible — non-video or no local file).
    """
    from pixsim7.backend.main.services.asset.signal_analysis import SignalAnalysisService
    try:
        asset = await asset_service.get_asset_for_user(asset_id, user)
        payload = await SignalAnalysisService(db).probe_and_stamp(asset, force=force)
        return SignalScanResponse(id=asset.id, signal_metrics=payload)
    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Asset not found")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.error("signal_scan_failed", asset_id=asset_id, error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to scan signal metrics: {str(e)}")


class SignalOverrideRequest(BaseModel):
    override: Optional[str] = Field(
        default=None,
        description="'clean' (kept), 'broken' (confirmed bad), or null to clear",
    )


class SignalOverrideResponse(BaseModel):
    id: int
    override: Optional[str]


@router.post("/{asset_id}/signal-override", response_model=SignalOverrideResponse)
async def set_signal_override(
    asset_id: int,
    request: SignalOverrideRequest,
    user: CurrentUser,
    asset_service: AssetSvc,
    db: DatabaseSession,
):
    """Set or clear the user's manual override on the signal-based heuristic.

    This decides whether the asset appears in `signal_likely_broken` /
    `signal_likely_clean` filters even when the heuristic score says otherwise.
    Stored as `media_metadata.signal_metrics.user_override`.
    """
    if request.override not in (None, "clean", "broken"):
        raise HTTPException(status_code=400, detail="override must be 'clean', 'broken', or null")
    try:
        asset = await asset_service.get_asset_for_user(asset_id, user)
        # Merge into media_metadata.signal_metrics without clobbering siblings.
        meta = dict(asset.media_metadata or {})
        signal_metrics = dict(meta.get("signal_metrics") or {})
        if request.override is None:
            signal_metrics.pop("user_override", None)
        else:
            signal_metrics["user_override"] = request.override
        meta["signal_metrics"] = signal_metrics
        asset.media_metadata = meta
        # SQLAlchemy mutation tracking on JSON columns: reassign to trigger update.
        db.add(asset)
        await db.commit()
        return SignalOverrideResponse(id=asset.id, override=request.override)
    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Asset not found")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.error("signal_override_failed", asset_id=asset_id, error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to set signal override: {str(e)}")


# ===== SERVE LOCAL ASSET FILE =====

@router.get("/{asset_id}/file")
async def serve_asset_file(
    asset_id: int,
    user: CurrentUser,
    asset_service: AssetSvc
):
    """
    Serve locally-stored asset file

    Returns the local file if it exists and the user owns the asset.
    This allows the frontend to display locally-stored assets even if
    the remote provider URL is unavailable or invalid.

    Prioritizes stored_key (content-addressed) over local_path for
    better deduplication support.
    """
    try:
        asset = await asset_service.get_asset_for_user(asset_id, user)

        # Determine file path to serve (prioritize stored_key for content-addressed storage)
        file_path = None
        if asset.stored_key:
            from pixsim7.backend.main.services.storage.storage_service import get_storage_service
            storage_service = get_storage_service()
            file_path = storage_service.get_path(asset.stored_key)
        elif asset.local_path:
            file_path = asset.local_path

        if not file_path:
            raise HTTPException(
                status_code=404,
                detail="Asset has no local file (sync_status is REMOTE)"
            )

        if not os.path.exists(file_path):
            raise HTTPException(
                status_code=404,
                detail=f"Local file not found at {file_path}"
            )

        # Determine media type
        media_type = asset.mime_type or "application/octet-stream"

        return FileResponse(
            path=file_path,
            media_type=media_type,
            filename=f"asset_{asset.id}{os.path.splitext(file_path)[1]}"
        )

    except HTTPException:
        raise
    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Asset not found")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.error(
            "serve_asset_file_failed",
            asset_id=asset_id,
            error=str(e),
            exc_info=True
        )
        raise HTTPException(status_code=500, detail=f"Failed to serve file: {str(e)}")


# ===== ASSET SIBLINGS (Same Input Variations) =====

@router.get("/{asset_id}/siblings")
async def get_asset_siblings(
    asset_id: int,
    user: CurrentUser,
    db: DatabaseSession,
    workspace_id: Optional[int] = Query(None, description="Filter by workspace"),
):
    """
    Find sibling assets - variations generated from the same inputs.

    Siblings share the same reproducible_hash (same prompt + same input assets, seed ignored).
    Useful for finding all variations of a generation attempt.

    Returns only assets owned by the current user for privacy.
    """
    from pixsim7.backend.main.services.generation.synthetic import find_sibling_assets

    try:
        owner_user_id = get_effective_owner_user_id(user)
        siblings = await find_sibling_assets(
            db,
            asset_id=asset_id,
            user_id=owner_user_id,
            workspace_id=workspace_id,
        )

        return {
            "asset_id": asset_id,
            "sibling_count": len(siblings),
            "siblings": [
                {
                    "id": s.id,
                    "provider_id": s.provider_id,
                    "provider_asset_id": s.provider_asset_id,
                    "media_type": s.media_type.value if s.media_type else None,
                    "thumbnail_url": s.thumbnail_url,
                    "remote_url": s.remote_url,
                    "created_at": s.created_at.isoformat() if s.created_at else None,
                }
                for s in siblings
            ],
        }
    except Exception as e:
        logger.error(
            "get_asset_siblings_failed",
            asset_id=asset_id,
            user_id=owner_user_id,
            error=str(e),
            exc_info=True
        )
        raise HTTPException(status_code=500, detail=f"Failed to find siblings: {str(e)}")
