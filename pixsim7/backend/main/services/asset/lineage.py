"""Lineage query helpers for simplified asset_lineage table."""
from __future__ import annotations

from typing import List, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.domain.assets.lineage import AssetLineage
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.domain.enums import OperationType
from pixsim7.backend.main.shared.schemas.entity_ref import EntityRef
from pixsim7.backend.main.shared.schemas.image_edit_schemas import (
    MultiImageEditPrompt,
    InputBinding,
    InfluenceEdge,
)
from pixsim7.backend.main.shared.schemas.composition_schemas import CompositionAsset


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

    async def get_influence_breakdown(self, child_asset_id: int) -> List[AssetLineage]:
        """Get all parent lineage links with influence data for a child asset."""
        q = (
            select(AssetLineage)
            .where(AssetLineage.child_asset_id == child_asset_id)
            .where(AssetLineage.influence_type.isnot(None))
            .order_by(AssetLineage.sequence_order.asc())
        )
        res = await self.db.execute(q)
        return list(res.scalars().all())


def _resolve_asset_id(asset_ref) -> Optional[int]:
    """Extract asset ID from various reference formats."""
    if asset_ref is None:
        return None
    if isinstance(asset_ref, int):
        return asset_ref
    if isinstance(asset_ref, EntityRef):
        return asset_ref.id
    if hasattr(asset_ref, "id"):
        return asset_ref.id
    return None


def build_lineage_from_edit_prompt(
    child_asset_id: int,
    prompt: MultiImageEditPrompt,
    operation_type: OperationType = OperationType.IMAGE_EDIT,
) -> List[AssetLineage]:
    """
    Build AssetLineage rows from a MultiImageEditPrompt.

    Uses influence_edges if provided, otherwise derives from input_bindings
    with default 1/N weights.

    Args:
        child_asset_id: The output asset ID
        prompt: The multi-image edit prompt configuration
        operation_type: Operation type (default IMAGE_EDIT)

    Returns:
        List of AssetLineage objects (not yet persisted)
    """
    lineage_rows: List[AssetLineage] = []
    binding_map = {b.ref_name: b for b in prompt.input_bindings}
    n_inputs = len(prompt.input_bindings)

    if prompt.influence_edges:
        # Use explicit influence edges
        for seq_order, edge in enumerate(prompt.influence_edges):
            binding = binding_map.get(edge.parent_ref)
            if not binding:
                continue

            parent_id = _resolve_asset_id(binding.asset)
            if parent_id is None:
                continue

            lineage_rows.append(
                AssetLineage(
                    child_asset_id=child_asset_id,
                    parent_asset_id=parent_id,
                    relation_type="source",
                    operation_type=operation_type,
                    sequence_order=seq_order,
                    influence_type=edge.influence_type,
                    influence_weight=edge.influence_weight,
                    influence_region=edge.influence_region,
                    prompt_ref_name=edge.parent_ref,
                )
            )
    else:
        # Derive from input bindings with equal weights
        default_weight = 1.0 / n_inputs if n_inputs > 0 else 1.0

        for seq_order, binding in enumerate(prompt.input_bindings):
            parent_id = _resolve_asset_id(binding.asset)
            if parent_id is None:
                continue

            # Use binding hints or defaults
            influence_type = binding.influence_type or "content"
            influence_region = binding.influence_region or "full"

            # Base image gets structure influence, others get content
            if prompt.base_image_ref and binding.ref_name == prompt.base_image_ref:
                influence_type = binding.influence_type or "structure"
            elif prompt.output_style_ref and binding.ref_name == prompt.output_style_ref:
                influence_type = binding.influence_type or "style"

            lineage_rows.append(
                AssetLineage(
                    child_asset_id=child_asset_id,
                    parent_asset_id=parent_id,
                    relation_type="source",
                    operation_type=operation_type,
                    sequence_order=seq_order,
                    influence_type=influence_type,
                    influence_weight=default_weight,
                    influence_region=influence_region,
                    prompt_ref_name=binding.ref_name,
                )
            )

    return lineage_rows


def build_lineage_from_composition_assets(
    child_asset_id: int,
    composition_assets: List[CompositionAsset],
    operation_type: OperationType = OperationType.IMAGE_EDIT,
) -> List[AssetLineage]:
    """
    Build AssetLineage rows from CompositionAsset list.

    Uses ref_name and influence hints from each CompositionAsset.

    Args:
        child_asset_id: The output asset ID
        composition_assets: List of composition assets
        operation_type: Operation type (default IMAGE_EDIT)

    Returns:
        List of AssetLineage objects (not yet persisted)
    """
    lineage_rows: List[AssetLineage] = []
    n_inputs = len(composition_assets)
    default_weight = 1.0 / n_inputs if n_inputs > 0 else 1.0

    for seq_order, comp_asset in enumerate(composition_assets):
        parent_id = _resolve_asset_id(comp_asset.asset)
        if parent_id is None:
            continue

        # Map role to default influence type if not specified
        influence_type = comp_asset.influence_type
        if not influence_type and comp_asset.role:
            role_to_influence: Dict[str, str] = {
                "main_character": "content",
                "companion": "content",
                "environment": "content",
                "prop": "content",
                "style_reference": "style",
                "effect": "blend",
            }
            influence_type = role_to_influence.get(comp_asset.role, "content")

        lineage_rows.append(
            AssetLineage(
                child_asset_id=child_asset_id,
                parent_asset_id=parent_id,
                relation_type="source",
                operation_type=operation_type,
                sequence_order=seq_order,
                influence_type=influence_type or "content",
                influence_weight=default_weight,
                influence_region=comp_asset.influence_region or "full",
                prompt_ref_name=comp_asset.ref_name,
            )
        )

    return lineage_rows
