"""
Asset Ingestion Service

Central service for ingesting media files from any source:
- Provider CDN URLs (after generation completes)
- Local file uploads
- Extension/browser uploads

The ingestion pipeline:
1. Download remote file (if URL source) - idempotent via hash
2. Store in storage service (stable key for serving)
3. Extract metadata (dimensions, duration, etc.)
4. Generate derivatives (thumbnails, previews)

Design principles:
- Idempotent: skip re-download if hash matches, unless force=True
- Independent steps: metadata and thumbnails have separate "done" flags
- No user param: permissions derived from asset.user_id
- Storage abstraction: stored_key is stable, local_path is cache
"""
import os
import asyncio
import hashlib
import mimetypes
from pathlib import Path
from typing import Optional, Tuple, Dict, Any
from datetime import datetime

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import attributes

from pixsim7.backend.main.domain import Asset
from pixsim7.backend.main.domain.enums import MediaType, SyncStatus
from pixsim7.backend.main.services.storage import get_storage_service
from pixsim_logging import get_logger

logger = get_logger()


# Ingestion status constants
INGEST_PENDING = "pending"
INGEST_PROCESSING = "processing"
INGEST_COMPLETED = "completed"
INGEST_FAILED = "failed"


class MediaSettings:
    """
    Media ingestion settings.

    Loaded from JSON file, with defaults for missing values.
    Settings can be changed at runtime without restart.
    """

    def __init__(self):
        self._settings: Dict[str, Any] = {}
        self._load()

    def _load(self) -> None:
        """Load settings from file."""
        import json
        settings_path = Path("data/media_settings.json")

        if settings_path.exists():
            try:
                with open(settings_path) as f:
                    self._settings = json.load(f)
            except Exception as e:
                logger.warning(
                    "media_settings_load_failed",
                    error=str(e),
                    detail="Using defaults"
                )
                self._settings = {}

    def _save(self) -> None:
        """Save settings to file."""
        import json
        settings_path = Path("data/media_settings.json")
        settings_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            with open(settings_path, 'w') as f:
                json.dump(self._settings, f, indent=2)
        except Exception as e:
            logger.error("media_settings_save_failed", error=str(e))

    def reload(self) -> None:
        """Reload settings from file."""
        self._load()

    # Individual settings with defaults

    @property
    def ingest_on_asset_add(self) -> bool:
        """Auto-ingest when assets are created."""
        return self._settings.get("ingest_on_asset_add", True)

    @property
    def prefer_local_over_provider(self) -> bool:
        """Serve from local storage instead of provider CDN."""
        return self._settings.get("prefer_local_over_provider", True)

    @property
    def cache_control_max_age_seconds(self) -> int:
        """Cache-Control max-age for served media."""
        return self._settings.get("cache_control_max_age_seconds", 86400)  # 1 day

    @property
    def generate_thumbnails(self) -> bool:
        """Generate thumbnails for images and videos."""
        return self._settings.get("generate_thumbnails", True)

    @property
    def generate_video_previews(self) -> bool:
        """Generate video previews/transcodes (off by default)."""
        return self._settings.get("generate_video_previews", False)

    @property
    def max_download_size_mb(self) -> int:
        """Maximum file size to download (MB)."""
        return self._settings.get("max_download_size_mb", 500)

    @property
    def concurrency_limit(self) -> int:
        """Maximum concurrent ingestion jobs."""
        return self._settings.get("concurrency_limit", 4)

    @property
    def thumbnail_size(self) -> Tuple[int, int]:
        """Thumbnail dimensions (width, height)."""
        size = self._settings.get("thumbnail_size", [256, 256])
        return tuple(size)

    @property
    def preview_size(self) -> Tuple[int, int]:
        """Preview image dimensions (width, height)."""
        size = self._settings.get("preview_size", [800, 800])
        return tuple(size)

    def update(self, updates: Dict[str, Any]) -> None:
        """Update settings and save."""
        self._settings.update(updates)
        self._save()

    def to_dict(self) -> Dict[str, Any]:
        """Get all settings as dict."""
        return {
            "ingest_on_asset_add": self.ingest_on_asset_add,
            "prefer_local_over_provider": self.prefer_local_over_provider,
            "cache_control_max_age_seconds": self.cache_control_max_age_seconds,
            "generate_thumbnails": self.generate_thumbnails,
            "generate_video_previews": self.generate_video_previews,
            "max_download_size_mb": self.max_download_size_mb,
            "concurrency_limit": self.concurrency_limit,
            "thumbnail_size": list(self.thumbnail_size),
            "preview_size": list(self.preview_size),
        }


