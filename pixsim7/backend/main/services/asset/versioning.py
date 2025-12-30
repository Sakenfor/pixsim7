"""Asset versioning service

Handles git-like versioning for assets:
- Version resolution at generation time
- Family creation and management
- HEAD management
- Version chain queries

Extends the shared VersioningServiceBase for common operations.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.domain.assets.versioning import AssetVersionFamily
from pixsim7.backend.main.services.versioning import (
    VersionContext,
    VersioningServiceBase,
    TimelineEntry,
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

    def __init__(self, db: AsyncSession):
        super().__init__(db)

    # =========================================================================
    # ABSTRACT METHOD IMPLEMENTATIONS
    # =========================================================================

    def get_family_model(self) -> type:
        return AssetVersionFamily

    def get_entity_model(self) -> type:
        return Asset

    def get_family_id_field(self, entity: Asset) -> Optional[UUID]:
        return entity.version_family_id

    def get_parent_id(self, entity: Asset) -> Optional[int]:
        return entity.parent_asset_id

    def get_entity_id(self, entity: Asset) -> int:
        return entity.id

    def get_version_number(self, entity: Asset) -> Optional[int]:
        return entity.version_number

    def get_version_message(self, entity: Asset) -> Optional[str]:
        return entity.version_message

    def get_head_id(self, family: AssetVersionFamily) -> Optional[int]:
        return family.head_asset_id

    def build_family_id_filter(self, family_id: UUID):
        return Asset.version_family_id == family_id

    def build_entity_id_filter(self, entity_id: int):
        return Asset.id == entity_id

    def build_parent_id_filter(self, parent_id: int):
        return Asset.parent_asset_id == parent_id

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
        source_asset.version_family_id = family.id
        source_asset.version_number = 1
        source_asset.parent_asset_id = None  # v1 has no parent
        source_asset.version_message = "Initial version"

        await self.db.flush()
        return family

    # =========================================================================
    # HEAD MANAGEMENT (Asset-specific)
    # =========================================================================

    async def set_head(self, family_id: UUID, asset_id: int) -> AssetVersionFamily:
        """
        Set which asset is the HEAD (current best) version.

        Args:
            family_id: The family to update
            asset_id: The asset to set as HEAD

        Returns:
            Updated family

        Raises:
            ValueError: If asset doesn't belong to family
        """
        # Verify asset belongs to family
        result = await self.db.execute(
            select(Asset).where(
                Asset.id == asset_id,
                Asset.version_family_id == family_id
            )
        )
        asset = result.scalar_one_or_none()
        if not asset:
            raise ValueError(
                f"Asset {asset_id} does not belong to family {family_id}"
            )

        # Update family HEAD
        family = await self.get_family(family_id)
        if not family:
            raise ValueError(f"Family {family_id} not found")

        family.head_asset_id = asset_id
        family.updated_at = datetime.utcnow()

        await self.db.flush()
        return family

    async def elect_new_head(self, family_id: UUID) -> Optional[int]:
        """
        Auto-elect a new HEAD after the current HEAD is deleted.

        Strategy: Pick the asset with the highest version_number.

        Returns:
            The new head_asset_id, or None if family is empty
        """
        result = await self.db.execute(
            select(Asset.id)
            .where(Asset.version_family_id == family_id)
            .order_by(Asset.version_number.desc())
            .limit(1)
        )
        new_head_id = result.scalar_one_or_none()

        if new_head_id:
            family = await self.get_family(family_id)
            if family:
                family.head_asset_id = new_head_id
                family.updated_at = datetime.utcnow()
                await self.db.flush()

        return new_head_id

    # =========================================================================
    # CONVENIENCE METHODS
    # =========================================================================

    async def get_family_for_asset(
        self, asset_id: int
    ) -> Optional[AssetVersionFamily]:
        """Get the version family for an asset, if it belongs to one."""
        result = await self.db.execute(
            select(Asset.version_family_id).where(Asset.id == asset_id)
        )
        family_id_str = result.scalar_one_or_none()
        if not family_id_str:
            return None
        return await self.get_family(UUID(family_id_str))

    async def get_version_timeline(self, family_id: UUID) -> List[dict]:
        """
        Get timeline view of all versions (returns dicts for API response).

        Wraps the base get_timeline() and converts to dicts.
        """
        timeline = await self.get_timeline(family_id)
        return [entry.to_dict() for entry in timeline]

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
