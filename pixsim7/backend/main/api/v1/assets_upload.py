"""
Asset upload API endpoints

Upload, upload-from-url, frame extraction, and reupload operations.
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.params import Form as FormParam
from pydantic import BaseModel, Field
from typing import Optional
import json
import os
import tempfile
import hashlib
from types import SimpleNamespace

from pixsim7.backend.main.api.dependencies import CurrentUser, AssetSvc, AccountSvc, DatabaseSession
from pixsim7.backend.main.shared.schemas.asset_schemas import AssetResponse
from pixsim7.backend.main.shared.errors import ResourceNotFoundError, InvalidOperationError
from pixsim7.backend.main.domain.enums import MediaType, SyncStatus
from pixsim7.backend.main.services.asset.asset_factory import add_asset
from pixsim7.backend.main.domain.assets.upload_attribution import (
    build_upload_attribution_context,
    infer_upload_method,
)
from pixsim7.backend.main.shared.upload_context_schema import normalize_upload_context
from pixsim7.backend.main.api.v1.assets_upload_helper import prepare_upload
from pixsim_logging import get_logger

router = APIRouter(tags=["assets-upload"])
logger = get_logger()


# ===== SCHEMAS =====


def _unwrap_form_default(value):
    """
    FastAPI injects plain values for Form fields at runtime, but direct unit-test
    calls can leave `Form(...)` sentinel objects in place.
    """
    if isinstance(value, FormParam):
        return value.default
    return value

class UploadAssetResponse(BaseModel):
    provider_id: str
    media_type: MediaType
    external_url: str | None = None
    provider_asset_id: str | None = None
    asset_id: int | None = None
    note: str | None = None


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
    upload_method: Optional[str] = Field(
        default=None,
        description="Upload method identifier (e.g., web, local, pixverse_sync, generated)",
    )
    upload_context: Optional[dict] = Field(
        default=None,
        description="Optional upload context (validated against schema)",
    )
    skip_dedup: bool = Field(
        default=False,
        description="Skip phash deduplication check (for small region changes)",
    )


class ExtractFrameRequest(BaseModel):
    """Request to extract frame from video"""
    video_asset_id: int = Field(description="Source video asset ID")
    timestamp: float = Field(0, description="Time in seconds to extract frame", ge=0)
    frame_number: Optional[int] = Field(None, description="Optional frame number for metadata")
    last_frame: bool = Field(False, description="If true, extract the very last frame (ignores timestamp)")
    provider_id: Optional[str] = Field(None, description="If provided, upload extracted frame to this provider")


class ReuploadAssetRequest(BaseModel):
    """Request to upload an existing asset to a provider"""
    provider_id: str = Field(..., description="Target provider ID (e.g., 'pixverse')")


class ReuploadAssetResponse(BaseModel):
    """Response from asset reupload"""
    asset_id: int
    provider_id: str
    provider_asset_id: str
    message: str = "Asset uploaded to provider"


# ===== UPLOAD MEDIA (Provider-hosted) =====

@router.post("/upload", response_model=UploadAssetResponse)
async def upload_asset_to_provider(
    user: CurrentUser,
    db: DatabaseSession,
    account_service: AccountSvc,
    asset_service: AssetSvc,
    file: UploadFile = File(...),
    provider_id: Optional[str] = Form(None),
    save_target: str = Form(
        "provider",
        description="Where to save: 'provider' (upload externally) or 'library' (backend only)",
    ),
    source_folder_id: Optional[str] = Form(None),
    source_relative_path: Optional[str] = Form(None),
    upload_method: Optional[str] = Form(
        None,
        description="Upload method identifier (e.g., web, local, pixverse_sync, generated)",
    ),
    upload_context: Optional[str] = Form(
        None,
        description="Optional JSON-encoded upload context",
    ),
):
    """
    Upload media to a provider or save directly to backend library.

    - save_target='provider': provider_id is required and UploadService is used.
    - save_target='library': file is persisted in backend storage only.

    Optional source tracking fields:
    - source_folder_id: ID of local folder if uploaded from Local Folders panel
    - source_relative_path: Relative path within folder if uploaded from Local Folders
    - upload_method: Explicit upload method override (e.g., extension, api)
    - upload_context: JSON-encoded object with additional context
    """
    provider_id = _unwrap_form_default(provider_id)
    save_target = _unwrap_form_default(save_target)
    source_folder_id = _unwrap_form_default(source_folder_id)
    source_relative_path = _unwrap_form_default(source_relative_path)
    upload_method = _unwrap_form_default(upload_method)
    upload_context = _unwrap_form_default(upload_context)

    content_type = file.content_type or ""
    media_type = MediaType.IMAGE if content_type.startswith("image/") else MediaType.VIDEO if content_type.startswith("video/") else None
    if media_type is None:
        raise HTTPException(status_code=400, detail=f"Unsupported content type: {content_type}")

    save_target_value = (save_target or "provider").strip().lower()
    if save_target_value not in {"provider", "library"}:
        raise HTTPException(
            status_code=400,
            detail="save_target must be 'provider' or 'library'",
        )

    if save_target_value == "library":
        effective_provider_id = "local"
    else:
        effective_provider_id = (provider_id or "").strip()
        if not effective_provider_id:
            raise HTTPException(
                status_code=400,
                detail="provider_id is required when save_target='provider'",
            )
        if effective_provider_id == "local":
            raise HTTPException(
                status_code=400,
                detail="Use save_target='library' for backend-only saves.",
            )

    provider_id = effective_provider_id

    # Save to temp
    try:
        suffix = os.path.splitext(file.filename or "upload.bin")[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {e}")

    ext = os.path.splitext(file.filename or "upload.bin")[1] or (
        ".mp4" if media_type == MediaType.VIDEO else ".jpg"
    )
    user_prefs = user.preferences if isinstance(user.preferences, dict) else {}
    skip_similar = bool(user_prefs.get("skipSimilarCheck"))

    prep = await prepare_upload(
        tmp_path=tmp_path,
        user_id=user.id,
        media_type=media_type,
        asset_service=asset_service,
        provider_id=provider_id,
        file_ext=ext,
        skip_phash_dedup=skip_similar,
    )

    sha256 = prep.sha256
    image_hash = prep.image_hash
    phash64 = prep.phash64
    width = prep.width
    height = prep.height
    stored_key = prep.stored_key
    local_path = prep.local_path
    existing = prep.existing_asset

    # Library-only uploads require successful local persistence unless the
    # upload deduplicated to an asset already persisted on the local library.
    local_library_dedup = bool(existing and prep.dedup_note and "already on" in prep.dedup_note)
    if provider_id == "local" and (not stored_key or not local_path) and not local_library_dedup:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        raise HTTPException(
            status_code=500,
            detail="Failed to persist file for library-only upload.",
        )

    if existing and prep.dedup_note and "already on" in prep.dedup_note:
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

        provider_specific_id = existing.provider_uploads.get(provider_id) if existing.provider_uploads else None
        if not provider_specific_id:
            provider_specific_id = existing.provider_asset_id

        return UploadAssetResponse(
            provider_id=provider_id,
            media_type=existing.media_type,
            external_url=existing_external,
            provider_asset_id=provider_specific_id,
            asset_id=existing.id,
            note=prep.dedup_note,
        )

    if existing:
        already_on_provider = (
            existing.provider_id == provider_id or
            provider_id in (existing.provider_uploads or {})
        )
        if provider_id != "local" and not already_on_provider:
            logger.info(
                "asset_cross_provider_upload",
                asset_id=existing.id,
                original_provider=existing.provider_id,
                target_provider=provider_id,
                detail="Uploading duplicate asset to additional provider",
            )

    # Use UploadService for real provider uploads.
    # For provider_id='local', skip provider upload and store backend-only.
    try:
        if provider_id == "local":
            local_id_seed = sha256 or hashlib.sha256(content).hexdigest()
            result = SimpleNamespace(
                provider_id="local",
                media_type=media_type,
                external_url=None,
                provider_asset_id=f"local_{local_id_seed[:16]}",
                note="Saved to library (backend storage only).",
                width=width,
                height=height,
                mime_type=content_type,
                file_size_bytes=len(content),
            )
        else:
            from pixsim7.backend.main.services.upload.upload_service import UploadService
            upload_service = UploadService(db, account_service)
            result = await upload_service.upload(provider_id=provider_id, media_type=media_type, tmp_path=tmp_path)
        # Persist as Asset (best-effort):
        # Derive provider_asset_id and remote_url with fallbacks
        provider_asset_id_raw = result.external_url or result.provider_asset_id or ""
        remote_url = result.external_url or (f"{provider_id}:{provider_asset_id_raw}")
        if provider_id == "local":
            remote_url = None
        # Ensure provider_asset_id fits DB constraints (max_length=128)
        if provider_asset_id_raw:
            provider_asset_id = str(provider_asset_id_raw)
            if len(provider_asset_id) > 120:
                digest = hashlib.sha256(remote_url.encode("utf-8")).hexdigest()[:16]
                provider_asset_id = f"upload_{digest}"
        else:
            digest = hashlib.sha256(remote_url.encode("utf-8")).hexdigest()[:16]
            provider_asset_id = f"upload_{digest}"

        # Determine upload method (canonical source)
        upload_method = infer_upload_method(
            upload_method=upload_method,
            source_folder_id=source_folder_id,
        )

        # Parse optional upload context (JSON-encoded)
        upload_context_payload = None
        if upload_context:
            try:
                upload_context_payload = json.loads(upload_context)
            except json.JSONDecodeError as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"upload_context must be valid JSON: {e}",
                )
            if not isinstance(upload_context_payload, dict):
                raise HTTPException(
                    status_code=400,
                    detail="upload_context must be a JSON object",
                )

        context_input = dict(upload_context_payload or {})
        if source_folder_id and "source_folder_id" not in context_input:
            context_input["source_folder_id"] = source_folder_id
        if source_relative_path and "source_relative_path" not in context_input:
            context_input["source_relative_path"] = source_relative_path
        # Derive subfolder from relative path (e.g. "Characters/warrior.png" -> "Characters")
        if source_relative_path and "source_subfolder" not in context_input:
            parts = source_relative_path.replace("\\", "/").split("/")
            if len(parts) > 1:
                context_input["source_subfolder"] = parts[0]
        normalized_context = normalize_upload_context(upload_method, context_input)

        # Build upload attribution metadata (rich context only)
        upload_attribution = build_upload_attribution_context(
            upload_context=normalized_context,
        )

        media_metadata = {}
        if upload_attribution:
            media_metadata["upload_attribution"] = upload_attribution

        created_asset_id = None
        try:
            # Check if we're updating an existing asset (cross-provider upload)
            if provider_id != "local" and existing and not (existing.provider_id == provider_id or provider_id in (existing.provider_uploads or {})):
                # Update existing asset with new provider mapping
                # Reassign full dict so SQLAlchemy detects the JSON column change
                existing.provider_uploads = {
                    **(existing.provider_uploads or {}),
                    provider_id: provider_asset_id,
                }

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
                    asset_id=existing.id,
                    note=f"Reused existing asset (deduplicated by sha256, uploaded to {provider_id})",
                )
            else:
                # Create new asset with CAS storage
                new_asset = await add_asset(
                    db,
                    user_id=user.id,
                    media_type=media_type,
                    provider_id=provider_id,
                    provider_asset_id=provider_asset_id,
                    remote_url=remote_url,
                    width=width or result.width,
                    height=height or result.height,
                    duration_sec=None,
                    mime_type=result.mime_type or content_type,
                    file_size_bytes=result.file_size_bytes,
                    sha256=sha256,
                    stored_key=stored_key,
                    local_path=local_path,
                    sync_status=SyncStatus.DOWNLOADED if (stored_key or provider_id == "local") else SyncStatus.REMOTE,
                    image_hash=image_hash,
                    phash64=phash64,
                    media_metadata=media_metadata or None,
                    upload_method=upload_method,
                    upload_context=normalized_context or None,
                )

                if new_asset:
                    created_asset_id = new_asset.id

                # Queue thumbnail generation if we have a local copy
                if stored_key and new_asset:
                    try:
                        from pixsim7.backend.main.services.asset.ingestion import AssetIngestionService
                        ingestion_service = AssetIngestionService(db)
                        await ingestion_service.queue_ingestion(new_asset.id)
                    except Exception as e:
                        logger.warning(
                            "thumbnail_queue_failed",
                            asset_id=new_asset.id,
                            error=str(e),
                        )

                # Record upload history
                if new_asset:
                    try:
                        upload_history_method = "upload_to_library" if provider_id == "local" else "upload_to_provider"
                        await asset_service.record_upload_attempt(
                            new_asset,
                            provider_id=provider_id,
                            status='success',
                            method=upload_history_method,
                            context={"upload_method": upload_method},
                        )
                    except Exception as e:
                        logger.warning(
                            "upload_history_record_failed",
                            asset_id=new_asset.id,
                            error=str(e),
                        )

                # Create lineage if source_asset_id provided (for video captures and image crops)
                source_asset_id = normalized_context.get('source_asset_id') if normalized_context else None
                if source_asset_id and new_asset:
                    from pixsim7.backend.main.services.asset.asset_factory import create_capture_lineage

                    frame_time = normalized_context.get('frame_time') if normalized_context else None

                    try:
                        await create_capture_lineage(
                            db,
                            child_asset_id=new_asset.id,
                            parent_asset_id=source_asset_id,
                            upload_method=upload_method,
                            timestamp=frame_time,
                        )
                        logger.info(
                            "capture_lineage_created",
                            child_asset_id=new_asset.id,
                            parent_asset_id=source_asset_id,
                            upload_method=upload_method,
                        )
                    except Exception as e:
                        logger.warning(
                            "capture_lineage_failed",
                            child_asset_id=new_asset.id,
                            parent_asset_id=source_asset_id,
                            error=str(e),
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
            external_url=result.external_url or (f"/api/v1/assets/{created_asset_id}/file" if created_asset_id else None),
            provider_asset_id=result.provider_asset_id,
            asset_id=created_asset_id,
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

@router.post("/upload-from-url", response_model=UploadAssetResponse)
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
    import tempfile
    import base64

    url = request.url

    # Handle data URLs (from extension uploading local files)
    if url.startswith("data:"):
        try:
            # Parse data URL: data:[<mediatype>][;base64],<data>
            header, encoded = url.split(",", 1)
            content_type = header.split(":")[1].split(";")[0] if ":" in header else ""
            if ";base64" in header:
                content = base64.b64decode(encoded)
            else:
                content = encoded.encode("utf-8")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid data URL: {e}")
    elif url.startswith("http://") or url.startswith("https://"):
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
    else:
        raise HTTPException(status_code=400, detail="URL must be http(s) or data:")

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

    # Step 1: Save to temporary file for processing
    ext = mimetypes.guess_extension(content_type) or (".mp4" if media_type == MediaType.VIDEO else ".jpg")
    temp_local_path = tempfile.mktemp(suffix=ext)

    # Step 2: Save to temp location and compute metadata
    try:
        shutil.copy2(tmp_path, temp_local_path)
        file_size_bytes = os.path.getsize(temp_local_path)

        # Combine per-request flag with user preference
        user_prefs = user.preferences if isinstance(user.preferences, dict) else {}
        skip_similar = request.skip_dedup or bool(user_prefs.get("skipSimilarCheck"))

        prep = await prepare_upload(
            tmp_path=temp_local_path,
            user_id=user.id,
            media_type=media_type,
            asset_service=asset_service,
            provider_id=request.provider_id,
            file_ext=ext,
            skip_phash_dedup=skip_similar,
        )

        sha256 = prep.sha256
        width = prep.width
        height = prep.height
        image_hash = prep.image_hash
        phash64 = prep.phash64
        stored_key = prep.stored_key
        final_local_path = prep.local_path

        if not sha256:
            raise ValueError("Failed to compute sha256 for upload")

        if prep.existing_asset:
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

            existing = prep.existing_asset
            existing_external = existing.remote_url
            if not existing_external or not (
                existing_external.startswith("http://") or existing_external.startswith("https://")
            ):
                existing_external = f"/api/v1/assets/{existing.id}/file"

            provider_specific_id = existing.provider_uploads.get(request.provider_id) if existing.provider_uploads else None
            if not provider_specific_id:
                provider_specific_id = existing.provider_asset_id

            note = "Reused existing asset (deduplicated by sha256)"
            if prep.dedup_note and "phash" in prep.dedup_note:
                note = "Reused existing asset (phash match)"

            return UploadAssetResponse(
                provider_id=request.provider_id,
                media_type=existing.media_type,
                external_url=existing_external,
                provider_asset_id=provider_specific_id,
                asset_id=existing.id,
                note=note,
            )

        if not stored_key or not final_local_path:
            raise ValueError("Failed to store file")

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

    # Step 3: Try to upload to provider FIRST (before creating asset)
    # This prevents emitting asset:created event for assets that fail provider upload
    from pixsim7.backend.main.services.upload.upload_service import UploadService
    upload_service = UploadService(db, account_service)

    provider_upload_result = None
    provider_upload_error = None

    try:
        provider_upload_result = await upload_service.upload(
            provider_id=request.provider_id,
            media_type=media_type,
            tmp_path=final_local_path  # Upload from saved file
        )
        logger.info(
            "provider_upload_success",
            provider_id=request.provider_id,
            external_url=provider_upload_result.external_url,
            provider_asset_id=provider_upload_result.provider_asset_id,
        )
    except Exception as e:
        provider_upload_error = str(e)
        logger.warning(
            "provider_upload_failed",
            provider_id=request.provider_id,
            error=provider_upload_error,
            ensure_asset=request.ensure_asset,
            exc_info=True,
        )

        # If caller does NOT want a local-only asset, fail immediately without creating asset
        if not request.ensure_asset:
            # Clean up temp files
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
            raise HTTPException(
                status_code=502,
                detail=f"Provider upload failed: {provider_upload_error}",
            )

    # Step 4: Create asset in database (only after provider upload attempt)
    # Determine upload method (canonical source)
    upload_method = infer_upload_method(
        upload_method=request.upload_method,
        source_url=request.source_url,
        source_site=request.source_site,
    )

    context_input = dict(request.upload_context or {})
    if request.source_url and "source_url" not in context_input:
        context_input["source_url"] = request.source_url
    if request.source_site and "source_site" not in context_input:
        context_input["source_site"] = request.source_site
    normalized_context = normalize_upload_context(upload_method, context_input)

    # Build upload attribution metadata (rich context only)
    upload_attribution = build_upload_attribution_context(
        upload_context=normalized_context,
    )

    media_metadata = {}
    if upload_attribution:
        media_metadata["upload_attribution"] = upload_attribution

    # Determine provider_asset_id and remote_url based on upload result
    if provider_upload_result:
        provider_asset_id = provider_upload_result.provider_asset_id or f"local_{sha256[:16]}"
        remote_url = None
        if provider_upload_result.external_url:
            if provider_upload_result.external_url.startswith("http://") or provider_upload_result.external_url.startswith("https://"):
                remote_url = provider_upload_result.external_url
        provider_upload_note = provider_upload_result.note or "Uploaded to provider successfully"
    else:
        # Provider upload failed but ensure_asset=true, create local-only asset
        provider_asset_id = f"local_{sha256[:16]}"
        remote_url = None
        provider_upload_note = f"Asset saved locally; provider upload failed: {provider_upload_error}"

    try:
        asset = await add_asset(
            db,
            user_id=user.id,
            media_type=media_type,
            provider_id=request.provider_id,
            provider_asset_id=provider_asset_id,
            remote_url=remote_url,
            local_path=final_local_path,  # Content-addressed path
            stored_key=stored_key,  # Stable storage key
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
            upload_method=upload_method,
            upload_context=normalized_context or None,
        )

        logger.info(
            "asset_created",
            asset_id=asset.id,
            provider_id=request.provider_id,
            provider_upload_succeeded=provider_upload_result is not None,
        )

    except Exception as e:
        # Clean up temp files on failure
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
    finally:
        # Clean up temp file (stored_key file is already in permanent location)
        try:
            if os.path.exists(temp_local_path):
                os.unlink(temp_local_path)
        except Exception:
            pass

    # Clean up original temp file
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
        asset_id=asset.id,
        note=provider_upload_note,
    )


# ===== FRAME EXTRACTION =====

@router.post("/extract-frame", response_model=AssetResponse)
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

    If provider_id is specified, the extracted frame will be uploaded to that
    provider and the provider_uploads field will be populated.

    Example request:
    ```json
    {
      "video_asset_id": 123,
      "timestamp": 10.5,
      "frame_number": 315,
      "provider_id": "pixverse"
    }
    ```

    Returns:
    - Image asset (either existing or newly created)
    - Asset includes lineage link to parent video via AssetLineage
    - Based on settings and source video, may upload to provider
    """
    from pixsim7.backend.main.services.asset import get_media_settings

    try:
        # Get video asset first to determine source provider
        video_asset = await asset_service.get_asset_for_user(request.video_asset_id, user)

        frame_asset = await asset_service.create_asset_from_paused_frame(
            video_asset_id=request.video_asset_id,
            user=user,
            timestamp=request.timestamp,
            frame_number=request.frame_number,
            last_frame=request.last_frame,
        )

        # Determine upload target based on settings
        settings = get_media_settings()
        upload_behavior = settings.frame_extraction_upload
        target_provider_id = None

        if request.provider_id:
            # Explicit provider_id in request always takes precedence
            target_provider_id = request.provider_id
        elif upload_behavior == 'always':
            # Always upload to default provider
            target_provider_id = settings.default_upload_provider
        elif upload_behavior == 'source_provider' and video_asset.provider_id:
            # Upload to source video's provider
            target_provider_id = video_asset.provider_id
        # 'never' or no provider -> don't upload

        logger.info(
            "extract_frame_upload_decision",
            asset_id=frame_asset.id,
            upload_behavior=upload_behavior,
            source_provider=video_asset.provider_id,
            target_provider=target_provider_id,
        )

        # Upload to provider if determined
        if target_provider_id:
            try:
                provider_asset_id = await asset_service.get_asset_for_provider(
                    asset_id=frame_asset.id,
                    target_provider_id=target_provider_id
                )
                # Refresh asset to get updated provider_uploads
                frame_asset = await asset_service.get_asset(frame_asset.id)

                # Update remote_url to the provider URL (like badge uploads do)
                provider_url = frame_asset.provider_uploads.get(target_provider_id)
                if provider_url and provider_url.startswith('http'):
                    frame_asset.remote_url = provider_url
                    await asset_service.db.commit()
                    # Refresh again to get the updated remote_url
                    frame_asset = await asset_service.get_asset(frame_asset.id)

                logger.info(
                    "extract_frame_uploaded_to_provider",
                    asset_id=frame_asset.id,
                    provider_id=target_provider_id,
                    provider_asset_id=provider_asset_id,
                    remote_url=frame_asset.remote_url,
                )
            except Exception as upload_error:
                # Log but don't fail - asset was created successfully
                logger.warning(
                    "extract_frame_provider_upload_failed",
                    asset_id=frame_asset.id,
                    provider_id=target_provider_id,
                    error=str(upload_error),
                )
                # Refresh asset so response includes upload failure in last_upload_status_by_provider
                try:
                    frame_asset = await asset_service.get_asset(frame_asset.id)
                except Exception:
                    pass

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


# ===== ASSET REUPLOAD (UPLOAD EXISTING ASSET TO PROVIDER) =====

@router.post("/{asset_id}/reupload", response_model=ReuploadAssetResponse)
async def reupload_asset_to_provider(
    asset_id: int,
    request: ReuploadAssetRequest,
    user: CurrentUser,
    asset_service: AssetSvc,
):
    """
    Upload an existing asset to a specific provider.

    This is useful for:
    - Uploading extracted frames to a provider
    - Cross-provider operations (asset exists on one provider, need it on another)
    - Re-uploading assets that failed previous upload attempts

    The asset must already exist in the system (have a local file or remote URL).
    """
    # Verify asset belongs to user
    asset = await asset_service.get_asset_for_user(asset_id, user)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    try:
        # Use the cross-provider upload functionality
        provider_asset_id = await asset_service.get_asset_for_provider(
            asset_id=asset_id,
            target_provider_id=request.provider_id
        )

        return ReuploadAssetResponse(
            asset_id=asset_id,
            provider_id=request.provider_id,
            provider_asset_id=provider_asset_id,
        )
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(
            "reupload_asset_failed",
            asset_id=asset_id,
            provider_id=request.provider_id,
            error=str(e),
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload asset to provider: {str(e)}"
        )
