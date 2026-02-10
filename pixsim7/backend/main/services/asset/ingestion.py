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
from datetime import datetime, timezone

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import attributes

from pixsim7.backend.main.domain import Asset
from pixsim7.backend.main.domain.enums import MediaType, SyncStatus
from pixsim7.backend.main.services.storage import get_storage_service
from pixsim7.backend.main.shared.storage_utils import compute_sha256 as shared_compute_sha256
from pixsim7.backend.main.services.asset.content import ensure_content_blob
from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import normalize_url
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
        size = self._settings.get("thumbnail_size", [320, 320])
        return tuple(size)

    @property
    def preview_size(self) -> Tuple[int, int]:
        """Preview image dimensions (width, height)."""
        size = self._settings.get("preview_size", [800, 800])
        return tuple(size)

    @property
    def thumbnail_quality(self) -> int:
        """JPEG quality for thumbnails (1-100)."""
        return self._settings.get("thumbnail_quality", 85)

    @property
    def preview_quality(self) -> int:
        """JPEG quality for preview images (1-100)."""
        return self._settings.get("preview_quality", 92)

    @property
    def generate_previews(self) -> bool:
        """Generate preview derivatives (replaces generate_video_previews)."""
        # Support legacy key for backward compatibility
        return self._settings.get(
            "generate_previews",
            self._settings.get("generate_video_previews", False)
        )

    @property
    def frame_extraction_upload(self) -> str:
        """
        Frame extraction upload behavior.

        Options:
        - 'source_provider': Upload to source video's provider (default)
        - 'always': Always upload to default provider
        - 'never': Never upload, just save locally
        """
        return self._settings.get("frame_extraction_upload", "source_provider")

    @property
    def default_upload_provider(self) -> str:
        """Default provider for uploads when frame_extraction_upload is 'always'."""
        return self._settings.get("default_upload_provider", "pixverse")

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
            "generate_previews": self.generate_previews,
            "thumbnail_quality": self.thumbnail_quality,
            "preview_quality": self.preview_quality,
            "max_download_size_mb": self.max_download_size_mb,
            "concurrency_limit": self.concurrency_limit,
            "thumbnail_size": list(self.thumbnail_size),
            "preview_size": list(self.preview_size),
            "frame_extraction_upload": self.frame_extraction_upload,
            "default_upload_provider": self.default_upload_provider,
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
        generate_previews: Optional[bool] = None,
    ) -> Asset:
        """
        Ingest a single asset.

        Idempotent by default: skips if already ingested (has stored_key and
        ingested_at) unless force=True. Individual steps (metadata, thumbnails, previews)
        can be re-run independently.

        Args:
            asset_id: Asset ID to ingest
            force: Re-ingest even if already completed
            store_for_serving: Store in storage service for serving (default: from settings)
            extract_metadata: Extract dimensions, duration, etc.
            generate_thumbnails: Generate thumbnails (default: from settings)
            generate_previews: Generate preview derivatives (default: from settings)

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
        if generate_previews is None:
            generate_previews = self.settings.generate_previews

        # Idempotent check: skip if already ingested with content-addressed storage (unless forced)
        # Only skip when all requested steps are already complete.
        is_content_addressed = asset.stored_key and '/content/' in asset.stored_key
        if not force and asset.ingest_status == INGEST_COMPLETED and is_content_addressed:
            needs_metadata = extract_metadata and not asset.metadata_extracted_at
            needs_thumbnails = generate_thumbnails and not asset.thumbnail_generated_at
            needs_previews = generate_previews and not asset.preview_generated_at
            if not (needs_metadata or needs_thumbnails or needs_previews):
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
            is_content_addressed = asset.stored_key and '/content/' in asset.stored_key
            if asset.sha256 and asset.sha256 == file_hash and is_content_addressed and not force:
                # Same file already stored in content-addressed format, skip re-storing
                logger.debug(
                    "ingest_skipped_same_hash",
                    asset_id=asset_id,
                    sha256=file_hash[:16],
                )
            else:
                # Always update the hash — the unique constraint has been
                # relaxed so multiple assets can share the same SHA256.
                asset.sha256 = file_hash

                # Step 3: Store in storage service (if enabled)
                # Skip if already stored content-addressed (from _download_file)
                if store_for_serving and not is_content_addressed:
                    stored_key = await self._store_file(asset, local_path, file_hash)
                    asset.stored_key = stored_key

            # Ensure size tracking for quotas
            if asset.file_size_bytes is None:
                try:
                    asset.file_size_bytes = Path(local_path).stat().st_size
                except Exception:
                    pass
            if asset.logical_size_bytes is None and asset.file_size_bytes is not None:
                asset.logical_size_bytes = asset.file_size_bytes

            # Step 4: Extract metadata (if not already done or forced)
            if extract_metadata and (force or not asset.metadata_extracted_at):
                await self._extract_metadata(asset, local_path)
                asset.metadata_extracted_at = datetime.now(timezone.utc)

            # Step 5: Generate thumbnails (if not already done or forced)
            if generate_thumbnails and (force or not asset.thumbnail_generated_at):
                await self._generate_thumbnail(asset, local_path)
                asset.thumbnail_generated_at = datetime.now(timezone.utc)

            # Step 6: Generate previews (if not already done or forced)
            if generate_previews and (force or not asset.preview_generated_at):
                await self._generate_preview(asset, local_path)
                asset.preview_generated_at = datetime.now(timezone.utc)

            # Link to global content blob (best-effort)
            if asset.sha256 and asset.content_id is None:
                content = await ensure_content_blob(
                    self.db,
                    sha256=asset.sha256,
                    size_bytes=asset.file_size_bytes,
                    mime_type=asset.mime_type,
                )
                asset.content_id = content.id

            # Mark as completed
            asset.ingest_status = INGEST_COMPLETED
            asset.ingest_error = None
            asset.ingested_at = datetime.now(timezone.utc)

            # Update sync status if we now have local file
            if asset.sync_status == SyncStatus.REMOTE:
                asset.sync_status = SyncStatus.DOWNLOADED
                asset.downloaded_at = datetime.now(timezone.utc)

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
        Download file from remote URL to content-addressed storage.

        Uses StorageService with SHA256-based naming for automatic deduplication.
        Updates asset.local_path, stored_key, sha256, file_size_bytes, sync_status.

        Returns:
            Path to downloaded file
        """
        url = asset.remote_url
        if not url:
            raise ValueError(f"Asset {asset.id} has no remote_url")

        normalized_url = normalize_url(url)
        if normalized_url:
            url = normalized_url

        if not url.startswith(("http://", "https://")):
            raise ValueError(f"Asset {asset.id} has invalid remote_url (missing protocol): {url[:100]}")

        if normalized_url and normalized_url != asset.remote_url:
            asset.remote_url = normalized_url
            logger.warning("download_url_fixed", asset_id=asset.id, fixed_url=normalized_url[:100])

        max_size = self.settings.max_download_size_mb * 1024 * 1024
        storage = get_storage_service()

        logger.info(
            "download_starting",
            asset_id=asset.id,
            url=url[:100],  # Truncate URL for logging
        )

        ext = self._guess_extension(asset)

        # Download with retries
        max_retries = 3
        retry_delay = 2.0

        for attempt in range(max_retries):
            try:
                # Download to memory while computing hash
                content_chunks = []
                total_size = 0
                sha256_hash = hashlib.sha256()

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

                        async for chunk in resp.aiter_bytes(chunk_size=1024*1024):
                            if total_size + len(chunk) > max_size:
                                raise ValueError(
                                    f"Download exceeded max size: {self.settings.max_download_size_mb}MB"
                                )
                            content_chunks.append(chunk)
                            sha256_hash.update(chunk)
                            total_size += len(chunk)

                # Combine chunks and get hash
                sha256 = sha256_hash.hexdigest()
                content = b''.join(content_chunks)

                # Store using content-addressed key (automatic deduplication)
                stored_key = await storage.store_with_hash(
                    user_id=asset.user_id,
                    sha256=sha256,
                    content=content,
                    extension=ext,
                )

                # Get local path from storage
                local_path = storage.get_path(stored_key)

                # Update asset with new storage location
                # Note: sha256 is NOT set here to allow the duplicate check in
                # ingest_asset to run. The check at "if asset.sha256 != file_hash"
                # needs the old sha256 value to detect conflicts.
                asset.local_path = local_path
                asset.stored_key = stored_key
                asset.file_size_bytes = total_size
                asset.sync_status = SyncStatus.DOWNLOADED
                asset.downloaded_at = datetime.now(timezone.utc)

                logger.info(
                    "download_completed",
                    asset_id=asset.id,
                    sha256=sha256[:16],
                    size_bytes=asset.file_size_bytes,
                    stored_key=stored_key,
                    local_path=local_path,
                )

                return local_path

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
            except httpx.HTTPStatusError as e:
                # Retry on 404 - CDN propagation delay after generation
                if e.response.status_code == 404 and attempt < max_retries - 1:
                    # Use longer delay for 404 - likely CDN propagation
                    propagation_delay = 5.0 * (attempt + 1)
                    logger.warning(
                        "download_retry_404",
                        asset_id=asset.id,
                        attempt=attempt + 1,
                        delay=propagation_delay,
                        detail="CDN propagation delay - retrying",
                    )
                    await asyncio.sleep(propagation_delay)
                else:
                    raise

    async def _store_file(self, asset: Asset, local_path: str, sha256: str) -> str:
        """
        Store file in storage service using content-addressed key.

        Uses SHA256 hash for deduplication - same content = same storage path.

        Returns:
            Storage key (content-addressed)
        """
        ext = Path(local_path).suffix
        hash_prefix = sha256[:2]
        key = f"u/{asset.user_id}/content/{hash_prefix}/{sha256}{ext}"

        # Check if file already exists at destination (deduplication)
        dest_path = self.storage.get_path(key)
        if Path(dest_path).exists():
            logger.debug(
                "file_already_stored",
                asset_id=asset.id,
                sha256=sha256[:16],
                key=key,
            )
            return key

        # Copy from local_path to storage
        await self.storage.store_from_path(key, local_path)

        logger.debug(
            "file_stored",
            asset_id=asset.id,
            sha256=sha256[:16],
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
            self._apply_video_metadata(asset, metadata)

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
        from PIL import Image, ImageOps

        thumb_size = self.settings.thumbnail_size
        thumb_quality = self.settings.thumbnail_quality
        thumb_key = self._get_thumbnail_key(asset)
        thumb_path = self.storage.get_path(thumb_key)
        Path(thumb_path).parent.mkdir(parents=True, exist_ok=True)

        with Image.open(local_path) as img:
            # Handle EXIF orientation
            img = ImageOps.exif_transpose(img)

            # Convert to RGB if needed (for PNG with alpha)
            if img.mode in ('RGBA', 'LA', 'P'):
                img = img.convert('RGB')

            # Create thumbnail (maintains aspect ratio)
            img.thumbnail(thumb_size, Image.Resampling.LANCZOS)
            img.save(thumb_path, "JPEG", quality=thumb_quality, optimize=True)

        asset.thumbnail_key = thumb_key

        logger.debug(
            "thumbnail_generated",
            asset_id=asset.id,
            sha256=asset.sha256[:16] if asset.sha256 else None,
            key=thumb_key,
        )

    async def _generate_video_thumbnail(self, asset: Asset, local_path: str) -> None:
        """Generate thumbnail for video by extracting a frame."""
        import subprocess

        # Ensure rotation metadata is available so thumbnails are oriented correctly.
        # Also backfill width/height/duration if missing (common when only regen thumbnails).
        self._ensure_video_rotation(asset, local_path)

        # Extract frame at 1 second (or middle if shorter)
        timestamp = min(1.0, (asset.duration_sec or 0) / 2)

        thumb_key = self._get_thumbnail_key(asset)
        thumb_path = self.storage.get_path(thumb_key)
        Path(thumb_path).parent.mkdir(parents=True, exist_ok=True)

        thumb_size = self.settings.thumbnail_size
        vf_parts = self._get_video_rotation_filters(asset)
        vf_parts.append(
            f"scale={thumb_size[0]}:{thumb_size[1]}:force_original_aspect_ratio=decrease"
        )

        cmd = [
            "ffmpeg",
            "-y",
            "-ss", str(timestamp),
            "-i", local_path,
            "-vframes", "1",
            "-vf", ",".join(vf_parts),
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

            logger.debug(
                "video_thumbnail_generated",
                asset_id=asset.id,
                sha256=asset.sha256[:16] if asset.sha256 else None,
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

    async def _generate_preview(self, asset: Asset, local_path: str) -> None:
        """
        Generate preview derivative for asset.

        For images: Larger, higher-quality resize
        For videos: Extract HD poster frame
        """
        try:
            if asset.media_type == MediaType.IMAGE:
                await self._generate_image_preview(asset, local_path)
            elif asset.media_type == MediaType.VIDEO:
                await self._generate_video_preview(asset, local_path)
        except Exception as e:
            logger.warning(
                "preview_generation_failed",
                asset_id=asset.id,
                error=str(e),
            )

    async def _generate_image_preview(self, asset: Asset, local_path: str) -> None:
        """Generate high-quality preview for image."""
        from PIL import Image, ImageOps

        preview_size = self.settings.preview_size
        preview_quality = self.settings.preview_quality

        with Image.open(local_path) as img:
            # Handle EXIF orientation
            img = ImageOps.exif_transpose(img)

            # Skip preview generation for low-quality images (avoid upscaling)
            max_dimension = max(img.size)
            if max_dimension < preview_size[0]:
                logger.debug(
                    "skip_image_preview_low_quality",
                    asset_id=asset.id,
                    resolution=f"{img.size[0]}x{img.size[1]}",
                    reason=f"Image resolution ({max_dimension}px) is lower than preview size ({preview_size[0]}px)",
                )
                return

            # Convert to RGB if needed
            if img.mode in ('RGBA', 'LA', 'P'):
                # Create white background for transparent images
                if img.mode == 'RGBA':
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    background.paste(img, mask=img.split()[3])  # Use alpha as mask
                    img = background
                else:
                    img = img.convert('RGB')

            # Create preview (maintains aspect ratio)
            img.thumbnail(preview_size, Image.Resampling.LANCZOS)

            # Save to storage
            preview_key = f"u/{asset.user_id}/previews/{asset.id}.jpg"
            preview_path = self.storage.get_path(preview_key)

            Path(preview_path).parent.mkdir(parents=True, exist_ok=True)

            img.save(preview_path, "JPEG", quality=preview_quality, optimize=True)

        asset.preview_key = preview_key

        logger.debug(
            "preview_generated",
            asset_id=asset.id,
            key=preview_key,
            quality=preview_quality,
        )

    async def _generate_video_preview(self, asset: Asset, local_path: str) -> None:
        """Generate high-quality poster frame for video."""
        import subprocess

        # Ensure rotation metadata is available so previews are oriented correctly.
        # Also backfill width/height/duration if missing (common when only regen previews).
        self._ensure_video_rotation(asset, local_path)

        preview_size = self.settings.preview_size

        # Skip preview generation for low-quality videos (avoid upscaling)
        if asset.width and asset.height:
            max_dimension = max(asset.width, asset.height)
            if max_dimension < preview_size[0]:
                logger.debug(
                    "skip_video_preview_low_quality",
                    asset_id=asset.id,
                    resolution=f"{asset.width}x{asset.height}",
                    reason=f"Video resolution ({max_dimension}p) is lower than preview size ({preview_size[0]}px)",
                )
                return

        # Extract frame at 1 second (or middle if shorter)
        timestamp = min(1.0, (asset.duration_sec or 0) / 2)

        preview_key = f"u/{asset.user_id}/previews/{asset.id}.jpg"
        preview_path = self.storage.get_path(preview_key)

        Path(preview_path).parent.mkdir(parents=True, exist_ok=True)

        preview_quality = self.settings.preview_quality

        # Map quality (1-100) to ffmpeg qscale (2-31, lower is better)
        # Quality 92 -> qscale 2, Quality 75 -> qscale 5
        qscale = max(2, min(31, int(2 + (100 - preview_quality) / 10)))

        vf_parts = self._get_video_rotation_filters(asset)
        vf_parts.append(
            f"scale={preview_size[0]}:{preview_size[1]}:force_original_aspect_ratio=decrease"
        )

        cmd = [
            "ffmpeg",
            "-y",
            "-ss", str(timestamp),
            "-i", local_path,
            "-vframes", "1",
            "-vf", ",".join(vf_parts),
            "-q:v", str(qscale),
            preview_path
        ]

        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: subprocess.run(cmd, capture_output=True, timeout=30)
            )

            if result.returncode != 0:
                logger.warning(
                    "ffmpeg_preview_failed",
                    asset_id=asset.id,
                    stderr=result.stderr.decode()[:200],
                )
                return

            asset.preview_key = preview_key

            logger.debug(
                "video_preview_generated",
                asset_id=asset.id,
                key=preview_key,
            )

        except subprocess.TimeoutExpired:
            logger.warning("ffmpeg_preview_timeout", asset_id=asset.id)
        except FileNotFoundError:
            logger.warning(
                "ffmpeg_not_found",
                asset_id=asset.id,
                detail="ffmpeg not available for video preview generation"
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

    def _get_thumbnail_key(self, asset: Asset) -> str:
        """
        Get the storage key for an asset's thumbnail.

        Uses SHA256-based naming for deduplication when available,
        falls back to asset ID for legacy assets.
        """
        if asset.sha256:
            hash_prefix = asset.sha256[:2]
            return f"u/{asset.user_id}/thumbnails/{hash_prefix}/{asset.sha256}.jpg"
        else:
            return f"u/{asset.user_id}/thumbnails/{asset.id}.jpg"

    def _get_video_rotation_filters(self, asset: Asset) -> list[str]:
        """
        Get ffmpeg video filter parts for rotation correction.

        Reads rotation from asset.media_metadata.video_info.rotation
        and returns appropriate transpose/flip filters.
        """
        rotation = None
        if asset.media_metadata and isinstance(asset.media_metadata, dict):
            rotation = (
                asset.media_metadata.get("video_info", {}) or {}
            ).get("rotation")

        filters = []
        if rotation in (90, -270):
            filters.append("transpose=1")
        elif rotation in (-90, 270):
            filters.append("transpose=2")
        elif rotation in (180, -180):
            filters.append("hflip,vflip")

        return filters

    def _ensure_video_rotation(self, asset: Asset, local_path: str) -> Optional[int]:
        """
        Ensure rotation metadata is available for video thumbnails/previews.

        Falls back to ffprobe if rotation is missing, and backfills width/height/duration
        when available. Returns the detected rotation (or None).
        """
        rotation = None
        if asset.media_metadata and isinstance(asset.media_metadata, dict):
            rotation = (asset.media_metadata.get("video_info", {}) or {}).get("rotation")

        if rotation is not None:
            return rotation

        try:
            from pixsim7.backend.main.shared.video_utils import get_video_metadata

            metadata = get_video_metadata(local_path)
            self._apply_video_metadata(asset, metadata, fill_missing_only=True)
            return metadata.get("rotation")
        except Exception:
            return rotation

    def _apply_video_metadata(
        self,
        asset: Asset,
        metadata: Dict[str, Any],
        *,
        fill_missing_only: bool = False,
    ) -> None:
        """
        Apply ffprobe metadata to the asset.

        When fill_missing_only is True, only backfill fields that are empty.
        """
        def should_update(value):
            return not fill_missing_only or value in (None, 0, "")

        if should_update(asset.width):
            asset.width = metadata.get("width")
        if should_update(asset.height):
            asset.height = metadata.get("height")
        if should_update(asset.duration_sec):
            asset.duration_sec = metadata.get("duration")
        if should_update(asset.fps):
            asset.fps = metadata.get("fps")

        if not asset.media_metadata:
            asset.media_metadata = {}
        video_info = asset.media_metadata.get("video_info") or {}

        for key in ("codec", "bitrate", "format", "rotation"):
            if key in metadata and (not fill_missing_only or video_info.get(key) in (None, 0, "")):
                video_info[key] = metadata.get(key)

        asset.media_metadata["video_info"] = video_info

    def _compute_sha256(self, file_path: str) -> str:
        """Compute SHA256 hash of file."""
        return shared_compute_sha256(file_path)

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
