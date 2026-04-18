"""
Asset Service - Compatibility Layer

This class composes the split services for backward compatibility.
New code should use the specific services directly:
- AssetCoreService: CRUD, search, listing, deletion
- AssetSyncService: Download management, sync, provider operations
- AssetEnrichmentService: Recognition, embedded extraction, paused frames
- AssetQuotaService: User quotas, storage tracking, deduplication
"""
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain import User
from pixsim7.backend.main.shared.actor import resolve_effective_user_id
from pixsim7.backend.main.services.user.user_service import UserService
from .core import AssetCoreService
from .sync import AssetSyncService
from .enrichment import AssetEnrichmentService
from .quota import AssetQuotaService


class AssetService:
    """
    Compatibility layer that composes all asset services.
    
    Delegates to specialized services for better organization.
    """

    def __init__(
        self,
        db: AsyncSession,
        user_service: UserService
    ):
        self.db = db
        self.users = user_service
        self._core = AssetCoreService(db, user_service)
        self._sync = AssetSyncService(db)
        self._enrichment = AssetEnrichmentService(db)
        self._quota = AssetQuotaService(db)

    # ===== Core Operations (delegate to AssetCoreService) =====

    async def create_from_submission(self, *args, **kwargs):
        return await self._core.create_from_submission(*args, **kwargs)

    async def get_asset(self, *args, **kwargs):
        return await self._core.get_asset(*args, **kwargs)

    async def get_asset_for_user(self, *args, **kwargs):
        return await self._core.get_asset_for_user(*args, **kwargs)

    async def find_assets_by_face_and_action(self, *args, **kwargs):
        return await self._core.find_assets_by_face_and_action(*args, **kwargs)

    async def list_assets(self, *args, **kwargs):
        return await self._core.list_assets(*args, **kwargs)

    async def list_asset_groups(self, *args, **kwargs):
        return await self._core.list_asset_groups(*args, **kwargs)

    def build_scoped_asset_ids_subquery(self, *args, **kwargs):
        return self._core.build_scoped_asset_ids_subquery(*args, **kwargs)

    async def build_group_meta_payloads(self, *args, **kwargs):
        return await self._core.build_group_meta_payloads(*args, **kwargs)

    async def delete_asset(self, *args, **kwargs):
        return await self._core.delete_asset(*args, **kwargs)

    # ===== Enrichment (delegate to AssetEnrichmentService) =====

    async def update_recognition_metadata(self, *args, **kwargs):
        return await self._enrichment.update_recognition_metadata(*args, **kwargs)

    async def _extract_and_register_embedded(self, *args, **kwargs):
        return await self._enrichment._extract_and_register_embedded(*args, **kwargs)

    async def create_asset_from_paused_frame(
        self,
        video_asset_id: int,
        user,
        timestamp: float,
        frame_number: Optional[int] = None,
        last_frame: bool = False,
    ):
        """
        Extract a frame from video and create image asset with deduplication.

        Uses core, sync, quota, and user sub-services, so this method lives
        on the composed AssetService rather than a single sub-service.
        """
        import os

        from sqlalchemy.orm.attributes import flag_modified

        from pixsim_logging import get_logger

        from pixsim7.backend.main.domain import MediaType, SyncStatus
        from pixsim7.backend.main.services.asset.frame_extractor import (
            download_native_last_frame,
            extract_frame_with_metadata,
            get_pixverse_native_last_frame_url,
        )
        from pixsim7.backend.main.services.asset.asset_factory import add_asset, create_capture_lineage
        from pixsim7.backend.main.services.storage.storage_service import get_storage_service
        from pixsim7.backend.main.shared.errors import (
            InvalidOperationError,
            ResourceNotFoundError,
        )

        logger = get_logger()

        # 1. Get video asset with authorization
        video_asset = await self.get_asset_for_user(video_asset_id, user)

        if video_asset.media_type != MediaType.VIDEO:
            raise InvalidOperationError("Source asset must be a video")

        owner_user_id = resolve_effective_user_id(user)
        if owner_user_id is None:
            raise InvalidOperationError("User-scoped principal required")

        # 2. Short-circuit on prior last-frame extraction. The first successful
        # extract stamps `media_metadata["last_frame_asset_id"]` onto the
        # source video; subsequent extends reuse that asset and skip the
        # network/ffmpeg work entirely. Stale IDs (asset deleted, different
        # owner) fall through to a fresh extract.
        if last_frame:
            cached_id = None
            video_meta = video_asset.media_metadata or {}
            if isinstance(video_meta, dict):
                raw = video_meta.get("last_frame_asset_id")
                if isinstance(raw, int):
                    cached_id = raw
            if cached_id:
                try:
                    cached_asset = await self._core.get_asset(cached_id)
                except ResourceNotFoundError:
                    cached_asset = None
                if cached_asset and cached_asset.user_id == owner_user_id:
                    logger.info(
                        "last_frame_cache_hit",
                        video_asset_id=video_asset.id,
                        frame_asset_id=cached_id,
                    )
                    return cached_asset
                logger.info(
                    "last_frame_cache_stale",
                    video_asset_id=video_asset.id,
                    cached_id=cached_id,
                )

        # 3. Prefer provider-native last frame when requesting the terminal
        # frame — Pixverse (and potentially future providers) stamp a
        # byte-exact last-frame URL on the video, avoiding ffmpeg re-encode
        # drift. Fall back to local ffmpeg extraction on miss or failure.
        extraction_method = "ffmpeg"
        frame_path: Optional[str] = None
        sha256: Optional[str] = None
        width: Optional[int] = None
        height: Optional[int] = None

        if last_frame:
            native_url = get_pixverse_native_last_frame_url(video_asset)
            if native_url:
                try:
                    frame_path, sha256, width, height = await download_native_last_frame(native_url)
                    extraction_method = "pixverse_native"
                    logger.info(
                        "last_frame_from_native_url",
                        video_asset_id=video_asset.id,
                        provider_id=video_asset.provider_id,
                        url=native_url,
                    )
                except InvalidOperationError as e:
                    logger.warning(
                        "last_frame_native_download_failed_fallback_ffmpeg",
                        video_asset_id=video_asset.id,
                        provider_id=video_asset.provider_id,
                        error=str(e),
                    )

        if frame_path is None:
            # 3a. Ensure video is downloaded locally for ffmpeg path.
            if not video_asset.local_path or not os.path.exists(video_asset.local_path):
                video_asset = await self.sync_asset(video_asset_id, user, include_embedded=False)

            # 4. Extract frame with ffmpeg
            frame_path, sha256, width, height = extract_frame_with_metadata(
                video_asset.local_path, timestamp, frame_number, last_frame=last_frame
            )

        async def _stamp_last_frame_cache(frame_asset_id: int) -> None:
            if not last_frame:
                return
            meta = video_asset.media_metadata if isinstance(video_asset.media_metadata, dict) else {}
            if meta.get("last_frame_asset_id") == frame_asset_id:
                return
            meta["last_frame_asset_id"] = frame_asset_id
            video_asset.media_metadata = meta
            flag_modified(video_asset, "media_metadata")
            await self.db.commit()

        try:
            # 5. Deduplication
            existing = await self.find_asset_by_hash(sha256, owner_user_id)
            if existing:
                os.remove(frame_path)
                await _stamp_last_frame_cache(existing.id)
                return existing

            # 6. Store in CAS and create asset via add_asset
            file_size = os.path.getsize(frame_path)
            storage = get_storage_service()
            stored_key = await storage.store_from_path_with_hash(
                user_id=owner_user_id, sha256=sha256,
                source_path=frame_path, extension=".jpg",
            )
            local_path = storage.get_path(stored_key)

            # Clean up temp file (now copied to CAS)
            if os.path.exists(frame_path) and os.path.abspath(frame_path) != os.path.abspath(local_path):
                os.remove(frame_path)

            # Determine description and ID suffix based on extraction type
            if last_frame:
                frame_suffix = "last_frame"
                frame_description = "Last frame from video"
            else:
                frame_suffix = f"frame_{timestamp:.2f}"
                frame_description = f"Frame from video at {timestamp:.2f}s"

            asset = await add_asset(
                self.db,
                user_id=owner_user_id,
                media_type=MediaType.IMAGE,
                provider_id="local",
                provider_asset_id=f"local_{sha256[:12]}_{frame_suffix}",
                provider_account_id=None,
                remote_url=f"file://{local_path}",
                local_path=local_path,
                stored_key=stored_key,
                sha256=sha256,
                width=width,
                height=height,
                file_size_bytes=file_size,
                mime_type="image/jpeg",
                sync_status=SyncStatus.DOWNLOADED,
                description=frame_description,
                upload_method="video_capture",
                upload_context={
                    "source_asset_id": video_asset.id,
                    "frame_time": timestamp,
                    "source": "scrubber",
                    "extraction_method": extraction_method,
                },
                # Hidden from gallery until provider upload succeeds (or fails to
                # a target). Flipped to True by the extract-frame / reupload
                # endpoints after a successful provider push. Prevents orphan
                # frame assets from appearing in the library on failed uploads.
                searchable=False,
            )

            # 7. Create lineage with timestamp metadata
            await create_capture_lineage(
                self.db,
                child_asset_id=asset.id,
                parent_asset_id=video_asset.id,
                upload_method="video_capture",
                timestamp=timestamp,
                frame_number=frame_number,
            )

            # 8. Update user storage quota
            storage_gb = file_size / (1024 ** 3)
            await self.users.increment_storage(owner_user_id, storage_gb)

            # 9. Stamp the source video so future last-frame extends
            # short-circuit to this asset.
            await _stamp_last_frame_cache(asset.id)

            return asset

        except Exception as e:
            if os.path.exists(frame_path):
                os.remove(frame_path)
            raise InvalidOperationError(f"Failed to create asset from paused frame: {e}")

    # ===== Sync Operations (delegate to AssetSyncService) =====

    async def record_upload_attempt(self, *args, **kwargs):
        return await self._sync.record_upload_attempt(*args, **kwargs)

    async def mark_downloading(self, *args, **kwargs):
        return await self._sync.mark_downloading(*args, **kwargs)

    async def mark_downloaded(self, *args, **kwargs):
        return await self._sync.mark_downloaded(*args, **kwargs)

    async def mark_download_failed(self, *args, **kwargs):
        return await self._sync.mark_download_failed(*args, **kwargs)

    async def sync_asset(self, *args, **kwargs):
        return await self._sync.sync_asset(*args, **kwargs)

    async def get_asset_for_provider(self, *args, **kwargs):
        return await self._sync.get_asset_for_provider(*args, **kwargs)

    async def _upload_to_provider(self, *args, **kwargs):
        return await self._sync._upload_to_provider(*args, **kwargs)

    async def _download_asset_to_temp(self, *args, **kwargs):
        return await self._sync._download_asset_to_temp(*args, **kwargs)

    async def cache_provider_upload(self, *args, **kwargs):
        return await self._sync.cache_provider_upload(*args, **kwargs)

    # ===== Quota Operations (delegate to AssetQuotaService) =====

    def _compute_sha256(self, *args, **kwargs):
        return self._quota._compute_sha256(*args, **kwargs)

    async def get_user_asset_count(self, *args, **kwargs):
        return await self._quota.get_user_asset_count(*args, **kwargs)

    async def get_user_storage_used(self, *args, **kwargs):
        return await self._quota.get_user_storage_used(*args, **kwargs)

    async def find_asset_by_hash(self, *args, **kwargs):
        return await self._quota.find_asset_by_hash(*args, **kwargs)

    async def find_similar_asset_by_phash(self, *args, **kwargs):
        return await self._quota.find_similar_by_phash(*args, **kwargs)

    # ===== Tag Management (moved to TagService) =====
    # NOTE: Individual tag operations removed - use TagService directly
    # Bulk operations still supported via core service

    async def bulk_update_tags(self, *args, **kwargs):
        return await self._core.bulk_update_tags(*args, **kwargs)
