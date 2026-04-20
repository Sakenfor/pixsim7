"""Lineage query helpers for simplified asset_lineage table."""
from __future__ import annotations

from typing import List, Dict, Any, Iterable, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.domain.assets.lineage import AssetLineage
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.domain.assets.relation_types import SOURCE
from pixsim7.backend.main.domain.enums import OperationType
from pixsim7.backend.main.shared.schemas.entity_ref import EntityRef
from pixsim7.backend.main.shared.asset_refs import extract_asset_id
from pixsim7.backend.main.shared.composition import get_role_to_influence_mapping


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

    async def has_children_map(self, asset_ids: Iterable[int]) -> Dict[int, bool]:
        """Batch-check whether each asset is referenced as a parent in lineage.

        Reads exclusively from ``asset_lineage``.  Legacy rows that once held
        the link only via ``Asset.upload_context.source_asset_id`` have been
        backfilled into ``asset_lineage`` (migration 20260419_0002), so the
        old JSON-path fallback is gone — it was a full-table scan of
        ``upload_context`` and defeated the lineage indexes at scale.
        """
        ids = [int(i) for i in asset_ids if i is not None]
        if not ids:
            return {}

        result: Dict[int, bool] = {i: False for i in ids}

        lineage_q = (
            select(AssetLineage.parent_asset_id)
            .where(AssetLineage.parent_asset_id.in_(ids))
            .distinct()
        )
        for (parent_id,) in (await self.db.execute(lineage_q)).all():
            if parent_id in result:
                result[parent_id] = True

        return result


def _resolve_asset_id(asset_ref) -> Optional[int]:
    """Extract asset ID from various reference formats."""
    if isinstance(asset_ref, EntityRef):
        return asset_ref.id
    return extract_asset_id(asset_ref)


async def build_lineage_from_composition_metadata(
    db: AsyncSession,
    *,
    child_asset_id: int,
    composition_metadata: List[Dict[str, Any]],
    operation_type: OperationType = OperationType.IMAGE_EDIT,
    commit: bool = False,
) -> int:
    """
    Persist AssetLineage rows from trimmed composition metadata dicts.

    Works with the lightweight metadata format stored in
    `canonical_params.composition_metadata`.

    Args:
        db: Async session; rows are added and flushed (committed if requested).
        child_asset_id: The output asset ID
        composition_metadata: List of dicts with:
            - asset: "asset:123" or int
            - sequence_order: int
            - role, intent, influence_type, influence_region (optional)
        operation_type: Operation type (default IMAGE_EDIT)
        commit: When True, commits after flush. Default False so callers
            control transaction boundaries.

    Returns:
        Number of lineage rows written.
    """
    n_inputs = len(composition_metadata)
    if n_inputs == 0:
        return 0

    default_weight = 1.0 / n_inputs
    written = 0

    for entry in composition_metadata:
        parent_id = _resolve_asset_id(entry.get("asset"))
        if parent_id is None:
            continue

        influence_type = entry.get("influence_type")
        if not influence_type:
            role = entry.get("role")
            if role:
                influence_type = get_role_to_influence_mapping().get(role, "content")
            else:
                influence_type = "content"

        db.add(
            AssetLineage(
                child_asset_id=child_asset_id,
                parent_asset_id=parent_id,
                relation_type=SOURCE,
                operation_type=operation_type,
                sequence_order=entry.get("sequence_order", 0),
                influence_type=influence_type,
                influence_weight=default_weight,
                influence_region=entry.get("influence_region") or "full",
                prompt_ref_name=entry.get("ref_name"),
            )
        )
        written += 1

    if written:
        await db.flush()
        if commit:
            await db.commit()

    return written
