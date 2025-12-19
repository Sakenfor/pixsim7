"""
Lineage Refresh Service

Utility service to (re)build AssetLineage edges from stored provider
metadata, without re-importing or re-downloading assets.

Supports two sources for lineage extraction:
1. Provider metadata (embedded assets in media_metadata)
2. Generation inputs (from Generation.inputs for assets with source_generation_id)

Intended for manual/ops use (e.g., admin tools, one-off maintenance),
not for scheduled/background ticks by default.
"""
from __future__ import annotations

from typing import Optional, Dict, Any, Iterable, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from pixsim7.backend.main.domain import Asset, User
from pixsim7.backend.main.domain.assets.lineage import AssetLineage
from pixsim7.backend.main.domain.generation.models import Generation
from pixsim_logging import get_logger


logger = get_logger()


class LineageRefreshService:
    """
    Rebuilds lineage for existing assets using multiple sources.

    Supports two lineage extraction strategies:
    1. Provider metadata (embedded assets in media_metadata) - via AssetEnrichmentService
    2. Generation inputs (from Generation.inputs for assets with source_generation_id)

    This allows repairing/backfilling lineage for:
    - Assets with embedded asset metadata from providers
    - Assets created from generations with tracked input assets
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def refresh_asset_lineage(
        self,
        asset_id: int,
        *,
        provider_id: Optional[str] = None,
        clear_existing: bool = True,
        include_generation_inputs: bool = True,
    ) -> Dict[str, Any]:
        """
        Refresh lineage for a single asset.

        Attempts to rebuild lineage from multiple sources:
        1. Provider metadata (embedded assets)
        2. Generation.inputs (if asset has source_generation_id)

        Args:
            asset_id: ID of the child asset whose lineage should be rebuilt.
            provider_id: Optional guard; if provided, only refresh when the
                asset's provider_id matches.
            clear_existing: When True, existing AssetLineage edges for this
                child are deleted before rebuild to avoid duplicates.
            include_generation_inputs: When True, also build lineage from
                Generation.inputs if asset has source_generation_id.

        Returns:
            Summary dict with counts and basic identifiers.
        """
        asset = await self.db.get(Asset, asset_id)
        if not asset:
            return {
                "asset_id": asset_id,
                "status": "not_found",
            }

        if provider_id and asset.provider_id != provider_id:
            return {
                "asset_id": asset_id,
                "status": "provider_mismatch",
                "asset_provider_id": asset.provider_id,
            }

        # Load owning user (required by enrichment helpers for parent creation).
        user = await self.db.get(User, asset.user_id)
        if not user:
            return {
                "asset_id": asset_id,
                "status": "user_not_found",
            }

        removed_edges = 0
        if clear_existing:
            stmt = delete(AssetLineage).where(AssetLineage.child_asset_id == asset.id)
            result = await self.db.execute(stmt)
            removed_edges = result.rowcount or 0
            await self.db.commit()

        # Strategy 1: Delegate to existing enrichment logic for embedded extraction
        from pixsim7.backend.main.services.asset.enrichment_service import AssetEnrichmentService

        enrichment = AssetEnrichmentService(self.db)
        await enrichment._extract_and_register_embedded(asset, user)

        # Strategy 2: Build lineage from Generation.inputs if asset has source_generation_id
        generation_lineage_count = 0
        if include_generation_inputs and asset.source_generation_id:
            generation_lineage_count = await self._build_lineage_from_generation(
                asset.id,
                asset.source_generation_id,
            )

        # Count new edges for reporting.
        stmt_count = select(AssetLineage).where(AssetLineage.child_asset_id == asset.id)
        result_edges = await self.db.execute(stmt_count)
        edges = result_edges.scalars().all()

        logger.info(
            "lineage_refresh_completed",
            asset_id=asset.id,
            provider_id=asset.provider_id,
            removed_edges=removed_edges,
            new_edges=len(edges),
            from_generation_inputs=generation_lineage_count,
        )

        return {
            "asset_id": asset.id,
            "provider_id": asset.provider_id,
            "removed_edges": removed_edges,
            "new_edges": len(edges),
            "from_generation_inputs": generation_lineage_count,
            "status": "ok",
        }

    async def _build_lineage_from_generation(
        self,
        child_asset_id: int,
        generation_id: int,
    ) -> int:
        """
        Build lineage edges from Generation.inputs.

        Loads the generation, extracts asset inputs, and creates lineage edges.

        Args:
            child_asset_id: ID of the child asset
            generation_id: ID of the source generation

        Returns:
            Number of lineage edges created from generation inputs
        """
        from pixsim7.backend.main.services.asset.asset_factory import create_lineage_links_with_metadata

        # Load the generation
        generation = await self.db.get(Generation, generation_id)
        if not generation:
            logger.warning(
                "lineage_refresh_generation_not_found",
                child_asset_id=child_asset_id,
                generation_id=generation_id,
            )
            return 0

        # Check if generation has inputs
        if not generation.inputs or not isinstance(generation.inputs, list):
            return 0

        # Filter to inputs with asset references
        inputs_with_assets = [
            inp for inp in generation.inputs
            if isinstance(inp, dict) and inp.get("asset")
        ]

        if not inputs_with_assets:
            return 0

        # Check for existing edges to avoid duplicates
        existing_stmt = select(AssetLineage.parent_asset_id).where(
            AssetLineage.child_asset_id == child_asset_id
        )
        existing_result = await self.db.execute(existing_stmt)
        existing_parents = {row[0] for row in existing_result.fetchall()}

        # Filter out inputs that already have lineage edges
        new_inputs = []
        for inp in inputs_with_assets:
            asset_ref = inp.get("asset", "")
            if not asset_ref.startswith("asset:"):
                continue
            try:
                parent_id = int(asset_ref.split(":", 1)[1])
                if parent_id not in existing_parents:
                    new_inputs.append(inp)
            except (ValueError, IndexError):
                continue

        if not new_inputs:
            return 0

        # Create lineage edges
        try:
            created_count = await create_lineage_links_with_metadata(
                self.db,
                child_asset_id=child_asset_id,
                parent_inputs=new_inputs,
                operation_type=generation.operation_type,
            )

            logger.info(
                "lineage_refresh_from_generation",
                child_asset_id=child_asset_id,
                generation_id=generation_id,
                operation_type=generation.operation_type.value,
                created_edges=created_count,
            )

            return created_count
        except Exception as e:
            logger.warning(
                "lineage_refresh_from_generation_failed",
                child_asset_id=child_asset_id,
                generation_id=generation_id,
                error=str(e),
            )
            return 0

    async def refresh_for_assets(
        self,
        asset_ids: Iterable[int],
        *,
        provider_id: Optional[str] = None,
        clear_existing: bool = True,
        include_generation_inputs: bool = True,
    ) -> Dict[str, Any]:
        """
        Refresh lineage for multiple assets by ID list.

        Args:
            asset_ids: Iterable of asset IDs to refresh.
            provider_id: Optional provider filter, see refresh_asset_lineage.
            clear_existing: Whether to clear existing edges before rebuild.
            include_generation_inputs: Whether to include lineage from Generation.inputs.

        Returns:
            Aggregate summary with per-asset results.
        """
        results = []
        for aid in asset_ids:
            res = await self.refresh_asset_lineage(
                aid,
                provider_id=provider_id,
                clear_existing=clear_existing,
                include_generation_inputs=include_generation_inputs,
            )
            results.append(res)

        return {
            "count": len(results),
            "results": results,
        }

