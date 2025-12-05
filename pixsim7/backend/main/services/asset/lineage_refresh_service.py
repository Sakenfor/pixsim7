"""
Lineage Refresh Service

Utility service to (re)build AssetLineage edges from stored provider
metadata, without re-importing or re-downloading assets.

Intended for manual/ops use (e.g., admin tools, one-off maintenance),
not for scheduled/background ticks by default.
"""
from __future__ import annotations

from typing import Optional, Dict, Any, Iterable
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from pixsim7.backend.main.domain import Asset, User
from pixsim7.backend.main.domain.asset_lineage import AssetLineage
from pixsim_logging import get_logger


logger = get_logger()


class LineageRefreshService:
    """
    Rebuilds lineage for existing assets using provider extractors.

    This uses the same path as AssetEnrichmentService's embedded
    extraction, but separated so it can be invoked manually to
    fix or upgrade lineage for already-imported assets.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def refresh_asset_lineage(
        self,
        asset_id: int,
        *,
        provider_id: Optional[str] = None,
        clear_existing: bool = True,
    ) -> Dict[str, Any]:
        """
        Refresh lineage for a single asset.

        Args:
            asset_id: ID of the child asset whose lineage should be rebuilt.
            provider_id: Optional guard; if provided, only refresh when the
                asset's provider_id matches.
            clear_existing: When True, existing AssetLineage edges for this
                child are deleted before rebuild to avoid duplicates.

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

        # Delegate to existing enrichment logic for extraction + parent creation.
        from pixsim7.backend.main.services.asset.enrichment_service import AssetEnrichmentService

        enrichment = AssetEnrichmentService(self.db)
        await enrichment._extract_and_register_embedded(asset, user)

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
        )

        return {
            "asset_id": asset.id,
            "provider_id": asset.provider_id,
            "removed_edges": removed_edges,
            "new_edges": len(edges),
            "status": "ok",
        }

    async def refresh_for_assets(
        self,
        asset_ids: Iterable[int],
        *,
        provider_id: Optional[str] = None,
        clear_existing: bool = True,
    ) -> Dict[str, Any]:
        """
        Refresh lineage for multiple assets by ID list.

        Args:
            asset_ids: Iterable of asset IDs to refresh.
            provider_id: Optional provider filter, see refresh_asset_lineage.
            clear_existing: Whether to clear existing edges before rebuild.

        Returns:
            Aggregate summary with per-asset results.
        """
        results = []
        for aid in asset_ids:
            res = await self.refresh_asset_lineage(
                aid,
                provider_id=provider_id,
                clear_existing=clear_existing,
            )
            results.append(res)

        return {
            "count": len(results),
            "results": results,
        }

