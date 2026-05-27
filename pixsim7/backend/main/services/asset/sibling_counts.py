"""Batch sibling-count queries for media-card badges.

Three glanceable counts per asset, all **user-scoped** and **include-self**:

* ``same_inputs`` — how many of the user's assets share the same *set of input
  assets* (grouped by the denormalized ``Asset.input_assets_key``). 0 when the
  asset had no input assets (text-to-* generations, uploads) — the frontend
  hides the badge below 2.
* ``same_prompt`` — how many of the user's assets share the same *prompt
  family* (``PromptVersion.family_id``), falling back to the exact
  ``prompt_version_id`` for one-off prompts that aren't in a family. 0 when the
  asset has no prompt linkage (uploads).
* ``same_seed`` — how many of the user's assets share the same generation
  roll seed (``GenerationBatchItemManifest.roll_seed``). 0 when no seed is
  recorded for the asset.

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
from pixsim7.backend.main.domain.generation.models import Generation
from pixsim7.backend.main.domain.generation.models import GenerationBatchItemManifest
from pixsim7.backend.main.services.generation.context import extract_flat_provider_params


class AssetSiblingCountService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def counts_map(
        self, assets: Iterable[Asset], owner_user_id: int
    ) -> Dict[int, Dict[str, int]]:
        """Return ``{asset_id: {"same_inputs": int, "same_prompt": int, "same_seed": int}}``."""
        asset_list = [a for a in assets if a is not None]
        result: Dict[int, Dict[str, int]] = {
            a.id: {"same_inputs": 0, "same_prompt": 0, "same_seed": 0} for a in asset_list
        }
        if not asset_list:
            return result

        await self._fill_same_inputs(asset_list, owner_user_id, result)
        await self._fill_same_prompt(asset_list, owner_user_id, result)
        await self._fill_same_seed(asset_list, owner_user_id, result)
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

    async def _fill_same_seed(
        self,
        assets: List[Asset],
        owner_user_id: int,
        result: Dict[int, Dict[str, int]],
    ) -> None:
        asset_ids = [a.id for a in assets]
        if not asset_ids:
            return

        seed_rows = (
            await self.db.execute(
                select(
                    GenerationBatchItemManifest.asset_id,
                    GenerationBatchItemManifest.roll_seed,
                )
                .where(GenerationBatchItemManifest.asset_id.in_(asset_ids))
                .where(GenerationBatchItemManifest.roll_seed.is_not(None))
            )
        ).all()
        seed_by_asset_id = {
            int(asset_id): int(seed)
            for asset_id, seed in seed_rows
            if seed is not None
        }
        manifest_seed_values = set(seed_by_asset_id.values())

        # Fallback for older assets that have no manifest row/seed: read seed from
        # linked Generation payloads (run_context roll_seed or canonical params).
        missing_asset_ids = [asset_id for asset_id in asset_ids if asset_id not in seed_by_asset_id]
        if missing_asset_ids:
            fallback_rows = (
                await self.db.execute(
                    select(
                        Asset.id,
                        Generation.run_context,
                        Generation.canonical_params,
                    )
                    .join(Generation, Generation.id == Asset.source_generation_id)
                    .where(Asset.id.in_(missing_asset_ids))
                )
            ).all()

            def _coerce_seed(value: object) -> int | None:
                if value is None:
                    return None
                try:
                    return int(value)
                except (TypeError, ValueError):
                    return None

            for asset_id, run_context, canonical_params in fallback_rows:
                seed_value: int | None = None
                if isinstance(run_context, dict):
                    seed_value = _coerce_seed(run_context.get("roll_seed"))
                    if seed_value is None:
                        seed_value = _coerce_seed(run_context.get("rollSeed"))
                if seed_value is None and isinstance(canonical_params, dict):
                    seed_value = _coerce_seed(extract_flat_provider_params(canonical_params).get("seed"))
                if seed_value is not None:
                    seed_by_asset_id[int(asset_id)] = seed_value

        if not seed_by_asset_id:
            return

        # Query global counts only for seeds that are actually persisted in the
        # manifest. Legacy fallback-only seeds would force a full manifest scan
        # and still return 0, so keep those page-local for latency.
        seed_counts: Dict[int, int] = {}
        if manifest_seed_values:
            counts_q = (
                select(
                    GenerationBatchItemManifest.roll_seed,
                    func.count(GenerationBatchItemManifest.asset_id),
                )
                .join(Asset, Asset.id == GenerationBatchItemManifest.asset_id)
                .where(Asset.user_id == owner_user_id)
                .where(GenerationBatchItemManifest.roll_seed.in_(manifest_seed_values))
                .group_by(GenerationBatchItemManifest.roll_seed)
            )
            seed_counts = {
                int(seed): int(count)
                for seed, count in (await self.db.execute(counts_q)).all()
                if seed is not None
            }

        # Fast local fallback: for legacy assets (no manifest seed), avoid a
        # full-library JSON scan on every gallery page. Preserve lightweight
        # include-self semantics using only the current page cohort.
        local_seed_counts: Dict[int, int] = {}
        for seed in seed_by_asset_id.values():
            local_seed_counts[seed] = local_seed_counts.get(seed, 0) + 1

        for a in assets:
            seed_value = seed_by_asset_id.get(a.id)
            if seed_value is not None:
                result[a.id]["same_seed"] = max(
                    seed_counts.get(seed_value, 0),
                    local_seed_counts.get(seed_value, 1),
                )
