"""
Asset Core Service

Core CRUD operations for assets: creation, retrieval, search, listing, and deletion.
"""
from typing import Optional, List
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain import Asset, User
from pixsim7.backend.main.shared.errors import (
    ResourceNotFoundError,
    InvalidOperationError,
)
from pixsim7.backend.main.shared.schemas.media_metadata import RecognitionMetadata
from pixsim7.backend.main.infrastructure.events.bus import event_bus, ASSET_CREATED, ASSET_DELETED
from pixsim7.backend.main.services.user.user_service import UserService

from pixsim7.backend.main.services.asset._creation import AssetCreationMixin
from pixsim7.backend.main.services.asset._search import AssetSearchMixin, AssetGroupResult
from pixsim7.backend.main.services.asset._deletion import AssetDeletionMixin

# Re-export AssetGroupResult so existing imports from core.py keep working
__all__ = ["AssetCoreService", "AssetGroupResult"]


class AssetCoreService(AssetCreationMixin, AssetSearchMixin, AssetDeletionMixin):
    """
    Core asset management operations

    Handles:
    - Asset creation from provider submissions
    - Asset retrieval with authorization
    - Asset search and listing
    - Asset deletion
    """

    def __init__(
        self,
        db: AsyncSession,
        user_service: UserService
    ):
        self.db = db
        self.users = user_service

    # ===== ASSET RETRIEVAL =====

    async def get_asset(self, asset_id: int) -> Asset:
        """
        Get asset by ID

        Args:
            asset_id: Asset ID

        Returns:
            Asset

        Raises:
            ResourceNotFoundError: Asset not found
        """
        asset = await self.db.get(Asset, asset_id)
        if not asset:
            raise ResourceNotFoundError("Asset", asset_id)
        return asset

    async def get_asset_for_user(self, asset_id: int, user: User) -> Asset:
        """
        Get asset with authorization check

        Args:
            asset_id: Asset ID
            user: Current user

        Returns:
            Asset

        Raises:
            ResourceNotFoundError: Asset not found
            InvalidOperationError: Not authorized
        """
        asset = await self.get_asset(asset_id)

        # Authorization check
        if asset.user_id != user.id and not user.is_admin():
            raise InvalidOperationError("Cannot access other users' assets")

        return asset

    # ===== RECOGNITION / METADATA HELPERS =====

    async def update_recognition_metadata(
        self,
        asset: Asset,
        recognition: RecognitionMetadata,
    ) -> Asset:
        """
        Merge recognition metadata into asset.media_metadata.

        This is intended to be used by offline analysis jobs that perform
        face recognition, action recognition, etc. It keeps the structure
        flexible and additive.
        """
        meta = dict(asset.media_metadata or {})
        meta["faces"] = [f.model_dump() for f in recognition.faces]
        meta["actions"] = [a.model_dump() for a in recognition.actions]
        meta["interactions"] = [i.model_dump() for i in recognition.interactions]
        asset.media_metadata = meta
        asset.last_accessed_at = datetime.now(timezone.utc)
        self.db.add(asset)
        await self.db.commit()
        await self.db.refresh(asset)
        return asset

    # ===== TAG MANAGEMENT =====
    # NOTE: Tag management has been moved to TagService
    # Use: from pixsim7.backend.main.services.tag_service import TagService
    #      tag_service = TagService(db)
    #      await tag_service.assign_tags_to_asset(asset_id, tag_slugs)

    async def bulk_update_tags(
        self,
        asset_ids: List[int],
        tags: List[str],
        user: User,
        mode: str = "add"  # "add", "remove", "replace"
    ) -> List[Asset]:
        """
        Update tags for multiple assets at once using the new TagService

        Args:
            asset_ids: List of asset IDs
            tags: Tag slugs to apply (e.g., ["character:alice", "style:anime"])
            user: Current user
            mode: Operation mode - "add", "remove", or "replace"

        Returns:
            List of updated assets

        Raises:
            ResourceNotFoundError: Any asset not found
            PermissionError: User doesn't own any asset
        """
        from pixsim7.backend.main.services.tag_service import TagService

        tag_service = TagService(self.db)
        assets = []

        for asset_id in asset_ids:
            # Verify ownership
            asset = await self.get_asset_for_user(asset_id, user)

            # Apply tag operations
            if mode == "add":
                await tag_service.assign_tags_to_asset(asset_id, tags, auto_create=True)
            elif mode == "remove":
                await tag_service.remove_tags_from_asset(asset_id, tags)
            elif mode == "replace":
                await tag_service.replace_asset_tags(asset_id, tags, auto_create=True)
            else:
                raise InvalidOperationError(f"Invalid mode: {mode}. Use 'add', 'remove', or 'replace'")

            # Refresh to get updated asset
            await self.db.refresh(asset)
            assets.append(asset)

        return assets
