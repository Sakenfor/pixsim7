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
from .core_service import AssetCoreService
from .sync_service import AssetSyncService
from .enrichment_service import AssetEnrichmentService
from .quota_service import AssetQuotaService


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

    async def create_asset_from_paused_frame(self, *args, **kwargs):
        return await self._enrichment.create_asset_from_paused_frame(*args, **kwargs)

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

    # ===== Tag Management (delegate to AssetCoreService) =====

    async def update_tags(self, *args, **kwargs):
        return await self._core.update_tags(*args, **kwargs)

    async def add_tags(self, *args, **kwargs):
        return await self._core.add_tags(*args, **kwargs)

    async def remove_tags(self, *args, **kwargs):
        return await self._core.remove_tags(*args, **kwargs)

    async def bulk_update_tags(self, *args, **kwargs):
        return await self._core.bulk_update_tags(*args, **kwargs)
