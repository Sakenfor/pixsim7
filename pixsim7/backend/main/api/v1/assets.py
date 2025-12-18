"""
Asset management API endpoints

Handles asset upload, download, sync, and management operations.
"""
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form
from fastapi import status as http_status
from fastapi.responses import FileResponse
from pixsim7.backend.main.shared.errors import InvalidOperationError
from pixsim7.backend.main.api.dependencies import CurrentUser, AssetSvc, AccountSvc, DatabaseSession
from pixsim7.backend.main.shared.schemas.asset_schemas import (
    AssetResponse,
    AssetListResponse,
)
from pixsim7.backend.main.shared.schemas.tag_schemas import TagSummary, AssignTagsRequest
from pixsim7.backend.main.services.tag_service import TagService
from pixsim7.backend.main.domain.enums import MediaType, SyncStatus, OperationType
from pixsim7.backend.main.shared.errors import ResourceNotFoundError
import os, tempfile, hashlib
from pydantic import BaseModel, Field
from typing import Optional, List
from pixsim7.backend.main.services.asset.asset_factory import add_asset
from pixsim7.backend.main.services.asset.asset_hasher import compute_image_phash
from pixsim_logging import get_logger

router = APIRouter()
logger = get_logger()


# ===== HELPER FUNCTIONS =====

async def build_asset_response_with_tags(asset, db: DatabaseSession) -> AssetResponse:
    """
    Build AssetResponse with tags loaded from database.

    Args:
        asset: Asset model instance
        db: Database session

    Returns:
        AssetResponse with tags populated
    """
    # Get tags for this asset
    tag_service = TagService(db)
    tags = await tag_service.get_asset_tags(asset.id)

    # Compute provider_status
    provider_asset_id = getattr(asset, "provider_asset_id", None)
    provider_flagged = getattr(asset, "provider_flagged", False)
    remote_url = getattr(asset, "remote_url", None)

    if provider_flagged:
        status = "flagged"
    elif remote_url and (remote_url.startswith("http://") or remote_url.startswith("https://")):
        status = "ok"
    elif provider_asset_id and not provider_asset_id.startswith("local_"):
        status = "ok"
    elif provider_asset_id and provider_asset_id.startswith("local_"):
        status = "local_only"
    else:
        status = "unknown"

    # Build response
    ar = AssetResponse.model_validate(asset)
    ar.provider_status = status
    ar.tags = [TagSummary.model_validate(tag) for tag in tags]

    return ar


# ===== LIST ASSETS =====

