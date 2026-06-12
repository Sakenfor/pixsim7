"""
Media API endpoints

Handles:
- Media serving with caching headers
- Media settings management
- Ingestion control
"""
import asyncio
import os
import mimetypes
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel, Field

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession, MediaUser
from pixsim7.backend.main.infrastructure.queue.tasks import queue_and_wait
from pixsim7.backend.main.services.asset import AssetIngestionService
from pixsim7.backend.main.services.media import get_media_settings
from pixsim7.backend.main.services.media.settings import MediaSettings
from pixsim7.backend.main.services.storage import get_storage_service
from pixsim7.backend.main.services.storage.roots import LOCAL_ROOT_ID
from pixsim7.backend.main.shared.config import settings as app_settings
from pixsim7.backend.main.shared.path_registry import get_path_registry
from pixsim_logging import get_logger

router = APIRouter()
logger = get_logger()


# ===== MEDIA SETTINGS =====
# Response model = MediaSettings itself (Pydantic BaseModel)
# Update model = auto-generated with all fields Optional
MediaSettingsUpdate = MediaSettings.get_update_model()


@router.get("/media/settings", response_model=MediaSettings)
async def get_settings(_user: CurrentUser):
    """
    Get media settings.

    Returns current media ingestion and serving settings.
    """
    return get_media_settings()


@router.patch("/media/settings", response_model=MediaSettings)
async def update_settings(
    updates: MediaSettingsUpdate,
    user: CurrentUser,
    db: DatabaseSession,
):
    """
    Update media settings.

    Only admins can update media settings.
    """
    if not user.is_admin():
        raise HTTPException(
            status_code=403,
            detail="Only admins can update media settings"
        )

    settings = get_media_settings()

    update_dict = updates.model_dump(exclude_none=True)
    if update_dict:
        settings.update(update_dict)

        # Persist to DB
        from pixsim7.backend.main.services.system_config import set_config
        await set_config(db, "media_settings", settings.to_dict(), user.id)

    return settings


# ===== INGESTION CONTROL =====

class IngestionStatsResponse(BaseModel):
    """Ingestion queue statistics"""
    pending: int
    processing: int
    completed: int
    failed: int
    not_ingested: int


@router.get("/media/ingestion/stats", response_model=IngestionStatsResponse)
async def get_ingestion_stats(
    user: CurrentUser,
    db: DatabaseSession,
):
    """
    Get ingestion queue statistics.

    Returns counts of assets in each ingestion state.
    """
    service = AssetIngestionService(db)
    stats = await service.get_ingestion_stats()
    return IngestionStatsResponse(**stats)


_TRIGGER_INGESTION_TIMEOUT_SECONDS = 180.0


