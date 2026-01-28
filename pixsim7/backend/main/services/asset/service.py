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

        from pixsim7.backend.main.domain import MediaType, SyncStatus
        from pixsim7.backend.main.domain.enums import OperationType
        from pixsim7.backend.main.domain.assets.lineage import AssetLineage
        from pixsim7.backend.main.domain.relation_types import PAUSED_FRAME
        from pixsim7.backend.main.services.asset.frame_extractor import extract_frame_with_metadata
        from pixsim7.backend.main.services.asset.asset_factory import add_asset
        from pixsim7.backend.main.services.storage.storage_service import get_storage_service
        from pixsim7.backend.main.shared.errors import InvalidOperationError

        # 1. Get video asset with authorization
        video_asset = await self.get_asset_for_user(video_asset_id, user)

        if video_asset.media_type != MediaType.VIDEO:
            raise InvalidOperationError("Source asset must be a video")

        # 2. Ensure video is downloaded locally
        if not video_asset.local_path or not os.path.exists(video_asset.local_path):
            video_asset = await self.sync_asset(video_asset_id, user, include_embedded=False)

        # 3. Extract frame with ffmpeg
        frame_path, sha256, width, height = extract_frame_with_metadata(
            video_asset.local_path, timestamp, frame_number, last_frame=last_frame
        )

        try:
            # 4. Deduplication
            existing = await self.find_asset_by_hash(sha256, user.id)
            if existing:
                os.remove(frame_path)
                return existing

            # 5. Store in CAS and create asset via add_asset
            file_size = os.path.getsize(frame_path)
            storage = get_storage_service()
            stored_key = await storage.store_from_path_with_hash(
                user_id=user.id, sha256=sha256,
                source_path=frame_path, extension=".jpg",
            )
            local_path = storage.get_path(stored_key)

            # Clean up temp file (now copied to CAS)
            if os.path.exists(frame_path) and os.path.abspath(frame_path) != os.path.abspath(local_path):
                os.remove(frame_path)

            asset = await add_asset(
                self.db,
                user_id=user.id,
                media_type=MediaType.IMAGE,
                provider_id=video_asset.provider_id,
                provider_asset_id=f"{video_asset.provider_asset_id}_frame_{timestamp:.2f}",
                provider_account_id=video_asset.provider_account_id,
                remote_url=f"file://{local_path}",
                local_path=local_path,
                stored_key=stored_key,
                sha256=sha256,
                width=width,
                height=height,
                file_size_bytes=file_size,
                mime_type="image/jpeg",
                sync_status=SyncStatus.DOWNLOADED,
                description=f"Frame from video at {timestamp:.2f}s",
                upload_method="video_capture",
                # Lineage handled separately below for timestamp metadata
            )

            # 6. Create lineage with timestamp metadata
            self.db.add(AssetLineage(
                child_asset_id=asset.id,
                parent_asset_id=video_asset.id,
                relation_type=PAUSED_FRAME,
                operation_type=OperationType.FRAME_EXTRACTION,
                parent_start_time=timestamp,
                parent_frame=frame_number,
                sequence_order=0,
            ))
            await self.db.commit()

            # 7. Update user storage quota
            storage_gb = file_size / (1024 ** 3)
            await self.users.increment_storage(user, storage_gb)

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