@router.get("/assets", response_model=AssetListResponse)
async def list_assets(
    user: CurrentUser,
    asset_service: AssetSvc,
    db: DatabaseSession,
    media_type: MediaType | None = Query(None, description="Filter by media type"),
    sync_status: SyncStatus | None = Query(None, description="Filter by sync status"),
    provider_id: str | None = Query(None, description="Filter by provider"),
    tag: str | None = Query(None, description="Filter assets containing tag (slug)"),
    q: str | None = Query(None, description="Full-text search over description/tags"),
    limit: int = Query(50, ge=1, le=100, description="Results per page"),
    offset: int = Query(0, ge=0, description="Pagination offset (legacy)"),
    cursor: str | None = Query(None, description="Opaque cursor for pagination"),
):
    """List assets for current user with optional filters.

    Supports either offset or cursor pagination (cursor takes precedence if provided).
    Assets returned newest first (created_at DESC, id DESC for tie-break).
    """
    try:
        assets = await asset_service.list_assets(
            user=user,
            media_type=media_type,
            sync_status=sync_status,
            provider_id=provider_id,
            limit=limit,
            offset=offset if cursor is None else 0,
            cursor=cursor,
        )

        # Simple total (future: separate COUNT query)
        total = len(assets)

        # Placeholder cursor logic (future: encode last asset created_at|id)
        next_cursor = None
        if len(assets) == limit:
            last = assets[-1]
            # Opaque format created_at|id
            next_cursor = f"{last.created_at.isoformat()}|{last.id}"

        # TODO: Move tag/q filtering to SQL query in asset_service
        # For now, filter assets in-memory after loading tags

        # Build responses with tags
        asset_responses: list[AssetResponse] = []
        for a in assets:
            ar = await build_asset_response_with_tags(a, db)
            asset_responses.append(ar)

        # Filter by tag slug (post-query for now)
        if tag:
            tag_lower = tag.lower()
            asset_responses = [
                ar for ar in asset_responses
                if any(t.slug == tag_lower or tag_lower in t.slug for t in ar.tags)
            ]

        # Filter by search query
        if q:
            q_lower = q.lower()
            asset_responses = [
                ar for ar in asset_responses
                if (ar.description and q_lower in ar.description.lower()) or
                   any(q_lower in t.slug or q_lower in t.name or (t.display_name and q_lower in t.display_name.lower()) for t in ar.tags)
            ]

        return AssetListResponse(
            assets=asset_responses,
            total=total,
            limit=limit,
            offset=offset,
            next_cursor=next_cursor,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list assets: {str(e)}")


# ===== GET ASSET =====

@router.get("/assets/{asset_id}", response_model=AssetResponse)
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get asset: {str(e)}")


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


@router.post("/assets/check-by-hash", response_model=CheckByHashResponse)
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
        # Find asset by hash (read-only, doesn't update last_accessed_at)
        from sqlmodel import select
        from pixsim7.backend.main.domain.asset import Asset

        stmt = select(Asset).where(
            Asset.user_id == user.id,
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


@router.post("/assets/{asset_id}/sync", response_model=AssetResponse, status_code=http_status.HTTP_200_OK)
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

@router.delete("/assets/{asset_id}", status_code=204)
async def delete_asset(
    asset_id: int,
    user: CurrentUser,
    asset_service: AssetSvc
):
    """
    Delete an asset

    Deletes the asset record and local file (if downloaded).
    Does not delete the video from the provider.

    Users can only delete their own assets.
    """
    try:
        await asset_service.delete_asset(asset_id, user)
        return None

    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Asset not found")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete asset: {str(e)}")


# ===== SERVE LOCAL ASSET FILE =====

@router.get("/assets/{asset_id}/file")
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
    """
    try:
        asset = await asset_service.get_asset_for_user(asset_id, user)

        if not asset.local_path:
            raise HTTPException(
                status_code=404,
                detail="Asset has no local file (sync_status is REMOTE)"
            )

        if not os.path.exists(asset.local_path):
            raise HTTPException(
                status_code=404,
                detail=f"Local file not found at {asset.local_path}"
            )

        # Determine media type
        media_type = asset.mime_type or "application/octet-stream"

        return FileResponse(
            path=asset.local_path,
            media_type=media_type,
            filename=f"asset_{asset.id}{os.path.splitext(asset.local_path)[1]}"
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


# ===== UPLOAD MEDIA (Provider-hosted) =====

class UploadAssetResponse(BaseModel):
    provider_id: str
    media_type: MediaType
    external_url: str | None = None
    provider_asset_id: str | None = None
    note: str | None = None


@router.post("/assets/upload", response_model=UploadAssetResponse)
async def upload_asset_to_provider(
    user: CurrentUser,
    db: DatabaseSession,
    account_service: AccountSvc,
    asset_service: AssetSvc,
    file: UploadFile = File(...),
    provider_id: str = Form(...),
    source_folder_id: Optional[str] = Form(None),
    source_relative_path: Optional[str] = Form(None),
):
    """
    Upload media to the specified provider (no cross-provider Pixverse override).

    Pixverse: OpenAPI usage is internal preference via UploadService (based on api_keys).
    If provider rejects (e.g., unsupported mime/dimensions), returns error.

    Optional source tracking fields:
    - source_folder_id: ID of local folder if uploaded from Local Folders panel
    - source_relative_path: Relative path within folder if uploaded from Local Folders
    """
    content_type = file.content_type or ""
    media_type = MediaType.IMAGE if content_type.startswith("image/") else MediaType.VIDEO if content_type.startswith("video/") else None
    if media_type is None:
        raise HTTPException(status_code=400, detail=f"Unsupported content type: {content_type}")

    # Save to temp
    try:
        suffix = os.path.splitext(file.filename or "upload.bin")[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {e}")

    # Compute SHA256 for deduplication (best-effort, reuse AssetService helper)
    sha256: Optional[str] = None
    try:
        sha256 = asset_service._compute_sha256(tmp_path)
    except Exception as e:
        logger.warning(
            "asset_sha256_compute_failed",
            error=str(e),
            detail="Continuing upload without sha256 deduplication",
        )

    # If we have a hash, try to deduplicate before uploading to provider
    if sha256:
        try:
            existing = await asset_service.find_asset_by_hash(sha256, user.id)
        except Exception as e:
            existing = None
            logger.warning(
                "asset_dedup_lookup_failed",
                error=str(e),
                detail="Failed to check for existing asset by hash; continuing with new upload",
            )
        else:
            if existing:
                # Check if already uploaded to THIS provider
                already_on_provider = (
                    existing.provider_id == provider_id or
                    provider_id in (existing.provider_uploads or {})
                )

                if already_on_provider:
                    # Already exists on this provider - reuse without re-uploading
                    try:
                        os.unlink(tmp_path)
                    except Exception:
                        pass

                    existing_external = existing.remote_url
                    if not existing_external or not (
                        isinstance(existing_external, str)
                        and (existing_external.startswith("http://") or existing_external.startswith("https://"))
                    ):
                        existing_external = f"/api/v1/assets/{existing.id}/file"

                    # Get provider-specific asset ID
                    provider_specific_id = existing.provider_uploads.get(provider_id) if existing.provider_uploads else None
                    if not provider_specific_id:
                        provider_specific_id = existing.provider_asset_id

                    return UploadAssetResponse(
                        provider_id=provider_id,
                        media_type=existing.media_type,
                        external_url=existing_external,
                        provider_asset_id=provider_specific_id,
                        note=f"Reused existing asset (deduplicated by sha256, already on {provider_id})",
                    )
                else:
                    # Exists but NOT on this provider - upload to new provider and update provider_uploads
                    logger.info(
                        "asset_cross_provider_upload",
                        asset_id=existing.id,
                        original_provider=existing.provider_id,
                        target_provider=provider_id,
                        detail="Uploading duplicate asset to additional provider",
                    )
                    # Continue with upload, will update provider_uploads map below

    # Use UploadService
    from pixsim7.backend.main.services.upload.upload_service import UploadService
    upload_service = UploadService(db, account_service)
    try:
        result = await upload_service.upload(provider_id=provider_id, media_type=media_type, tmp_path=tmp_path)
        # Persist as Asset (best-effort):
        # Derive provider_asset_id and remote_url with fallbacks
        provider_asset_id_raw = result.provider_asset_id or (result.external_url or "")
        remote_url = result.external_url or (f"{provider_id}:{provider_asset_id_raw}")
        # Ensure provider_asset_id fits DB constraints (max_length=128)
        if provider_asset_id_raw:
            provider_asset_id = str(provider_asset_id_raw)
            if len(provider_asset_id) > 120:
                digest = hashlib.sha256(remote_url.encode("utf-8")).hexdigest()[:16]
                provider_asset_id = f"upload_{digest}"
        else:
            digest = hashlib.sha256(remote_url.encode("utf-8")).hexdigest()[:16]
            provider_asset_id = f"upload_{digest}"

        # Build upload context metadata
        upload_context = {}
        if source_folder_id or source_relative_path:
            upload_context["source"] = "local_folders"
            if source_folder_id:
                upload_context["source_folder_id"] = source_folder_id
            if source_relative_path:
                upload_context["source_relative_path"] = source_relative_path

        media_metadata = {}
        if upload_context:
            media_metadata["upload_history"] = {"context": upload_context}

        try:
            # Check if we're updating an existing asset (cross-provider upload)
            if existing and not (existing.provider_id == provider_id or provider_id in (existing.provider_uploads or {})):
                # Update existing asset with new provider mapping
                if not existing.provider_uploads:
                    existing.provider_uploads = {}
                existing.provider_uploads[provider_id] = provider_asset_id

                # Mark as modified
                db.add(existing)
                await db.commit()
                await db.refresh(existing)

                logger.info(
                    "asset_provider_uploads_updated",
                    asset_id=existing.id,
                    provider_id=provider_id,
                    provider_asset_id=provider_asset_id,
                )

                # Return existing asset with new provider info
                return UploadAssetResponse(
                    provider_id=provider_id,
                    media_type=existing.media_type,
                    external_url=remote_url,
                    provider_asset_id=provider_asset_id,
                    note=f"Reused existing asset (deduplicated by sha256, uploaded to {provider_id})",
                )
            else:
                # Create new asset
                await add_asset(
                    db,
                    user_id=user.id,
                    media_type=media_type,
                    provider_id=provider_id,
                    provider_asset_id=provider_asset_id,
                    remote_url=remote_url,
                    thumbnail_url=result.external_url,
                    width=result.width,
                    height=result.height,
                    duration_sec=None,
                    mime_type=result.mime_type or content_type,
                    file_size_bytes=result.file_size_bytes,
                    sha256=sha256,
                    media_metadata=media_metadata or None,
                )
                # TODO: Add "user_upload" tag using TagService after asset creation
        except Exception as e:
            # Non-fatal if asset creation fails; log and return upload response anyway
            logger.error(
                "asset_create_failed",
                provider_id=provider_id,
                media_type=str(media_type),
                remote_url=remote_url,
                error=str(e),
                exc_info=True,
            )
        return UploadAssetResponse(
            provider_id=result.provider_id,
            media_type=result.media_type,
            external_url=result.external_url,
            provider_asset_id=result.provider_asset_id,
            note=result.note,
        )
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Provider upload failed: {e}")
    finally:
        try:
            os.unlink(tmp_path)
        except Exception as e:
            logger.warning(
                "temp_file_cleanup_failed",
                file_path=tmp_path,
                error=str(e),
                detail="Failed to clean up temporary file after upload"
              )



# ===== UPLOAD FROM URL (backend fetches the image) =====

class UploadFromUrlRequest(BaseModel):
    url: str = Field(description="Publicly accessible URL to image/video")
    provider_id: str = Field(description="Target provider ID, e.g., pixverse")
    ensure_asset: bool = Field(
        default=True,
        description=(
            "If true (default), always persist a local asset even when the "
            "provider upload fails. If false, provider upload failures will "
            "roll back the asset creation and return an error."
        ),
    )
    source_url: Optional[str] = Field(
        default=None,
        description="Full page URL where asset was found (for extension uploads)"
    )
    source_site: Optional[str] = Field(
        default=None,
        description="Hostname/domain of source site (e.g., twitter.com)"
    )


@router.post("/assets/upload-from-url", response_model=UploadAssetResponse)
async def upload_asset_from_url(
    request: UploadFromUrlRequest,
    user: CurrentUser,
    db: DatabaseSession,
    account_service: AccountSvc,
    asset_service: AssetSvc,
):
    """
    Backend-side fetch of a remote URL and upload to the chosen provider.

    - Fetches bytes via HTTP(S)
    - Infers media type from Content-Type or URL suffix
    - Preps temp file and delegates to UploadService
    """
    import httpx
    import mimetypes

    url = request.url
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=400, detail="URL must be http(s)")

    # Fetch remote content
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True, headers={
            "User-Agent": "PixSim7/1.0 (+https://github.com/Sakenfor/pixsim7)"
        }) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            content = resp.content
            content_type = resp.headers.get("content-type", "")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch URL: {e}")

    # Infer media type
    media_type: MediaType | None = None
    if content_type.startswith("image/"):
        media_type = MediaType.IMAGE
    elif content_type.startswith("video/"):
        media_type = MediaType.VIDEO
    else:
        # Fallback by extension
        guess, _ = mimetypes.guess_type(url)
        if guess and guess.startswith("image/"):
            media_type = MediaType.IMAGE
        elif guess and guess.startswith("video/"):
            media_type = MediaType.VIDEO

    if media_type is None:
        raise HTTPException(status_code=400, detail=f"Unsupported content type: {content_type or 'unknown'}")

    # Save to temp
    try:
        suffix = mimetypes.guess_extension(content_type) or mimetypes.guess_extension(mimetypes.guess_type(url)[0] or "") or ".bin"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save temp file: {e}")

    # Validate video duration if it's a video (5-30 seconds)
    if media_type == MediaType.VIDEO:
        try:
            import subprocess
            result = subprocess.run(
                ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', tmp_path],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                duration = float(result.stdout.strip())
                if duration < 5 or duration > 30:
                    os.unlink(tmp_path)
                    raise HTTPException(
                        status_code=400,
                        detail=f"Video duration must be between 5-30 seconds (got {duration:.1f}s)"
                    )
        except subprocess.TimeoutExpired:
            os.unlink(tmp_path)
            raise HTTPException(status_code=500, detail="Video validation timeout")
        except FileNotFoundError:
            # ffprobe not available, skip validation
            logger.warning(
                "video_duration_validation_skipped",
                reason="ffprobe_not_found",
                detail="ffprobe tool not available, skipping video duration validation"
            )
        except ValueError as e:
            # Invalid duration output, skip validation
            logger.warning(
                "video_duration_validation_skipped",
                reason="invalid_duration_output",
                error=str(e),
                detail="Could not parse video duration from ffprobe output"
            )

    # NEW WORKFLOW: Save locally FIRST, then optionally upload to provider
    # This ensures the asset is always accessible even if provider upload fails

    import shutil
    from PIL import Image

    # Step 1: Prepare local storage path (use pathlib for cross-platform compatibility)
    # pathlib.Path works consistently across Windows, Linux, and Docker environments
    from pathlib import Path
    storage_root = Path("data/storage/user") / str(user.id) / "assets"
    storage_root.mkdir(parents=True, exist_ok=True)

    # Generate temporary asset ID (will be replaced with actual ID after DB insert)
    temp_id = hashlib.sha256(f"{user.id}:{url}:{content[:100]}".encode()).hexdigest()[:16]
    ext = mimetypes.guess_extension(content_type) or (".mp4" if media_type == MediaType.VIDEO else ".jpg")
    temp_local_path = str(storage_root / f"temp_{temp_id}{ext}")

    # Step 2: Save to permanent local storage
    try:
        shutil.copy2(tmp_path, temp_local_path)
        file_size_bytes = os.path.getsize(temp_local_path)

        # Compute SHA256 for deduplication (reuse helper)
        try:
            sha256 = asset_service._compute_sha256(temp_local_path)
        except Exception as e:
            logger.warning(
                "asset_sha256_compute_failed",
                error=str(e),
                detail="Continuing upload-from-url without sha256 deduplication",
            )
            sha256 = None

        # Deduplication: reuse existing asset with same hash for this user
        try:
            existing = await asset_service.find_asset_by_hash(sha256, user.id)
        except Exception as e:
            existing = None
            logger.warning(
                "asset_dedup_lookup_failed",
                error=str(e),
                detail="Failed to check for existing asset by hash; continuing with new asset",
            )

        if existing:
            # Clean up temp files since we're reusing an existing asset
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
            try:
                if os.path.exists(temp_local_path):
                    os.unlink(temp_local_path)
            except Exception:
                pass

            # Build external URL from existing asset (prefer remote_url, fallback to file endpoint)
            existing_external = existing.remote_url
            if not existing_external or not (
                existing_external.startswith("http://") or existing_external.startswith("https://")
            ):
                existing_external = f"/api/v1/assets/{existing.id}/file"

            return UploadAssetResponse(
                provider_id=request.provider_id,
                media_type=existing.media_type,
                external_url=existing_external,
                provider_asset_id=existing.provider_asset_id,
                note="Reused existing asset (deduplicated by sha256)",
            )

        # Extract image dimensions if it's an image and compute perceptual hash
        width = height = None
        image_hash: Optional[str] = None
        phash64: Optional[int] = None
        if media_type == MediaType.IMAGE:
            try:
                with Image.open(temp_local_path) as img:
                    width, height = img.size
                # Compute simple perceptual hash
                try:
                    image_hash, phash64 = compute_image_phash(temp_local_path)
                except Exception as e:
                    logger.warning(
                        "asset_phash_compute_failed",
                        error=str(e),
                        detail="Continuing without image_hash/phash64",
                    )
            except Exception as e:
                logger.warning(f"Failed to extract image dimensions: {e}")

        # Phash-based near-duplicate detection for images
        if phash64 is not None:
            try:
                similar = await asset_service.find_similar_asset_by_phash(phash64, user.id, max_distance=5)
            except Exception as e:
                similar = None
                logger.warning(
                    "asset_phash_lookup_failed",
                    error=str(e),
                    detail="Failed to check for similar asset by phash; continuing with new asset",
                )
            else:
                if similar:
                    # Clean up temp files since we're reusing an existing asset
                    try:
                        os.unlink(tmp_path)
                    except Exception:
                        pass
                    try:
                        if os.path.exists(temp_local_path):
                            os.unlink(temp_local_path)
                    except Exception:
                        pass

                    existing_external = similar.remote_url
                    if not existing_external or not (
                        existing_external.startswith("http://") or existing_external.startswith("https://")
                    ):
                        existing_external = f"/api/v1/assets/{similar.id}/file"

                    return UploadAssetResponse(
                        provider_id=request.provider_id,
                        media_type=similar.media_type,
                        external_url=existing_external,
                        provider_asset_id=similar.provider_asset_id,
                        note="Reused existing asset (phash match)",
                    )

        # Extract video duration if it's a video
        duration_sec = None
        if media_type == MediaType.VIDEO:
            from pixsim7.backend.main.shared.video_utils import extract_duration_safe
            duration_sec = extract_duration_safe(temp_local_path)
            if duration_sec:
                logger.debug(f"Extracted video duration: {duration_sec:.2f}s")
            else:
                logger.debug("Could not extract video duration (ffprobe not available or extraction failed)")

    except Exception as e:
        # Clean up temp files
        try:
            os.unlink(tmp_path)
            if os.path.exists(temp_local_path):
                os.unlink(temp_local_path)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Failed to save to local storage: {e}")

    # Step 3: Create asset in database with local storage (sync_status=DOWNLOADED)
    # Use placeholder provider_asset_id initially
    placeholder_provider_asset_id = f"local_{sha256[:16]}"

    # Build upload context metadata for extension uploads
    upload_context = {}
    if request.source_url or request.source_site:
        upload_context["source"] = "extension"
        if request.source_url:
            upload_context["source_url"] = request.source_url
        if request.source_site:
            upload_context["source_site"] = request.source_site

    media_metadata = {}
    if upload_context:
        media_metadata["upload_history"] = {"context": upload_context}

    try:
        asset = await add_asset(
            db,
            user_id=user.id,
            media_type=media_type,
            provider_id=request.provider_id,
            provider_asset_id=placeholder_provider_asset_id,
            remote_url=None,  # Will be set after provider upload
            thumbnail_url=None,  # Will use local file
            local_path=temp_local_path,  # Temporary path, will be renamed
            sync_status=SyncStatus.DOWNLOADED,  # Already have it locally!
            width=width,
            height=height,
            duration_sec=duration_sec,  # Extracted from video via ffprobe
            mime_type=content_type,
            file_size_bytes=file_size_bytes,
            sha256=sha256,
            image_hash=image_hash,
            phash64=phash64,
            media_metadata=media_metadata or None,
        )
        # TODO: Add "user_upload" and "from_url" tags using TagService after asset creation

        # Rename file to use actual asset ID
        final_local_path = str(storage_root / f"{asset.id}{ext}")
        shutil.move(temp_local_path, final_local_path)

        # Update asset with final local_path
        asset.local_path = final_local_path
        await db.commit()
        await db.refresh(asset)

    except Exception as e:
        # Clean up on failure
        try:
            os.unlink(tmp_path)
            if os.path.exists(temp_local_path):
                os.unlink(temp_local_path)
        except Exception:
            pass
        logger.error(
            "asset_create_failed",
            provider_id=request.provider_id,
            media_type=str(media_type),
            error=str(e),
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail=f"Failed to create asset: {e}")

    # Step 4: Try to upload to provider (BEST-EFFORT, non-blocking)
    # If this fails, the asset is still accessible via local storage
    provider_upload_result = None
    provider_upload_note = None

    try:
        from pixsim7.backend.main.services.upload.upload_service import UploadService
        upload_service = UploadService(db, account_service)

        result = await upload_service.upload(
            provider_id=request.provider_id,
            media_type=media_type,
            tmp_path=final_local_path  # Upload from saved file
        )

        # Update asset with provider information if upload succeeded
        if result.external_url:
            # Only set remote_url if it's a valid HTTP(S) URL
            if result.external_url.startswith("http://") or result.external_url.startswith("https://"):
                asset.remote_url = result.external_url
                asset.thumbnail_url = result.external_url

        if result.provider_asset_id:
            asset.provider_asset_id = result.provider_asset_id

        await db.commit()
        await db.refresh(asset)

        provider_upload_result = result
        provider_upload_note = result.note or "Uploaded to provider successfully"

        logger.info(
            "provider_upload_success",
            asset_id=asset.id,
            provider_id=request.provider_id,
            external_url=result.external_url,
            provider_asset_id=result.provider_asset_id,
        )

    except Exception as e:
        # Provider upload failed.
        logger.warning(
            "provider_upload_failed_but_asset_saved",
            asset_id=asset.id,
            provider_id=request.provider_id,
            error=str(e),
            exc_info=True,
        )
        provider_upload_note = f"Asset saved locally; provider upload failed: {str(e)}"

        # If the caller does NOT want a local-only asset, roll back and
        # propagate an error instead of keeping the asset.
        if not request.ensure_asset:
            try:
                await asset_service.delete_asset(asset.id, user)
            except Exception as delete_err:
                logger.error(
                    "asset_delete_after_provider_failure_failed",
                    asset_id=asset.id,
                    provider_id=request.provider_id,
                    error=str(delete_err),
                )
            raise HTTPException(
                status_code=502,
                detail=f"Provider upload failed: {str(e)}",
            )

    # Clean up temp file
    try:
        os.unlink(tmp_path)
    except Exception as e:
        logger.warning(
            "temp_file_cleanup_failed",
            file_path=tmp_path,
            error=str(e),
            detail="Failed to clean up temporary file, may need manual cleanup"
        )

    # Return response
    return UploadAssetResponse(
        provider_id=request.provider_id,
        media_type=media_type,
        external_url=asset.remote_url or f"/api/v1/assets/{asset.id}/file",
        provider_asset_id=asset.provider_asset_id,
        note=provider_upload_note,
    )


# ===== FRAME EXTRACTION =====

class ExtractFrameRequest(BaseModel):
    """Request to extract frame from video"""
    video_asset_id: int = Field(description="Source video asset ID")
    timestamp: float = Field(description="Time in seconds to extract frame", ge=0)
    frame_number: Optional[int] = Field(None, description="Optional frame number for metadata")


@router.post("/assets/extract-frame", response_model=AssetResponse)
async def extract_frame(
    request: ExtractFrameRequest,
    user: CurrentUser,
    asset_service: AssetSvc
):
    """
    Extract frame from video at specific timestamp

    Creates a new image asset with automatic deduplication:
    - If frame was previously extracted (same SHA256), returns existing asset
    - Otherwise creates new asset and links to parent video via lineage

    The extracted frame will have:
    - media_type: IMAGE
    - lineage link to parent video with PAUSED_FRAME relation
    - SHA256 hash for deduplication
    - Local storage (already downloaded)

    Example request:
    ```json
    {
      "video_asset_id": 123,
      "timestamp": 10.5,
      "frame_number": 315
    }
    ```

    Returns:
    - Image asset (either existing or newly created)
    - Asset includes lineage link to parent video via AssetLineage
    """
    try:
        frame_asset = await asset_service.create_asset_from_paused_frame(
            video_asset_id=request.video_asset_id,
            user=user,
            timestamp=request.timestamp,
            frame_number=request.frame_number
        )

        return AssetResponse.model_validate(frame_asset)

    except ResourceNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Video asset {request.video_asset_id} not found"
        )
    except InvalidOperationError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to extract frame: {str(e)}"
        )


# ===== TAG MANAGEMENT =====

@router.post("/assets/{asset_id}/tags/assign", response_model=AssetResponse)
async def assign_tags_to_asset(
    asset_id: int,
    request: AssignTagsRequest,
    user: CurrentUser,
    asset_service: AssetSvc,
    db: DatabaseSession,
):
    """
    Assign/remove tags to/from an asset using structured hierarchical tags.

    Example request:
    ```json
    {
      "add": ["character:alice", "location:tokyo", "style:anime"],
      "remove": ["old_tag:value"]
    }
    ```

    Tags are automatically:
    - Normalized (lowercase, trimmed)
    - Resolved to canonical tags (aliases are followed)
    - Created if they don't exist
    """
    try:
        # Verify asset ownership
        asset = await asset_service.get_asset_for_user(asset_id, user)

        # Create tag service
        tag_service = TagService(db)

        # Add tags
        if request.add:
            await tag_service.assign_tags_to_asset(
                asset_id=asset_id,
                tag_slugs=request.add,
                auto_create=True,
            )

        # Remove tags
        if request.remove:
            await tag_service.remove_tags_from_asset(
                asset_id=asset_id,
                tag_slugs=request.remove,
            )

        # Return updated asset
        return await build_asset_response_with_tags(asset, db)

    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Asset not found")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to assign tags: {str(e)}"
        )


# Note: Old tag endpoints below are kept for backward compatibility but deprecated
# Please use /assets/{asset_id}/tags/assign for new code


@router.post("/assets/{asset_id}/analyze")
async def analyze_asset_for_tags(
    asset_id: int,
    user: CurrentUser,
    asset_service: AssetSvc
):
    """
    Analyze an asset and suggest tags using AI

    Returns suggested tags based on:
    - Media type (image/video)
    - Visual content analysis (when available)
    - Existing metadata

    Example response:
    ```json
    {
      "suggested_tags": ["portrait", "outdoor", "daytime", "landscape"]
    }
    ```
    """
    try:
        # Get asset
        asset = await asset_service.get_asset_for_user(asset_id, user)

        # Generate suggestions based on available data
        suggestions = []

        # Add media type tag
        if asset.media_type:
            suggestions.append(asset.media_type.value)

        # Add provider tag
        if asset.provider_id:
            suggestions.append(f"from_{asset.provider_id}")

        # Analyze dimensions for orientation
        if asset.width and asset.height:
            if asset.width > asset.height:
                suggestions.append("landscape")
            elif asset.height > asset.width:
                suggestions.append("portrait")
            else:
                suggestions.append("square")

            # Add resolution tags
            if asset.width >= 1920 or asset.height >= 1080:
                suggestions.append("high_res")
            elif asset.width <= 640 or asset.height <= 480:
                suggestions.append("low_res")

        # Add duration-based tags for videos
        if asset.media_type == MediaType.VIDEO and asset.duration_sec:
            if asset.duration_sec <= 5:
                suggestions.append("short")
            elif asset.duration_sec >= 20:
                suggestions.append("long")

            suggestions.append("cinematic")

        # Add existing tags to help user understand what's already there
        existing_tags = asset.tags or []

        # TODO: In the future, integrate with actual AI vision models like:
        # - CLIP for semantic understanding
        # - Object detection models
        # - Scene classification
        # For now, provide basic heuristic-based suggestions

        return {
            "suggested_tags": suggestions,
            "existing_tags": existing_tags,
            "asset_id": asset.id,
            "media_type": asset.media_type.value
        }

    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Asset not found")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to analyze asset: {str(e)}"
        )


# NOTE: Old tag endpoints removed - use /assets/{asset_id}/tags/assign instead
# The new endpoint supports both add and remove operations in a single call


class ReuploadAssetRequest(BaseModel):
    """Request to re-upload an existing asset to a provider."""
    provider_id: str = Field(description="Target provider ID, e.g., pixverse")


@router.post(
    "/assets/{asset_id}/reupload",
    response_model=UploadAssetResponse,
    status_code=http_status.HTTP_200_OK,
)
async def reupload_asset_to_provider(
    asset_id: int,
    request: ReuploadAssetRequest,
    user: CurrentUser,
    asset_service: AssetSvc,
) -> UploadAssetResponse:
    """
    Re-upload an existing asset to a provider, caching the provider-specific ID.

    Uses the sync service helper to upload and cache the provider-specific asset ID.
    """
    try:
        provider_id = request.provider_id
        # Ensure asset exists and belongs to the user
        asset = await asset_service.get_asset_for_user(asset_id, user)

        # Upload to provider using the sync service helper and cache the result
        provider_asset_id = await asset_service._upload_to_provider(asset, provider_id)
        await asset_service.cache_provider_upload(asset_id, provider_id, provider_asset_id)

        return UploadAssetResponse(
            provider_id=provider_id,
            media_type=asset.media_type,
            external_url=asset.remote_url,
            provider_asset_id=provider_asset_id,
            note=None,
        )
    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Asset not found")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(
            "reupload_asset_failed",
            asset_id=asset_id,
            provider_id=request.provider_id,
            error=str(e),
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to re-upload asset: {str(e)}",
        )


# ===== BULK OPERATIONS =====

class BulkTagRequest(BaseModel):
    """Request for bulk tag operations"""
    asset_ids: List[int] = Field(description="List of asset IDs")
    tags: List[str] = Field(description="Tags to apply")
    mode: str = Field(default="add", description="Operation mode: add, remove, or replace")


class BulkDeleteRequest(BaseModel):
    """Request for bulk delete"""
    asset_ids: List[int] = Field(description="List of asset IDs to delete")


class BulkExportRequest(BaseModel):
    """Request for bulk export"""
    asset_ids: List[int] = Field(description="List of asset IDs to export")


@router.post("/assets/bulk/tags")
async def bulk_update_tags(
    request: BulkTagRequest,
    user: CurrentUser,
    asset_service: AssetSvc
):
    """
    Update tags for multiple assets at once

    Modes:
    - "add": Add tags to existing tags
    - "remove": Remove specified tags
    - "replace": Replace all tags with new ones

    Example request:
    ```json
    {
      "asset_ids": [1, 2, 3],
      "tags": ["batch_processed", "2024"],
      "mode": "add"
    }
    ```
    """
    try:
        assets = await asset_service.bulk_update_tags(
            asset_ids=request.asset_ids,
            tags=request.tags,
            user=user,
            mode=request.mode
        )
        return {
            "success": True,
            "updated_count": len(assets),
            "asset_ids": [a.id for a in assets]
        }

    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to bulk update tags: {str(e)}"
        )


@router.post("/assets/bulk/delete")
async def bulk_delete_assets(
    request: BulkDeleteRequest,
    user: CurrentUser,
    asset_service: AssetSvc
):
    """
    Delete multiple assets at once

    Example request:
    ```json
    {
      "asset_ids": [1, 2, 3]
    }
    ```
    """
    try:
        deleted_count = 0
        errors = []

        for asset_id in request.asset_ids:
            try:
                await asset_service.delete_asset(asset_id, user)
                deleted_count += 1
            except Exception as e:
                errors.append({
                    "asset_id": asset_id,
                    "error": str(e)
                })

        return {
            "success": True,
            "deleted_count": deleted_count,
            "total_requested": len(request.asset_ids),
            "errors": errors if errors else None
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to bulk delete: {str(e)}"
        )


@router.post("/assets/bulk/export")
async def bulk_export_assets(
    request: BulkExportRequest,
    user: CurrentUser,
    asset_service: AssetSvc
):
    """
    Export multiple assets as a ZIP file

    Example request:
    ```json
    {
      "asset_ids": [1, 2, 3]
    }
    ```

    Returns a download URL for the generated ZIP file
    """
    import zipfile
    import tempfile
    import shutil
    from pathlib import Path

    try:
        # Create temporary directory for ZIP
        temp_dir = tempfile.mkdtemp()
        zip_path = os.path.join(temp_dir, f"export_{user.id}_{datetime.utcnow().timestamp()}.zip")

        # Create ZIP file
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for asset_id in request.asset_ids:
                try:
                    # Get asset
                    asset = await asset_service.get_asset_for_user(asset_id, user)

                    # Determine file path
                    if asset.local_path and os.path.exists(asset.local_path):
                        file_path = asset.local_path
                    else:
                        # Skip assets without local files
                        logger.warning(f"Asset {asset_id} has no local file, skipping")
                        continue

                    # Determine filename for ZIP
                    ext = os.path.splitext(file_path)[1] or ".bin"
                    zip_filename = f"asset_{asset.id}_{asset.provider_id}{ext}"

                    # Add to ZIP
                    zipf.write(file_path, zip_filename)

                except Exception as e:
                    logger.error(f"Failed to add asset {asset_id} to ZIP: {e}")
                    continue

        # Move ZIP to permanent storage (in exports directory)
        export_dir = Path("data/exports")
        export_dir.mkdir(parents=True, exist_ok=True)

        zip_filename = f"export_{user.id}_{int(datetime.utcnow().timestamp())}.zip"
        final_path = export_dir / zip_filename
        shutil.move(zip_path, final_path)

        # Clean up temp directory
        shutil.rmtree(temp_dir, ignore_errors=True)

        # Return download URL
        download_url = f"/api/v1/assets/downloads/{zip_filename}"

        return {
            "success": True,
            "download_url": download_url,
            "filename": zip_filename,
            "asset_count": len(request.asset_ids)
        }

    except Exception as e:
        # Clean up on error
        if 'temp_dir' in locals():
            shutil.rmtree(temp_dir, ignore_errors=True)

        logger.error(
            "bulk_export_failed",
            asset_ids=request.asset_ids,
            error=str(e),
            exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to export assets: {str(e)}"
        )


@router.get("/assets/downloads/{filename}")
async def download_export(
    filename: str,
    user: CurrentUser
):
    """
    Download an exported ZIP file

    Files are automatically cleaned up after 24 hours
    """
    from pathlib import Path

    # Security: validate filename (no path traversal)
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    # Verify filename matches user ID
    if not filename.startswith(f"export_{user.id}_"):
        raise HTTPException(status_code=403, detail="Access denied")

    export_path = Path("data/exports") / filename

    if not export_path.exists():
        raise HTTPException(status_code=404, detail="Export file not found")

    return FileResponse(
        path=str(export_path),
        media_type="application/zip",
        filename=filename
    )
