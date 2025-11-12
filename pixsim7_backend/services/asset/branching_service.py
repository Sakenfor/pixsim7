"""Branching and clip management service (simplified).

Provides helpers to create/list branches, variants, and clips for video assets.
"""
from __future__ import annotations

from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7_backend.domain.asset_branching import AssetBranch, AssetBranchVariant, AssetClip
from pixsim7_backend.domain.asset import Asset


class AssetBranchingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_branch(
        self,
        source_asset_id: int,
        *,
        branch_time: float,
        branch_name: Optional[str] = None,
        branch_tag: Optional[str] = None,
        branch_description: Optional[str] = None,
        branch_type: str = "manual"
    ) -> AssetBranch:
        branch = AssetBranch(
            source_asset_id=source_asset_id,
            branch_time=branch_time,
            branch_name=branch_name,
            branch_tag=branch_tag,
            branch_description=branch_description,
            branch_type=branch_type,
        )
        self.db.add(branch)
        await self.db.commit()
        await self.db.refresh(branch)
        return branch

    async def list_branches(self, source_asset_id: int) -> List[AssetBranch]:
        q = select(AssetBranch).where(AssetBranch.source_asset_id == source_asset_id).order_by(AssetBranch.branch_time.asc())
        res = await self.db.execute(q)
        return list(res.scalars().all())

    async def add_variant(
        self,
        branch_id: int,
        variant_asset_id: int,
        *,
        variant_name: str,
        variant_tag: Optional[str] = None,
        variant_description: Optional[str] = None,
        weight: float = 1.0,
        display_order: int = 0
    ) -> AssetBranchVariant:
        variant = AssetBranchVariant(
            branch_id=branch_id,
            variant_asset_id=variant_asset_id,
            variant_name=variant_name,
            variant_tag=variant_tag,
            variant_description=variant_description,
            weight=weight,
            display_order=display_order,
        )
        self.db.add(variant)
        await self.db.commit()
        await self.db.refresh(variant)
        return variant

    async def list_variants(self, branch_id: int) -> List[AssetBranchVariant]:
        q = select(AssetBranchVariant).where(AssetBranchVariant.branch_id == branch_id).order_by(AssetBranchVariant.display_order.asc())
        res = await self.db.execute(q)
        return list(res.scalars().all())

    async def create_clip(
        self,
        source_asset_id: int,
        *,
        start_time: float,
        end_time: float,
        clip_name: str,
        clip_tag: Optional[str] = None,
        start_frame: Optional[int] = None,
        end_frame: Optional[int] = None,
        clip_asset_id: Optional[int] = None,
    ) -> AssetClip:
        clip = AssetClip(
            source_asset_id=source_asset_id,
            start_time=start_time,
            end_time=end_time,
            clip_name=clip_name,
            clip_tag=clip_tag,
            start_frame=start_frame,
            end_frame=end_frame,
            clip_asset_id=clip_asset_id,
        )
        self.db.add(clip)
        await self.db.commit()
        await self.db.refresh(clip)
        return clip

    async def list_clips(self, source_asset_id: int) -> List[AssetClip]:
        q = select(AssetClip).where(AssetClip.source_asset_id == source_asset_id).order_by(AssetClip.start_time.asc())
        res = await self.db.execute(q)
        return list(res.scalars().all())
