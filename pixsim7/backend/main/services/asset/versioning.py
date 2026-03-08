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
    # ENTITY-SPECIFIC HOOKS
    # =========================================================================

    def get_timeline_metadata(self, entity: Asset) -> Dict[str, Any]:
        """Extract asset-specific metadata for timeline entries."""
        return {
            "description": entity.description,
            "thumbnail_url": getattr(entity, 'thumbnail_url', None),
            "media_type": entity.media_type.value if entity.media_type else None,
        }

    def _derive_family_name(self, entity: Asset) -> str:
        return entity.description or f"Asset {entity.id}"

    def _build_family_kwargs(self, entity: Asset) -> Dict[str, Any]:
        return {"user_id": entity.user_id}

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
        # create_family_for_entity handles both standalone → new family
        # and already-versioned → return existing family
        family = await self.create_family_for_entity(input_asset)
        next_version = await self.get_next_version_number(family.id, lock=True)

        return VersionContext(
            family_id=family.id,
            version_number=next_version,
            parent_id=input_asset.id,
            version_message=version_message
        )

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
        Delegates to base chain_entity_as_version.
        """
        parent = await self.get_entity(parent_asset_id)
        if not parent:
            raise ValueError(f"Parent asset {parent_asset_id} not found")
        new_asset = await self.get_entity(new_asset_id)
        if not new_asset:
            raise ValueError(f"New asset {new_asset_id} not found")

        # Owner validation: prevent cross-user version chains
        if parent.user_id != new_asset.user_id:
            raise ValueError(
                f"Cannot version across users: parent owner={parent.user_id}, "
                f"new asset owner={new_asset.user_id}"
            )

        await self.chain_entity_as_version(new_asset, parent, version_message)

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