@router.post("/media/ingestion/trigger/{asset_id}")
async def trigger_ingestion(
    asset_id: int,
    user: CurrentUser,
    db: DatabaseSession,
    force: bool = Query(False, description="Re-ingest even if already completed"),
    regenerate_thumbnails: bool = Query(False, description="Force regenerate thumbnails only"),
    regenerate_previews: bool = Query(False, description="Force regenerate previews only"),
    regenerate_metadata: bool = Query(False, description="Force extract metadata only"),
):
    """
    Trigger ingestion for a specific asset.

    Downloads the asset from provider, stores locally, extracts metadata,
    and generates thumbnails and previews.

    Runs as an ARQ ``process_ingestion`` job, deduplicated against any other
    in-flight ingestion for the same asset (job_id ``ingest:{asset_id}``).
    A concurrent ``asset:created`` event handler enqueue, or a second API
    trigger, attaches to the same job rather than racing on the asset's
    content-addressed file.

    Selective regeneration:
    - regenerate_thumbnails: Only regenerate thumbnails
    - regenerate_previews: Only regenerate previews
    - regenerate_metadata: Only extract metadata
    - force: Full re-ingestion (all steps)
    """
    selective = regenerate_thumbnails or regenerate_previews or regenerate_metadata

    if selective:
        job_kwargs = dict(
            force=True,  # Allow regeneration even if marked complete
            store_for_serving=False,  # Don't re-store
            extract_metadata=regenerate_metadata or force,
            generate_thumbnails=regenerate_thumbnails or force,
            generate_previews=regenerate_previews or force,
            # Run derivatives inline so the worker's return value carries
            # the final thumbnail/preview keys for this response.
            derivatives_mode="inline",
        )
    else:
        job_kwargs = dict(
            force=force,
            derivatives_mode="inline",
        )

    try:
        result = await queue_and_wait(
            "process_ingestion",
            asset_id,
            job_id=f"ingest:{asset_id}",
            timeout=_TRIGGER_INGESTION_TIMEOUT_SECONDS,
            **job_kwargs,
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail=f"Ingestion did not complete within {_TRIGGER_INGESTION_TIMEOUT_SECONDS:.0f}s",
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        log_event = "regeneration_failed" if selective else "ingestion_trigger_failed"
        logger.error(
            log_event,
            asset_id=asset_id,
            error=str(e),
            exc_info=True,
        )
        prefix = "Regeneration" if selective else "Ingestion"
        raise HTTPException(status_code=500, detail=f"{prefix} failed: {str(e)}")

    response = {
        "success": result.get("status") == "ok",
        "asset_id": asset_id,
        "ingest_status": result.get("ingest_status"),
        "stored_key": result.get("stored_key"),
        "thumbnail_key": result.get("thumbnail_key"),
        "preview_key": result.get("preview_key"),
    }
    if selective:
        response["regenerated"] = {
            "thumbnails": regenerate_thumbnails,
            "previews": regenerate_previews,
            "metadata": regenerate_metadata,
        }
    return response


@router.post("/media/ingestion/retry/{asset_id}")
async def retry_failed_ingestion(
    asset_id: int,
    user: CurrentUser,
    db: DatabaseSession,
):
    """
    Retry ingestion for a failed asset.
    """
    service = AssetIngestionService(db)

    try:
        asset = await service.retry_failed(asset_id)
        return {
            "success": True,
            "asset_id": asset.id,
            "ingest_status": asset.ingest_status,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Retry failed: {str(e)}")


@router.post("/media/ingestion/process-batch")
async def process_pending_batch(
    user: CurrentUser,
    db: DatabaseSession,
    limit: int = Query(10, ge=1, le=100, description="Maximum assets to process"),
):
    """
    Process a batch of pending ingestion jobs.

    Typically called by a background worker, but can be triggered manually.
    """
    if not user.is_admin():
        raise HTTPException(
            status_code=403,
            detail="Only admins can trigger batch processing"
        )

    service = AssetIngestionService(db)
    processed = await service.process_pending_batch(limit)

    return {
        "success": True,
        "processed_count": processed,
    }


# ===== MEDIA SERVING =====


async def _try_regenerate_derivative(
    db,
    user_id: int,
    key: str,
) -> bool:
    """
    Try to regenerate a missing thumbnail or preview.

    Looks up the asset by thumbnail_key or preview_key and enqueues a
    ``process_derivatives`` ARQ job if the source file exists.  Concurrent
    requests for the same asset's missing derivatives collapse to one job
    via ARQ's ``_job_id`` dedup.

    Returns True if regeneration was queued, False otherwise.
    """
    from sqlalchemy import select
    from pixsim7.backend.main.domain.assets.models import Asset

    try:
        # Find asset by thumbnail_key or preview_key
        is_thumbnail = "/thumbnails/" in key
        is_preview = "/previews/" in key

        if is_thumbnail:
            result = await db.execute(
                select(Asset).where(
                    Asset.user_id == user_id,
                    Asset.thumbnail_key == key,
                )
            )
        elif is_preview:
            result = await db.execute(
                select(Asset).where(
                    Asset.user_id == user_id,
                    Asset.preview_key == key,
                )
            )
        else:
            return False

        asset = result.scalar_one_or_none()
        if not asset:
            logger.debug(
                "regenerate_derivative_no_asset",
                key=key,
                user_id=user_id,
            )
            return False

        # Source must be obtainable by the derivatives worker: a local file on
        # disk, an archived original (reachable via stored_key on a non-local
        # root — the worker pulls a temp copy), or a remote URL to re-download.
        has_local = bool(asset.local_path and os.path.exists(asset.local_path))
        if not (has_local or asset.stored_key or asset.remote_url):
            logger.debug(
                "regenerate_derivative_no_source",
                asset_id=asset.id,
                local_path=asset.local_path,
                stored_key=asset.stored_key,
            )
            return False

        from pixsim7.backend.main.infrastructure.queue.tasks import queue_task

        await queue_task(
            "process_derivatives",
            asset.id,
            force=True,
            generate_thumbnails=is_thumbnail,
            generate_previews=is_preview,
            _job_id=f"derivatives:{asset.id}",
        )

        logger.info(
            "derivative_regeneration_queued",
            asset_id=asset.id,
            key=key,
            type="thumbnail" if is_thumbnail else "preview",
        )
        return True

    except Exception as e:
        logger.warning(
            "regenerate_derivative_error",
            key=key,
            error=str(e),
        )
        return False


async def _resolve_storage_root_id(db, user_id: int, key: str) -> str:
    """
    Resolve which storage root a media key lives on (plan media-storage-tiering).

    Fast path: derivative keys (``/thumbnails/``, ``/previews/``) always live on
    the local root — no DB hit. Content originals are looked up by ``stored_key``
    to read their ``storage_root_id`` (NULL → local). Unknown keys → local.
    """
    if "/thumbnails/" in key or "/previews/" in key:
        return LOCAL_ROOT_ID
    from sqlalchemy import select
    from pixsim7.backend.main.domain.assets.models import Asset

    root = (
        await db.execute(
            select(Asset.storage_root_id)
            .where(Asset.user_id == user_id, Asset.stored_key == key)
            .limit(1)
        )
    ).scalar_one_or_none()
    return root or LOCAL_ROOT_ID


def _archive_serve_mode() -> str:
    mode = getattr(app_settings, "media_archive_serve_mode", "redirect")
    return mode if mode in ("redirect", "proxy") else "redirect"


async def _archive_remote_fallback(db, user_id: int, key: str) -> Optional[RedirectResponse]:
    """
    Fall back to the asset's provider ``remote_url`` when an archived original
    can't be served from its storage root (store offline, or object deleted).

    Looks the asset up by ``stored_key`` (user-scoped) and, if it still carries a
    valid HTTP(S) ``remote_url`` (e.g. the pixverse CDN copy), returns a 307 to
    it so the gallery keeps working off the second copy. Returns None when the
    feature is disabled or no usable remote URL exists — the caller then raises
    the classified 503/404 miss. See plan media-storage-tiering Phase H.
    """
    if not getattr(app_settings, "media_archive_remote_fallback", True):
        return None

    from sqlalchemy import select
    from pixsim7.backend.main.domain.assets.models import Asset

    try:
        remote_url = (
            await db.execute(
                select(Asset.remote_url)
                .where(Asset.user_id == user_id, Asset.stored_key == key)
                .limit(1)
            )
        ).scalar_one_or_none()
    except Exception as e:  # noqa: BLE001 — fallback is best-effort
        logger.warning("archive_remote_fallback_lookup_failed", key=key, error=str(e))
        return None

    if remote_url and remote_url.startswith(("http://", "https://")):
        logger.info("archive_remote_fallback", key=key, remote_url=remote_url[:80])
        return RedirectResponse(remote_url, status_code=307)
    return None


async def _archive_miss(storage, key: str, root_id: str) -> HTTPException:
    """
    Classify a "can't serve this archived original" miss.

    Distinguishes *archived-but-offline* (the storage root is unreachable —
    503, a clear retryable state) from *deleted* (the root is reachable but the
    object is gone — 404). Returns the HTTPException to raise. See plan
    media-storage-tiering Phase H.
    """
    probe = await storage.probe_root(root_id)
    if probe.get("online") is False:
        logger.warning(
            "archive_offline", key=key, root_id=root_id, error=probe.get("error")
        )
        return HTTPException(
            status_code=503,
            detail="Media archive offline — file is archived but the store is unreachable",
            headers={"X-Media-State": "archived-offline", "Retry-After": "30"},
        )
    return HTTPException(status_code=404, detail="File not found")


async def _proxy_archive_stream(storage, key: str, root_id: str, request: Request, db=None, user_id: Optional[int] = None):
    """Stream a non-local object through the backend (proxy fallback)."""
    range_header = request.headers.get("range")
    try:
        status, headers, content_type, body_iter = await storage.open_stream(
            key, root_id=root_id, range_header=range_header
        )
    except FileNotFoundError:
        # Could be offline (store down) or deleted (object gone). Prefer the
        # provider remote_url second copy before failing with a classified miss.
        if db is not None and user_id is not None:
            fb = await _archive_remote_fallback(db, user_id, key)
            if fb is not None:
                return fb
        raise await _archive_miss(storage, key, root_id)
    except NotImplementedError:
        raise HTTPException(status_code=500, detail="Archive backend cannot stream")
    return StreamingResponse(
        body_iter, status_code=status, media_type=content_type, headers=headers
    )


class MediaTokenResponse(BaseModel):
    """Short-lived token for streaming media via element ``src`` query string."""
    token: str = Field(description="Short-lived media token (carry as ?token=)")
    expires_in: int = Field(description="Seconds until the token expires")


# Defined before the `/media/{key:path}` catch-all so it isn't swallowed as a
# media key.
@router.get("/media/auth-token", response_model=MediaTokenResponse)
async def get_media_auth_token(user: CurrentUser):
    """Mint a short-lived, read-only media token for the current user.

    Native ``<video>``/``<img>`` elements can't send an Authorization header, so
    the client carries this token in the URL query string to stream backend
    media directly (enabling native HTTP Range / progressive playback instead
    of downloading the whole file into a blob first).
    """
    from pixsim7.backend.main.services.user.token_policy import (
        TokenKind,
        get_default_ttl,
        mint_token,
    )

    ttl = get_default_ttl(TokenKind.MEDIA)
    token = mint_token(TokenKind.MEDIA, user_id=user.id)
    return MediaTokenResponse(token=token, expires_in=int(ttl.total_seconds()))


@router.get("/media/{key:path}")
async def serve_media(
    key: str,
    user: MediaUser,
    db: DatabaseSession,
    request: Request,
    response: Response,
):
    """
    Serve stored media files.

    Returns file with appropriate caching headers:
    - Cache-Control with configurable max-age
    - ETag for conditional requests
    - Content-Type based on file extension

    Security: Files are served only if they belong to the authenticated user.
    The key format is "u/{user_id}/..." so we validate ownership.

    Storage tiering: media on a non-local root (S3/MinIO archive) is served by
    redirecting to a short-lived presigned URL (default — direct stream), or
    proxy-streamed through the backend (``media_archive_serve_mode='proxy'``).
    Local media is served via FileResponse as before.

    Auto-regeneration: If a thumbnail/preview is missing, automatically
    queues regeneration in background and returns 202 Accepted.
    """
    storage = get_storage_service()
    settings = get_media_settings()

    # Validate key format and ownership
    if not key.startswith(f"u/{user.id}/"):
        # Check if this is a shared/public file (future feature)
        # For now, only allow own files
        raise HTTPException(status_code=403, detail="Access denied")

    # Resolve which root this key lives on (derivatives fast-path to local).
    root_id = await _resolve_storage_root_id(db, user.id, key)

    # Non-local (archive) originals: ownership is already validated above.
    if not storage.is_local(root_id):
        if _archive_serve_mode() == "proxy":
            return await _proxy_archive_stream(storage, key, root_id, request, db, user.id)
        # Default: redirect to a short-lived presigned URL (direct stream).
        # Presigning is purely local (no network), so by itself it can't tell an
        # offline archive from a deleted object — the browser would just get a
        # failed redirect. When the health probe is enabled, verify the object
        # exists first (one HEAD) so we can return a clear 503/404 instead.
        if getattr(app_settings, "media_archive_health_probe", True):
            try:
                present = await storage.exists(key, root_id=root_id)
            except Exception as e:  # noqa: BLE001 — treat probe failure as unreachable
                logger.warning("archive_exists_check_failed", key=key, root_id=root_id, error=str(e))
                present = None
            if not present:
                # Store offline or object gone — try the provider second copy
                # (e.g. pixverse CDN) before returning the classified miss.
                fb = await _archive_remote_fallback(db, user.id, key)
                if fb is not None:
                    return fb
                raise await _archive_miss(storage, key, root_id)
        try:
            url = storage.get_url(key, root_id=root_id)
        except Exception as e:  # noqa: BLE001
            logger.error("archive_presign_failed", key=key, root_id=root_id, error=str(e))
            fb = await _archive_remote_fallback(db, user.id, key)
            if fb is not None:
                return fb
            raise HTTPException(status_code=502, detail="Archive storage unavailable")
        return RedirectResponse(url, status_code=307)

    # Check if file exists (local root)
    if not await storage.exists(key, root_id=root_id):
        # Auto-regenerate missing thumbnails/previews
        if "/thumbnails/" in key or "/previews/" in key:
            regenerated = await _try_regenerate_derivative(
                db, user.id, key
            )
            if regenerated:
                # Return 202 Accepted - client should retry
                raise HTTPException(
                    status_code=202,
                    detail="Thumbnail regeneration queued, retry in a few seconds"
                )
        raise HTTPException(status_code=404, detail="File not found")

    # Get file metadata
    metadata = await storage.get_metadata(key, root_id=root_id)
    if not metadata:
        raise HTTPException(status_code=404, detail="File not found")

    # Get local path for FileResponse
    file_path = storage.get_path(key, root_id=root_id)

    # Set caching headers
    max_age = settings.cache_control_max_age_seconds
    response.headers["Cache-Control"] = f"private, max-age={max_age}"
    response.headers["ETag"] = metadata["etag"]
    response.headers["Last-Modified"] = metadata["modified_at"].strftime(
        "%a, %d %b %Y %H:%M:%S GMT"
    )

    # Return file
    return FileResponse(
        path=file_path,
        media_type=metadata["content_type"],
        filename=Path(key).name,
    )


@router.head("/media/{key:path}")
async def head_media(
    key: str,
    user: MediaUser,
    db: DatabaseSession,
    response: Response,
):
    """
    HEAD request for media files.

    Returns headers without body, useful for checking existence and getting
    metadata for conditional requests. Resolves the storage root so archived
    (S3/MinIO) originals report metadata too.
    """
    storage = get_storage_service()
    settings = get_media_settings()

    # Validate ownership
    if not key.startswith(f"u/{user.id}/"):
        raise HTTPException(status_code=403, detail="Access denied")

    root_id = await _resolve_storage_root_id(db, user.id, key)

    # Check if file exists. For non-local (archive) roots a transport error means
    # the store is offline, not that the object is gone — classify accordingly.
    try:
        metadata = await storage.get_metadata(key, root_id=root_id)
    except Exception as e:  # noqa: BLE001
        if storage.is_local(root_id):
            raise
        logger.warning("head_archive_metadata_failed", key=key, root_id=root_id, error=str(e))
        raise await _archive_miss(storage, key, root_id)
    if not metadata:
        if not storage.is_local(root_id):
            raise await _archive_miss(storage, key, root_id)
        raise HTTPException(status_code=404, detail="File not found")

    # Set headers
    max_age = settings.cache_control_max_age_seconds
    response.headers["Cache-Control"] = f"private, max-age={max_age}"
    response.headers["ETag"] = metadata["etag"]
    response.headers["Last-Modified"] = metadata["modified_at"].strftime(
        "%a, %d %b %Y %H:%M:%S GMT"
    )
    response.headers["Content-Type"] = metadata["content_type"]
    response.headers["Content-Length"] = str(metadata["size"])

    return Response(status_code=200)


# ===== STORAGE INFO =====

class StorageInfoResponse(BaseModel):
    """Storage information"""
    storage_mode: str = Field(description="Storage mode: local or cloud")
    root_path: Optional[str] = Field(description="Local storage path")
    total_files: int = Field(description="Total files in storage")
    total_size_bytes: int = Field(description="Total storage used (bytes)")
    total_size_human: str = Field(description="Human-readable size")


@router.get("/media/storage/info", response_model=StorageInfoResponse)
async def get_storage_info(user: CurrentUser):
    """
    Get storage system information.

    Admin only.
    """
    if not user.is_admin():
        raise HTTPException(status_code=403, detail="Admin only")

    storage = get_storage_service()

    # For local storage, scan directory from path registry
    root_path = get_path_registry().media_root

    total_files = 0
    total_size = 0

    root = Path(root_path)
    if root.exists():
        for file in root.rglob("*"):
            if file.is_file():
                total_files += 1
                total_size += file.stat().st_size

    # Format size
    def format_size(size: int) -> str:
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if size < 1024:
                return f"{size:.1f} {unit}"
            size /= 1024
        return f"{size:.1f} PB"

    return StorageInfoResponse(
        storage_mode="local",
        root_path=str(root.absolute()),
        total_files=total_files,
        total_size_bytes=total_size,
        total_size_human=format_size(total_size),
    )
