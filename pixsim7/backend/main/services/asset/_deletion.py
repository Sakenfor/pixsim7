"""
Asset Deletion Mixin

Handles asset deletion, including local file cleanup, storage cleanup,
content blob cleanup, and provider-side deletion.
"""
from __future__ import annotations

import os
from typing import TYPE_CHECKING

from sqlalchemy import select, func

from pixsim7.backend.main.domain import Asset, User
from pixsim7.backend.main.shared.errors import InvalidOperationError
from pixsim7.backend.main.infrastructure.events.bus import event_bus, ASSET_DELETED
from pixsim_logging import get_logger

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession
    from pixsim7.backend.main.services.user.user_service import UserService

logger = get_logger()


class AssetDeletionMixin:
    """Mixin providing asset deletion methods."""

    db: AsyncSession
    users: UserService

    async def delete_asset(self, asset_id: int, user: User, delete_from_provider: bool = True) -> None:
        """
        Delete an asset owned by the user (or any asset if admin).

        Removes the database record and best-effort deletes the local file.
        Also deletes any generations and lineage that reference this asset.

        Args:
            asset_id: Asset ID to delete
            user: User requesting deletion
            delete_from_provider: If True, also attempt to delete from provider
        """
        from pixsim7.backend.main.domain.generation.models import Generation
        from pixsim7.backend.main.domain.assets.lineage import AssetLineage
        from sqlalchemy import delete as sql_delete, or_

        asset = await self.get_asset_for_user(asset_id, user)

        # Delete related lineage records (both as parent and child)
        await self.db.execute(
            sql_delete(AssetLineage).where(
                or_(
                    AssetLineage.parent_asset_id == asset_id,
                    AssetLineage.child_asset_id == asset_id
                )
            )
        )

        # Delete related generations that reference this asset
        await self.db.execute(
            sql_delete(Generation).where(Generation.asset_id == asset_id)
        )

        # Snapshot owner/files for post-commit cleanup and event payload.
        asset_owner_id = asset.user_id
        local_path = asset.local_path
        stored_key = asset.stored_key
        content_id = asset.content_id
        should_delete_stored_file = False
        should_delete_local_file = False
        local_path_managed_by_storage = False

        await self.db.delete(asset)
        await self.db.flush()

        # Only delete the stored file if no other assets share it
        if stored_key:
            sibling_count_result = await self.db.execute(
                select(func.count()).select_from(Asset).where(
                    Asset.stored_key == stored_key,
                )
            )
            sibling_count = sibling_count_result.scalar() or 0
            if sibling_count == 0:
                should_delete_stored_file = True

            try:
                from pixsim7.backend.main.services.storage import get_storage_service
                storage = get_storage_service()
                local_path_managed_by_storage = local_path == storage.get_path(stored_key)
            except Exception:
                local_path_managed_by_storage = False

        # local_path is cache-oriented and may not be tied to storage keys.
        # Delete only when no other assets point at the same local file.
        if local_path and (not stored_key or not local_path_managed_by_storage):
            local_ref_count_result = await self.db.execute(
                select(func.count()).select_from(Asset).where(
                    Asset.local_path == local_path,
                )
            )
            local_ref_count = local_ref_count_result.scalar() or 0
            if local_ref_count == 0:
                should_delete_local_file = True

        # Clean up ContentBlob if no other assets reference it
        if content_id:
            from pixsim7.backend.main.domain.assets.content import ContentBlob
            ref_count_result = await self.db.execute(
                select(func.count()).select_from(Asset).where(
                    Asset.content_id == content_id,
                )
            )
            ref_count = ref_count_result.scalar() or 0
            if ref_count == 0:
                blob_result = await self.db.execute(
                    select(ContentBlob).where(ContentBlob.id == content_id)
                )
                blob = blob_result.scalar_one_or_none()
                if blob:
                    await self.db.delete(blob)

        await self.db.commit()

        # Best-effort remote/provider cleanup AFTER commit to avoid rollback/file mismatch.
        if delete_from_provider and asset.provider_asset_id and asset.provider_id:
            await self._delete_from_provider(asset)

        if should_delete_local_file and local_path:
            try:
                if os.path.exists(local_path):
                    os.remove(local_path)
            except Exception:
                pass

        if should_delete_stored_file and stored_key:
            try:
                from pixsim7.backend.main.services.storage import get_storage_service
                storage = get_storage_service()
                await storage.delete(stored_key)
            except Exception:
                logger.warning(
                    "stored_key_delete_failed",
                    stored_key=stored_key,
                    asset_id=asset_id,
                )

        await event_bus.publish(ASSET_DELETED, {
            "asset_id": asset_id,
            "user_id": asset_owner_id,
            "deleted_by_user_id": user.id,
        })

    async def _delete_from_provider(self, asset: Asset) -> None:
        """
        Attempt to delete asset from provider (best effort).

        Logs errors but does not raise - local deletion should always proceed.
        """
        from pixsim7.backend.main.domain.providers.models import ProviderAccount

        try:
            # Get provider from registry
            from pixsim7.backend.main.services.provider.provider_service import registry
            provider = registry.get(asset.provider_id)

            # Check if provider supports deletion
            if not hasattr(provider, 'delete_asset'):
                logger.info(
                    "provider_delete_not_supported",
                    provider_id=asset.provider_id,
                    asset_id=asset.id,
                )
                return

            # Get provider account
            if not asset.provider_account_id:
                logger.warning(
                    "provider_delete_no_account",
                    provider_id=asset.provider_id,
                    asset_id=asset.id,
                )
                return

            account = await self.db.get(ProviderAccount, asset.provider_account_id)
            if not account:
                logger.warning(
                    "provider_delete_account_not_found",
                    asset_id=asset.id,
                    provider_account_id=asset.provider_account_id,
                )
                return

            # Call provider delete
            await provider.delete_asset(
                account=account,
                provider_asset_id=asset.provider_asset_id,
                media_type=asset.media_type,
                media_metadata=asset.media_metadata,
            )

            logger.info(
                "provider_delete_success",
                provider_id=asset.provider_id,
                asset_id=asset.id,
                provider_asset_id=asset.provider_asset_id,
            )

        except Exception as e:
            # Log error but don't fail - local deletion should proceed
            logger.error(
                "provider_delete_failed",
                provider_id=asset.provider_id,
                asset_id=asset.id,
                provider_asset_id=asset.provider_asset_id,
                error=str(e),
                error_type=e.__class__.__name__,
                exc_info=True,
            )
            # Note: Could emit event here for UI notification if needed
