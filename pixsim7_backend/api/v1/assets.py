"""
Asset management API endpoints
"""
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form
from fastapi import status as http_status
from fastapi.responses import FileResponse
from pixsim7_backend.shared.errors import InvalidOperationError
from pixsim7_backend.api.dependencies import CurrentUser, AssetSvc, AccountSvc, DatabaseSession
from pixsim7_backend.shared.schemas.asset_schemas import (
    AssetResponse,
    AssetListResponse,
)
from pixsim7_backend.domain.enums import MediaType, SyncStatus, OperationType
from pixsim7_backend.shared.errors import ResourceNotFoundError
import os, tempfile, hashlib
from pydantic import BaseModel, Field
from typing import Optional
from pixsim7_backend.services.asset.asset_factory import add_asset
from pixsim_logging import get_logger

router = APIRouter()
logger = get_logger()


# ===== LIST ASSETS =====

@router.get("/assets", response_model=AssetListResponse)
async def list_assets(
    user: CurrentUser,
    asset_service: AssetSvc,
    media_type: MediaType | None = Query(None, description="Filter by media type"),
    sync_status: SyncStatus | None = Query(None, description="Filter by sync status"),
    provider_id: str | None = Query(None, description="Filter by provider"),
    tag: str | None = Query(None, description="Filter assets containing tag"),
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
        # For now use existing service offset pagination; cursor support will be layered later.
        assets = await asset_service.list_assets(
            user=user,
            media_type=media_type,
            sync_status=sync_status,
            provider_id=provider_id,
            limit=limit,
            offset=offset if cursor is None else 0,  # ignore offset if cursor used (future implementation)
        )

        # Simple total (future: separate COUNT query)
        total = len(assets)

        # Placeholder cursor logic (future: encode last asset created_at|id)
        next_cursor = None
        if len(assets) == limit:
            last = assets[-1]
            # Opaque format created_at|id
            next_cursor = f"{last.created_at.isoformat()}|{last.id}"

        # Filter by tag/q post-query (temporary until pushed into SQL)
        if tag:
            assets = [a for a in assets if tag in (a.tags or [])]
        if q:
            q_lower = q.lower()
            assets = [
                a for a in assets
                if (a.description and q_lower in a.description.lower()) or any(q_lower in t.lower() for t in (a.tags or []))
            ]

        return AssetListResponse(
            assets=[AssetResponse.model_validate(a) for a in assets],
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
    asset_service: AssetSvc
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
        return AssetResponse.model_validate(asset)

    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Asset not found")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get asset: {str(e)}")

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
    file: UploadFile = File(...),
    provider_id: str = Form(...),
):
    """
    Upload media to the specified provider (no cross-provider Pixverse override).

    Pixverse: OpenAPI (api_key/api_key_paid) usage is internal preference via UploadService.
    If provider rejects (e.g., unsupported mime/dimensions), returns error.
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

    # Use UploadService
    from pixsim7_backend.services.upload.upload_service import UploadService
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
        try:
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
                tags=["user_upload"],
            )
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
        except Exception:
            pass


# ===== UPLOAD FROM URL (backend fetches the image) =====

class UploadFromUrlRequest(BaseModel):
    url: str = Field(description="Publicly accessible URL to image/video")
    provider_id: str = Field(description="Target provider ID, e.g., pixverse")


@router.post("/assets/upload-from-url", response_model=UploadAssetResponse)
async def upload_asset_from_url(
    request: UploadFromUrlRequest,
    user: CurrentUser,
    db: DatabaseSession,
    account_service: AccountSvc,
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
            pass
        except ValueError:
            # Invalid duration output, skip validation
            pass

    # NEW WORKFLOW: Save locally FIRST, then optionally upload to provider
    # This ensures the asset is always accessible even if provider upload fails

    import shutil
    from PIL import Image

    # Step 1: Prepare local storage path
    storage_root = os.path.join("data", "storage", "user", str(user.id), "assets")
    os.makedirs(storage_root, exist_ok=True)

    # Generate temporary asset ID (will be replaced with actual ID after DB insert)
    temp_id = hashlib.sha256(f"{user.id}:{url}:{content[:100]}".encode()).hexdigest()[:16]
    ext = mimetypes.guess_extension(content_type) or (".mp4" if media_type == MediaType.VIDEO else ".jpg")
    temp_local_path = os.path.join(storage_root, f"temp_{temp_id}{ext}")

    # Step 2: Save to permanent local storage
    try:
        shutil.copy2(tmp_path, temp_local_path)
        file_size_bytes = os.path.getsize(temp_local_path)

        # Compute SHA256 for deduplication
        sha256_hash = hashlib.sha256()
        with open(temp_local_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256_hash.update(chunk)
        sha256 = sha256_hash.hexdigest()

        # Extract image dimensions if it's an image
        width = height = None
        if media_type == MediaType.IMAGE:
            try:
                with Image.open(temp_local_path) as img:
                    width, height = img.size
            except Exception as e:
                logger.warning(f"Failed to extract image dimensions: {e}")

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
            duration_sec=None,  # TODO: Extract for videos
            mime_type=content_type,
            file_size_bytes=file_size_bytes,
            sha256=sha256,
            tags=["user_upload", "from_url"],
        )

        # Rename file to use actual asset ID
        final_local_path = os.path.join(storage_root, f"{asset.id}{ext}")
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
        from pixsim7_backend.services.upload.upload_service import UploadService
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
        # Provider upload failed, but that's OK - we have local copy
        logger.warning(
            "provider_upload_failed_but_asset_saved",
            asset_id=asset.id,
            provider_id=request.provider_id,
            error=str(e),
            exc_info=True,
        )
        provider_upload_note = f"Asset saved locally; provider upload failed: {str(e)}"

    # Clean up temp file
    try:
        os.unlink(tmp_path)
    except Exception:
        pass

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