# Global settings instance
_media_settings: Optional[MediaSettings] = None


def get_media_settings() -> MediaSettings:
    """Get global media settings instance."""
    global _media_settings
    if _media_settings is None:
        _media_settings = MediaSettings()
    return _media_settings


class AssetIngestionService:
    """
    Service for ingesting media assets.

    Usage:
        service = AssetIngestionService(db)

        # Ingest a single asset (idempotent)
        await service.ingest_asset(asset_id)

        # Force re-ingest
        await service.ingest_asset(asset_id, force=True)

        # Ingest with specific options
        await service.ingest_asset(
            asset_id,
            extract_metadata=True,
            generate_thumbnails=False,
        )
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.storage = get_storage_service()
        self.settings = get_media_settings()

    async def ingest_asset(
        self,
        asset_id: int,
        *,
        force: bool = False,
        store_for_serving: Optional[bool] = None,
        extract_metadata: bool = True,
        generate_thumbnails: Optional[bool] = None,
    ) -> Asset:
        """
        Ingest a single asset.

        Idempotent by default: skips if already ingested (has stored_key and
        ingested_at) unless force=True. Individual steps (metadata, thumbnails)
        can be re-run independently.

        Args:
            asset_id: Asset ID to ingest
            force: Re-ingest even if already completed
            store_for_serving: Store in storage service for serving (default: from settings)
            extract_metadata: Extract dimensions, duration, etc.
            generate_thumbnails: Generate thumbnails (default: from settings)

        Returns:
            Updated asset

        Raises:
            ValueError: Asset not found
        """
        # Load asset
        asset = await self.db.get(Asset, asset_id)
        if not asset:
            raise ValueError(f"Asset {asset_id} not found")

        # Apply defaults from settings
        if store_for_serving is None:
            store_for_serving = self.settings.prefer_local_over_provider
        if generate_thumbnails is None:
            generate_thumbnails = self.settings.generate_thumbnails

        # Idempotent check: skip if already ingested (unless forced)
        if not force and asset.ingest_status == INGEST_COMPLETED and asset.stored_key:
            logger.debug(
                "ingest_skipped_already_complete",
                asset_id=asset_id,
                stored_key=asset.stored_key,
            )
            return asset

        # Mark as processing
        asset.ingest_status = INGEST_PROCESSING
        asset.ingest_error = None
        await self.db.commit()

        try:
            # Step 1: Ensure we have local file (uses existing local_path or downloads)
            local_path = await self._ensure_local_file(asset)

            if not local_path:
                raise ValueError("No source available (no remote_url or local_path)")

            # Step 2: Check hash for deduplication
            file_hash = self._compute_sha256(local_path)
            if asset.sha256 and asset.sha256 == file_hash and asset.stored_key and not force:
                # Same file already stored, skip re-storing
                logger.debug(
                    "ingest_skipped_same_hash",
                    asset_id=asset_id,
                    sha256=file_hash[:16],
                )
            else:
                # Update hash
                asset.sha256 = file_hash

                # Step 3: Store in storage service (if enabled)
                if store_for_serving:
                    stored_key = await self._store_file(asset, local_path)
                    asset.stored_key = stored_key

            # Step 4: Extract metadata (if not already done or forced)
            if extract_metadata and (force or not asset.metadata_extracted_at):
                await self._extract_metadata(asset, local_path)
                asset.metadata_extracted_at = datetime.utcnow()

            # Step 5: Generate thumbnails (if not already done or forced)
            if generate_thumbnails and (force or not asset.thumbnail_generated_at):
                await self._generate_thumbnail(asset, local_path)
                asset.thumbnail_generated_at = datetime.utcnow()

            # Mark as completed
            asset.ingest_status = INGEST_COMPLETED
            asset.ingest_error = None
            asset.ingested_at = datetime.utcnow()

            # Update sync status if we now have local file
            if asset.sync_status == SyncStatus.REMOTE:
                asset.sync_status = SyncStatus.DOWNLOADED
                asset.downloaded_at = datetime.utcnow()

            attributes.flag_modified(asset, 'media_metadata')
            await self.db.commit()
            await self.db.refresh(asset)

            logger.info(
                "asset_ingestion_completed",
                asset_id=asset.id,
                stored_key=asset.stored_key,
                thumbnail_key=asset.thumbnail_key,
                metadata_extracted=asset.metadata_extracted_at is not None,
                thumbnail_generated=asset.thumbnail_generated_at is not None,
            )

            return asset

        except Exception as e:
            # Mark as failed
            asset.ingest_status = INGEST_FAILED
            asset.ingest_error = str(e)[:500]  # Truncate error message
            await self.db.commit()

            logger.error(
                "asset_ingestion_failed",
                asset_id=asset.id,
                error=str(e),
                exc_info=True
            )

            raise

    async def _ensure_local_file(self, asset: Asset) -> Optional[str]:
        """
        Ensure we have a local file to work with.

        Uses existing local_path if available (from previous sync/download),
        otherwise downloads from remote_url. Downloads go to the same location
        as AssetSyncService for consistency.

        Returns:
            Path to local file, or None if unavailable
        """
        # Already have local file?
        if asset.local_path and Path(asset.local_path).exists():
            logger.debug(
                "using_existing_local_path",
                asset_id=asset.id,
                local_path=asset.local_path,
            )
            return asset.local_path

        # Need to download from remote URL
        if not asset.remote_url:
            return None

        # Download to standard location (same as sync_asset)
        local_path = await self._download_file(asset)
        return local_path

    async def _download_file(self, asset: Asset) -> str:
        """
        Download file from remote URL.

        Uses same storage path as AssetSyncService.sync_asset() for consistency.
        Updates asset.local_path, file_size_bytes, sync_status.

        Returns:
            Path to downloaded file
        """
        url = asset.remote_url
        max_size = self.settings.max_download_size_mb * 1024 * 1024

        logger.info(
            "download_starting",
            asset_id=asset.id,
            url=url[:100],  # Truncate URL for logging
        )

        # Use same storage path as AssetSyncService
        storage_dir = Path(os.getenv("PIXSIM_STORAGE_PATH", "data/storage"))
        asset_dir = storage_dir / "user" / str(asset.user_id) / "assets"
        asset_dir.mkdir(parents=True, exist_ok=True)

        ext = self._guess_extension(asset)
        local_path = asset_dir / f"{asset.id}{ext}"

        # Download with retries
        max_retries = 3
        retry_delay = 2.0

        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(
                    timeout=120,
                    follow_redirects=True,
                    headers={"User-Agent": "PixSim7/1.0"}
                ) as client:
                    # Check content length first
                    try:
                        head_resp = await client.head(url)
                        content_length = int(head_resp.headers.get("content-length", 0))
                        if content_length > max_size:
                            raise ValueError(
                                f"File too large: {content_length / (1024*1024):.1f}MB "
                                f"(max: {self.settings.max_download_size_mb}MB)"
                            )
                    except httpx.HTTPError:
                        pass  # HEAD not supported, check during download

                    # Stream download
                    async with client.stream("GET", url) as resp:
                        resp.raise_for_status()

                        total = 0
                        with open(local_path, 'wb') as f:
                            async for chunk in resp.aiter_bytes(chunk_size=1024*1024):
                                total += len(chunk)
                                if total > max_size:
                                    raise ValueError(
                                        f"Download exceeded max size: {self.settings.max_download_size_mb}MB"
                                    )
                                f.write(chunk)

                # Update asset
                asset.local_path = str(local_path)
                asset.file_size_bytes = local_path.stat().st_size
                asset.sync_status = SyncStatus.DOWNLOADED
                asset.downloaded_at = datetime.utcnow()

                logger.info(
                    "download_completed",
                    asset_id=asset.id,
                    size_bytes=asset.file_size_bytes,
                    local_path=str(local_path),
                )

                return str(local_path)

            except (httpx.TimeoutException, httpx.NetworkError) as e:
                if attempt < max_retries - 1:
                    logger.warning(
                        "download_retry",
                        asset_id=asset.id,
                        attempt=attempt + 1,
                        error=str(e),
                    )
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2
                else:
                    raise

    async def _store_file(self, asset: Asset, local_path: str) -> str:
        """
        Store file in storage service.

        The stored_key is a stable identifier for serving, independent of
        local_path which is an implementation detail.

        Returns:
            Storage key
        """
        ext = Path(local_path).suffix
        key = f"u/{asset.user_id}/assets/{asset.id}{ext}"

        # Copy from local_path to storage
        await self.storage.store_from_path(key, local_path)

        logger.debug(
            "file_stored",
            asset_id=asset.id,
            key=key,
        )

        return key

    async def _extract_metadata(self, asset: Asset, local_path: str) -> None:
        """
        Extract metadata from file.

        Updates: width, height, duration_sec, fps, mime_type
        """
        path = Path(local_path)

        # Guess MIME type
        mime_type, _ = mimetypes.guess_type(str(path))
        if mime_type:
            asset.mime_type = mime_type

        if asset.media_type == MediaType.IMAGE:
            await self._extract_image_metadata(asset, local_path)
        elif asset.media_type == MediaType.VIDEO:
            await self._extract_video_metadata(asset, local_path)

    async def _extract_image_metadata(self, asset: Asset, local_path: str) -> None:
        """Extract metadata from image file."""
        try:
            from PIL import Image

            with Image.open(local_path) as img:
                asset.width = img.width
                asset.height = img.height

            logger.debug(
                "image_metadata_extracted",
                asset_id=asset.id,
                width=asset.width,
                height=asset.height,
            )

        except Exception as e:
            logger.warning(
                "image_metadata_extraction_failed",
                asset_id=asset.id,
                error=str(e),
            )

    async def _extract_video_metadata(self, asset: Asset, local_path: str) -> None:
        """Extract metadata from video file using ffprobe."""
        try:
            from pixsim7.backend.main.shared.video_utils import get_video_metadata

            metadata = get_video_metadata(local_path)

            asset.width = metadata.get("width")
            asset.height = metadata.get("height")
            asset.duration_sec = metadata.get("duration")
            asset.fps = metadata.get("fps")

            # Store extended metadata
            if not asset.media_metadata:
                asset.media_metadata = {}
            asset.media_metadata["video_info"] = {
                "codec": metadata.get("codec"),
                "bitrate": metadata.get("bitrate"),
                "format": metadata.get("format"),
            }

            logger.debug(
                "video_metadata_extracted",
                asset_id=asset.id,
                width=asset.width,
                height=asset.height,
                duration=asset.duration_sec,
            )

        except Exception as e:
            logger.warning(
                "video_metadata_extraction_failed",
                asset_id=asset.id,
                error=str(e),
                detail="ffprobe may not be available"
            )

    async def _generate_thumbnail(self, asset: Asset, local_path: str) -> None:
        """
        Generate thumbnail for asset.

        For images: Resize to thumbnail size
        For videos: Extract frame and resize
        """
        try:
            if asset.media_type == MediaType.IMAGE:
                await self._generate_image_thumbnail(asset, local_path)
            elif asset.media_type == MediaType.VIDEO:
                await self._generate_video_thumbnail(asset, local_path)

        except Exception as e:
            logger.warning(
                "thumbnail_generation_failed",
                asset_id=asset.id,
                error=str(e),
            )

    async def _generate_image_thumbnail(self, asset: Asset, local_path: str) -> None:
        """Generate thumbnail for image."""
        from PIL import Image

        thumb_size = self.settings.thumbnail_size

        with Image.open(local_path) as img:
            # Convert to RGB if needed (for PNG with alpha)
            if img.mode in ('RGBA', 'LA', 'P'):
                img = img.convert('RGB')

            # Create thumbnail (maintains aspect ratio)
            img.thumbnail(thumb_size, Image.Resampling.LANCZOS)

            # Save to storage
            thumb_key = f"u/{asset.user_id}/thumbnails/{asset.id}.jpg"
            thumb_path = self.storage.get_path(thumb_key)

            Path(thumb_path).parent.mkdir(parents=True, exist_ok=True)

            img.save(thumb_path, "JPEG", quality=85, optimize=True)

        asset.thumbnail_key = thumb_key
        asset.thumbnail_url = self.storage.get_url(thumb_key)

        logger.debug(
            "thumbnail_generated",
            asset_id=asset.id,
            key=thumb_key,
        )

    async def _generate_video_thumbnail(self, asset: Asset, local_path: str) -> None:
        """Generate thumbnail for video by extracting a frame."""
        import subprocess

        # Extract frame at 1 second (or middle if shorter)
        timestamp = min(1.0, (asset.duration_sec or 0) / 2)

        thumb_key = f"u/{asset.user_id}/thumbnails/{asset.id}.jpg"
        thumb_path = self.storage.get_path(thumb_key)

        Path(thumb_path).parent.mkdir(parents=True, exist_ok=True)

        thumb_size = self.settings.thumbnail_size

        cmd = [
            "ffmpeg",
            "-y",
            "-ss", str(timestamp),
            "-i", local_path,
            "-vframes", "1",
            "-vf", f"scale={thumb_size[0]}:{thumb_size[1]}:force_original_aspect_ratio=decrease",
            "-q:v", "3",
            thumb_path
        ]

        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: subprocess.run(cmd, capture_output=True, timeout=30)
            )

            if result.returncode != 0:
                logger.warning(
                    "ffmpeg_thumbnail_failed",
                    asset_id=asset.id,
                    stderr=result.stderr.decode()[:200],
                )
                return

            asset.thumbnail_key = thumb_key
            asset.thumbnail_url = self.storage.get_url(thumb_key)

            logger.debug(
                "video_thumbnail_generated",
                asset_id=asset.id,
                key=thumb_key,
            )

        except subprocess.TimeoutExpired:
            logger.warning("ffmpeg_thumbnail_timeout", asset_id=asset.id)
        except FileNotFoundError:
            logger.warning(
                "ffmpeg_not_found",
                asset_id=asset.id,
                detail="ffmpeg not available for video thumbnail generation"
            )

    def _guess_extension(self, asset: Asset) -> str:
        """Guess file extension from asset info."""
        if asset.mime_type:
            ext = mimetypes.guess_extension(asset.mime_type)
            if ext:
                return ext

        if asset.remote_url:
            url_path = asset.remote_url.split('?')[0]
            ext = Path(url_path).suffix
            if ext:
                return ext

        if asset.media_type == MediaType.VIDEO:
            return ".mp4"
        elif asset.media_type == MediaType.IMAGE:
            return ".jpg"
        else:
            return ".bin"

    def _compute_sha256(self, file_path: str) -> str:
        """Compute SHA256 hash of file."""
        sha256_hash = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b''):
                sha256_hash.update(chunk)
        return sha256_hash.hexdigest()

    async def queue_ingestion(self, asset_id: int) -> None:
        """
        Queue asset for background ingestion.

        Sets ingest_status to pending. Background worker processes the queue.
        """
        asset = await self.db.get(Asset, asset_id)
        if not asset:
            return

        if asset.ingest_status in (INGEST_PROCESSING, INGEST_COMPLETED):
            return

        asset.ingest_status = INGEST_PENDING
        await self.db.commit()

        logger.debug("ingestion_queued", asset_id=asset_id)

    async def process_pending_batch(self, limit: int = 10) -> int:
        """
        Process a batch of pending ingestion jobs.

        Called by background worker.

        Returns:
            Number of assets processed
        """
        result = await self.db.execute(
            select(Asset)
            .where(Asset.ingest_status == INGEST_PENDING)
            .order_by(Asset.created_at.asc())
            .limit(limit)
        )
        assets = result.scalars().all()

        if not assets:
            return 0

        processed = 0
        for asset in assets:
            try:
                await self.ingest_asset(asset.id)
                processed += 1
            except Exception as e:
                logger.error(
                    "batch_ingestion_failed",
                    asset_id=asset.id,
                    error=str(e),
                )

        return processed

    async def retry_failed(self, asset_id: int) -> Asset:
        """Retry ingestion for a failed asset."""
        return await self.ingest_asset(asset_id, force=True)

    async def get_ingestion_stats(self) -> Dict[str, int]:
        """Get ingestion queue statistics."""
        from sqlalchemy import func

        result = await self.db.execute(
            select(
                Asset.ingest_status,
                func.count(Asset.id)
            )
            .group_by(Asset.ingest_status)
        )

        stats = {row[0] or "null": row[1] for row in result}

        return {
            "pending": stats.get(INGEST_PENDING, 0),
            "processing": stats.get(INGEST_PROCESSING, 0),
            "completed": stats.get(INGEST_COMPLETED, 0),
            "failed": stats.get(INGEST_FAILED, 0),
            "not_ingested": stats.get("null", 0),
        }
