"""Asset versioning service

Handles git-like versioning for assets:
- Version resolution at generation time
- Family creation and management
- HEAD management
- Version chain queries

Extends the shared VersioningServiceBase for common operations.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.domain.assets.versioning import AssetVersionFamily
from pixsim7.backend.main.services.versioning import (
    VersionContext,
    VersioningServiceBase,
)


class AssetVersioningService(VersioningServiceBase[AssetVersionFamily, Asset]):
    """
    Service for managing asset version families and resolving version intent.

    Extends VersioningServiceBase with asset-specific operations:
    - HEAD management (assets have explicit HEAD, prompts don't)
    - Version resolution at generation time
    - Fork operations

    Concurrency:
    - Uses SELECT FOR UPDATE on family row to prevent duplicate version numbers
    - Version numbers derived from MAX(version_number) within transaction
    """

    family_model = AssetVersionFamily
    entity_model = Asset
    parent_id_attr = "parent_asset_id"
    head_id_attr = "head_asset_id"

    def __init__(self, db: AsyncSession):
        super().__init__(db)

    # =========================================================================
    # HEAD CHANGE HOOK — hide superseded versions from listings
    # =========================================================================

    async def on_head_changed(
        self,
        family: AssetVersionFamily,
        old_head_id: Any,
        new_head_id: Any,
    ) -> None:
        """When HEAD moves forward, hide old HEAD from gallery/search."""
        if old_head_id and old_head_id != new_head_id:
            old_head = await self.get_entity(old_head_id)
            if old_head and getattr(old_head, "searchable", None) is not False:
                old_head.searchable = False
                await self.db.flush()

        # Ensure new HEAD is visible
        new_head = await self.get_entity(new_head_id)
        if new_head and getattr(new_head, "searchable", None) is not True:
            new_head.searchable = True
            await self.db.flush()

    # =========================================================================
    # ENTITY-SPECIFIC METADATA
    # =========================================================================

    def get_timeline_metadata(self, entity: Asset) -> Dict[str, Any]:
        """Extract asset-specific metadata for timeline entries."""
        return {
            "description": entity.description,
            "thumbnail_url": getattr(entity, 'thumbnail_url', None),
            "media_type": entity.media_type.value if entity.media_type else None,
        }

    # =========================================================================
    # VERSION RESOLUTION (called at generation time)
    # =========================================================================

    async def resolve_version_intent(
        self,
        input_assets: List[Asset],
        version_intent: str,
        version_message: Optional[str],
        user_id: int,
    ) -> VersionContext:
        """
        Determine version family and number for a new asset.

        Args:
            input_assets: Assets used as input for generation
            version_intent: "new" or "version"
            version_message: What changed (for version_intent="version")
            user_id: Owner of the new asset

        Returns:
            VersionContext with family_id, version_number, parent_id

        Raises:
            ValueError: If version_intent="version" with 0 or 2+ inputs

        VALIDATION:
        - version_intent="version" requires exactly ONE input asset
        - version_intent="new" works with any number of inputs
        """
        # Validation for version intent
        if version_intent == "version":
            if len(input_assets) == 0:
                raise ValueError("version_intent='version' requires an input asset")
            if len(input_assets) > 1:
                raise ValueError(
                    "version_intent='version' requires exactly one input asset. "
                    "For multiple inputs, use version_intent='new'."
                )
            input_asset = input_assets[0]
        else:
            input_asset = None

        if version_intent == "new" or input_asset is None:
            # New standalone asset (no versioning)
            return VersionContext(
                family_id=None,
                version_number=None,
                parent_id=None,
                version_message=None
            )

        # version_intent == "version" with single input
        if input_asset.version_family_id:
            # Input is already versioned - continue the chain
            return await self._continue_version_chain(
                input_asset, version_message
            )
        else:
            # Input is standalone - upgrade it to v1 and create family
            family = await self._create_family_and_upgrade_source(
                input_asset, user_id
            )
            return VersionContext(
                family_id=family.id,
                version_number=2,  # New asset will be v2
                parent_id=input_asset.id,
                version_message=version_message
            )

    async def _continue_version_chain(
        self,
        input_asset: Asset,
        version_message: Optional[str],
    ) -> VersionContext:
        """
        Continue an existing version chain.

        Uses SELECT FOR UPDATE on family to prevent concurrent version assignment.
        """
        family_id = input_asset.version_family_id
        next_version = await self.get_next_version_number(family_id, lock=True)

        return VersionContext(
            family_id=family_id,
            version_number=next_version,
            parent_id=input_asset.id,
            version_message=version_message
        )

    async def _create_family_and_upgrade_source(
        self,
        source_asset: Asset,
        user_id: int,
    ) -> AssetVersionFamily:
        """
        Create a new version family and upgrade the source asset to v1.

        CRITICAL: Must update source_asset to be part of the family,
        otherwise we'd have a family with v2 but no v1.
        """
        # Create family
        family = AssetVersionFamily(
            name=source_asset.description or f"Asset {source_asset.id}",
            user_id=user_id,
            head_asset_id=source_asset.id,  # Source is initially HEAD
        )
        self.db.add(family)
        await self.db.flush()  # Get family.id

        # UPGRADE source asset to v1 of this family
        await self.upgrade_entity_to_v1(family, source_asset)
        return family

    # =========================================================================
    # CONVENIENCE METHODS
    # =========================================================================

    async def get_family_for_asset(
        self, asset_id: int
    ) -> Optional[AssetVersionFamily]:
        """Get the version family for an asset, if it belongs to one."""
        return await self.get_family_for_entity(asset_id)

    # =========================================================================
    # VERSION FOR UPLOADS (non-generation path, e.g. mask saves)
    # =========================================================================

    async def apply_version_for_upload(
        self,
        new_asset_id: int,
        parent_asset_id: int,
        version_message: Optional[str] = None,
    ) -> None:
        """
        Chain a newly uploaded asset as a version of an existing asset.

        Used for non-generation versioning (e.g. saving an edited mask).
        Creates a family if the parent is standalone, continues the chain
        if the parent is already versioned, then sets HEAD to the new asset.
        """
        parent = await self.get_entity(parent_asset_id)
        if not parent:
            raise ValueError(f"Parent asset {parent_asset_id} not found")
        new_asset = await self.get_entity(new_asset_id)
        if not new_asset:
            raise ValueError(f"New asset {new_asset_id} not found")

        # Resolve version context (same logic as generation path)
        ctx = await self.resolve_version_intent(
            input_assets=[parent],
            version_intent="version",
            version_message=version_message,
            user_id=parent.user_id,
        )

        # Apply version metadata to the new asset
        new_asset.version_family_id = ctx.family_id
        new_asset.version_number = ctx.version_number
        new_asset.parent_asset_id = ctx.parent_id
        new_asset.version_message = ctx.version_message
        await self.db.flush()

        # Update HEAD → triggers on_head_changed (hides old HEAD)
        if ctx.family_id:
            await self.set_head(ctx.family_id, new_asset_id)

    # =========================================================================
    # FORK OPERATIONS (Asset-specific)
    # =========================================================================

    async def fork_to_new_family(
        self,
        source_asset_id: int,
        user_id: int,
        fork_name: Optional[str] = None,
    ) -> AssetVersionFamily:
        """
        Create a new family starting from an existing asset.

        SEMANTICS:
        - Creates a NEW family
        - Source asset is NOT moved - it stays in its original family (if any)
        - A reference copy concept is established (source becomes conceptual v1)

        For actual implementation, you'd typically create a new asset that
        references the source, rather than modifying the source. This method
        just creates the family structure.

        Returns:
            The new family
        """
        # Get source asset
        source = await self.get_entity(source_asset_id)
        if not source:
            raise ValueError(f"Asset {source_asset_id} not found")

        # Create new family
        family = AssetVersionFamily(
            name=fork_name or source.description or f"Fork of Asset {source_asset_id}",
            user_id=user_id,
            head_asset_id=None,  # Will be set when first asset is added
        )
        self.db.add(family)
        await self.db.flush()

        return family
