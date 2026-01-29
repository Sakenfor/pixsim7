"""
Media API endpoints

Handles:
- Media serving with caching headers
- Media settings management
- Ingestion control
"""
import os
import mimetypes
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, Response, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession
from pixsim7.backend.main.services.asset import (
    AssetIngestionService,
    get_media_settings,
)
from pixsim7.backend.main.services.storage import get_storage_service
from pixsim_logging import get_logger

router = APIRouter()
logger = get_logger()


# ===== MEDIA SETTINGS =====

class MediaSettingsResponse(BaseModel):
    """Media settings response"""
    ingest_on_asset_add: bool = Field(description="Auto-ingest when assets are created")
    prefer_local_over_provider: bool = Field(description="Serve from local storage")
    cache_control_max_age_seconds: int = Field(description="Cache-Control max-age")
    generate_thumbnails: bool = Field(description="Generate thumbnails")
    generate_previews: bool = Field(description="Generate preview derivatives")
    thumbnail_quality: int = Field(description="JPEG quality for thumbnails (1-100)")
    preview_quality: int = Field(description="JPEG quality for previews (1-100)")
    max_download_size_mb: int = Field(description="Maximum download size (MB)")
    concurrency_limit: int = Field(description="Maximum concurrent ingestion jobs")
    thumbnail_size: list[int] = Field(description="Thumbnail dimensions [width, height]")
    preview_size: list[int] = Field(description="Preview dimensions [width, height]")
    frame_extraction_upload: str = Field(
        description="Frame extraction upload behavior: 'source_provider', 'always', or 'never'"
    )
    default_upload_provider: str = Field(
        description="Default provider for uploads when frame_extraction_upload is 'always'"
    )


class MediaSettingsUpdate(BaseModel):
    """Media settings update request"""
    ingest_on_asset_add: Optional[bool] = None
    prefer_local_over_provider: Optional[bool] = None
    cache_control_max_age_seconds: Optional[int] = None
    generate_thumbnails: Optional[bool] = None
    generate_previews: Optional[bool] = None
    thumbnail_quality: Optional[int] = None
    preview_quality: Optional[int] = None
    max_download_size_mb: Optional[int] = None
    concurrency_limit: Optional[int] = None
    thumbnail_size: Optional[list[int]] = None
    preview_size: Optional[list[int]] = None
    frame_extraction_upload: Optional[str] = None
    default_upload_provider: Optional[str] = None


@router.get("/media/settings", response_model=MediaSettingsResponse)
async def get_settings(user: CurrentUser):
    """
    Get media settings.

    Returns current media ingestion and serving settings.
    """
    settings = get_media_settings()
    return MediaSettingsResponse(**settings.to_dict())


