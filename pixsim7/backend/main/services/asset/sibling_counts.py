"""Batch sibling-count queries for media-card badges.

Two glanceable counts per asset, both **user-scoped** and **include-self**:

* ``same_inputs`` — how many of the user's assets share the same *set of input
  assets* (grouped by the denormalized ``Asset.input_assets_key``). 0 when the
  asset had no input assets (text-to-* generations, uploads) — the frontend
  hides the badge below 2.
* ``same_prompt`` — how many of the user's assets share the same *prompt
  family* (``PromptVersion.family_id``), falling back to the exact
  ``prompt_version_id`` for one-off prompts that aren't in a family. 0 when the
  asset has no prompt linkage (uploads).

Mirrors ``AssetLineageService.has_children_map`` — batch a whole gallery page
in a couple of GROUP BY queries so list responses need no per-card round-trips.

See plan ``media-card-sibling-badges``.
"""
from __future__ import annotations

from typing import Dict, Iterable, List
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.assets.models import Asset


class AssetSiblingCountService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def counts_map(
        self, assets: Iterable[Asset], owner_user_id: int
    ) -> Dict[int, Dict[str, int]]:
        """Return ``{asset_id: {"same_inputs": int, "same_prompt": int}}``."""
        asset_list = [a for a in assets if a is not None]
        result: Dict[int, Dict[str, int]] = {
            a.id: {"same_inputs": 0, "same_prompt": 0} for a in asset_list
        }
        if not asset_list:
            return result

        await self._fill_same_inputs(asset_list, owner_user_id, result)
        await self._fill_same_prompt(asset_list, owner_user_id, result)
        return result

    async def _fill_same_inputs(
        self,
        assets: List[Asset],
        owner_user_id: int,
        result: Dict[int, Dict[str, int]],
    ) -> None:
        keys = {a.input_assets_key for a in assets if a.input_assets_key}
        if not keys:
            return

        q = (
            select(Asset.input_assets_key, func.count(Asset.id))
            .where(Asset.user_id == owner_user_id)
            .where(Asset.input_assets_key.in_(keys))
            .group_by(Asset.input_assets_key)
        )
        counts = {key: int(n) for key, n in (await self.db.execute(q)).all()}

        for a in assets:
            if a.input_assets_key:
                result[a.id]["same_inputs"] = counts.get(a.input_assets_key, 0)

    async def _fill_same_prompt(
        self,
        assets: List[Asset],
        owner_user_id: int,
        result: Dict[int, Dict[str, int]],
    ) -> None:
        # Group by the denormalized family (no join). Assets whose prompt has no
        # family (one-off prompts) fall back to grouping by exact version.
        families = {a.prompt_family_id for a in assets if a.prompt_family_id}
        oneoff_pv_ids = {
            a.prompt_version_id
            for a in assets
            if a.prompt_version_id and not a.prompt_family_id
        }

        family_counts: Dict[UUID, int] = {}
        if families:
            fq = (
                select(Asset.prompt_family_id, func.count(Asset.id))
                .where(Asset.user_id == owner_user_id)
                .where(Asset.prompt_family_id.in_(families))
                .group_by(Asset.prompt_family_id)
            )
            family_counts = {fid: int(n) for fid, n in (await self.db.execute(fq)).all()}

        version_counts: Dict[UUID, int] = {}
        if oneoff_pv_ids:
            vq = (
                select(Asset.prompt_version_id, func.count(Asset.id))
                .where(Asset.user_id == owner_user_id)
                .where(Asset.prompt_version_id.in_(oneoff_pv_ids))
                .group_by(Asset.prompt_version_id)
            )
            version_counts = {pv: int(n) for pv, n in (await self.db.execute(vq)).all()}

        for a in assets:
            if a.prompt_family_id:
                result[a.id]["same_prompt"] = family_counts.get(a.prompt_family_id, 0)
            elif a.prompt_version_id:
                result[a.id]["same_prompt"] = version_counts.get(a.prompt_version_id, 0)
