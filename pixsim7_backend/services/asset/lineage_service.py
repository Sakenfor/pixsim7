"""Lineage query helpers for simplified asset_lineage table."""
from __future__ import annotations

from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7_backend.domain.asset_lineage import AssetLineage
from pixsim7_backend.domain.asset import Asset


class AssetLineageService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_parents(self, child_asset_id: int) -> List[Asset]:
        q = select(Asset).join(AssetLineage, Asset.id == AssetLineage.parent_asset_id).where(
            AssetLineage.child_asset_id == child_asset_id
        ).order_by(AssetLineage.sequence_order.asc())
        res = await self.db.execute(q)
        return list(res.scalars().all())

    async def get_children(self, parent_asset_id: int) -> List[Asset]:
        q = select(Asset).join(AssetLineage, Asset.id == AssetLineage.child_asset_id).where(
            AssetLineage.parent_asset_id == parent_asset_id
        ).order_by(AssetLineage.created_at.asc())
        res = await self.db.execute(q)
        return list(res.scalars().all())

    async def get_lineage_links(self, asset_id: int) -> List[AssetLineage]:
        q = select(AssetLineage).where(
            (AssetLineage.child_asset_id == asset_id) | (AssetLineage.parent_asset_id == asset_id)
        ).order_by(AssetLineage.created_at.asc())
        res = await self.db.execute(q)
        return list(res.scalars().all())