@router.patch("/media/settings", response_model=MediaSettingsResponse)
async def update_settings(
    updates: MediaSettingsUpdate,
    user: CurrentUser,
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

    # Apply updates
    update_dict = updates.model_dump(exclude_none=True)
    if update_dict:
        settings.update(update_dict)

    return MediaSettingsResponse(**settings.to_dict())


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


@router.post("/media/ingestion/trigger/{asset_id}")
async def trigger_ingestion(
    asset_id: int,
    user: CurrentUser,
    db: DatabaseSession,
    background_tasks: BackgroundTasks,
    force: bool = Query(False, description="Re-ingest even if already completed"),
    regenerate_thumbnails: bool = Query(False, description="Force regenerate thumbnails only"),
    regenerate_previews: bool = Query(False, description="Force regenerate previews only"),
    regenerate_metadata: bool = Query(False, description="Force extract metadata only"),
):
    """
    Trigger ingestion for a specific asset.

    Downloads the asset from provider, stores locally, extracts metadata,
    and generates thumbnails and previews.

    Selective regeneration:
    - regenerate_thumbnails: Only regenerate thumbnails
    - regenerate_previews: Only regenerate previews
    - regenerate_metadata: Only extract metadata
    - force: Full re-ingestion (all steps)
    """
    service = AssetIngestionService(db)

    # Determine which steps to run
    if regenerate_thumbnails or regenerate_previews or regenerate_metadata:
        # Selective regeneration - don't re-download/store
        generate_thumbnails = regenerate_thumbnails or force
        generate_previews = regenerate_previews or force
        extract_metadata = regenerate_metadata or force

        try:
            asset = await service.ingest_asset(
                asset_id,
                force=False,  # Don't re-download
                store_for_serving=False,  # Don't re-store
                extract_metadata=extract_metadata,
                generate_thumbnails=generate_thumbnails,
                generate_previews=generate_previews,
            )
            return {
                "success": True,
                "asset_id": asset.id,
                "ingest_status": asset.ingest_status,
                "regenerated": {
                    "thumbnails": regenerate_thumbnails,
                    "previews": regenerate_previews,
                    "metadata": regenerate_metadata,
                }
            }
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            logger.error(
                "regeneration_failed",
                asset_id=asset_id,
                error=str(e),
                exc_info=True
            )
            raise HTTPException(status_code=500, detail=f"Regeneration failed: {str(e)}")
    else:
        # Full ingestion
        try:
            asset = await service.ingest_asset(asset_id, force=force)
            return {
                "success": True,
                "asset_id": asset.id,
                "ingest_status": asset.ingest_status,
                "stored_key": asset.stored_key,
                "thumbnail_key": asset.thumbnail_key,
                "preview_key": asset.preview_key,
            }
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            logger.error(
                "ingestion_trigger_failed",
                asset_id=asset_id,
                error=str(e),
                exc_info=True
            )
            raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")


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

# Track in-flight regenerations to avoid duplicate work
_regeneration_in_progress: set[str] = set()


async def _try_regenerate_derivative(
    db,
    background_tasks: BackgroundTasks,
    user_id: int,
    key: str,
) -> bool:
    """
    Try to regenerate a missing thumbnail or preview.

    Looks up the asset by thumbnail_key or preview_key and queues
    regeneration if the source file exists.

    Returns True if regeneration was queued, False otherwise.
    """
    from sqlalchemy import select, or_
    from pixsim7.backend.main.domain.assets.models import Asset

    # Avoid duplicate regeneration requests
    if key in _regeneration_in_progress:
        return True  # Already in progress

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

        # Check if source file exists
        if not asset.local_path or not os.path.exists(asset.local_path):
            logger.debug(
                "regenerate_derivative_no_source",
                asset_id=asset.id,
                local_path=asset.local_path,
            )
            return False

        # Mark as in-progress
        _regeneration_in_progress.add(key)

        # Queue background regeneration
        async def regenerate():
            try:
                service = AssetIngestionService(db)
                await service.ingest_asset(
                    asset.id,
                    force=False,
                    store_for_serving=False,
                    extract_metadata=False,
                    generate_thumbnails=is_thumbnail,
                    generate_previews=is_preview,
                )
                logger.info(
                    "derivative_regenerated",
                    asset_id=asset.id,
                    key=key,
                    type="thumbnail" if is_thumbnail else "preview",
                )
            except Exception as e:
                logger.warning(
                    "derivative_regeneration_failed",
                    asset_id=asset.id,
                    key=key,
                    error=str(e),
                )
            finally:
                _regeneration_in_progress.discard(key)

        background_tasks.add_task(regenerate)

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


@router.get("/media/{key:path}")
async def serve_media(
    key: str,
    user: CurrentUser,
    db: DatabaseSession,
    background_tasks: BackgroundTasks,
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

    # Check if file exists
    if not await storage.exists(key):
        # Auto-regenerate missing thumbnails/previews
        if "/thumbnails/" in key or "/previews/" in key:
            regenerated = await _try_regenerate_derivative(
                db, background_tasks, user.id, key
            )
            if regenerated:
                # Return 202 Accepted - client should retry
                raise HTTPException(
                    status_code=202,
                    detail="Thumbnail regeneration queued, retry in a few seconds"
                )
        raise HTTPException(status_code=404, detail="File not found")

    # Get file metadata
    metadata = await storage.get_metadata(key)
    if not metadata:
        raise HTTPException(status_code=404, detail="File not found")

    # Get local path for FileResponse
    file_path = storage.get_path(key)

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
    user: CurrentUser,
    response: Response,
):
    """
    HEAD request for media files.

    Returns headers without body, useful for checking existence and getting
    metadata for conditional requests.
    """
    storage = get_storage_service()
    settings = get_media_settings()

    # Validate ownership
    if not key.startswith(f"u/{user.id}/"):
        raise HTTPException(status_code=403, detail="Access denied")

    # Check if file exists
    metadata = await storage.get_metadata(key)
    if not metadata:
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

    # For local storage, scan directory
    root_path = os.getenv("PIXSIM_MEDIA_STORAGE_PATH", "data/media")

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
