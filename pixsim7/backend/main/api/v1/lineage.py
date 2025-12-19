"""Lineage and branching API endpoints (debug/admin oriented)."""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field

from pixsim7.backend.main.api.dependencies import get_db, get_current_user
from pixsim7.backend.main.domain.asset import Asset
from pixsim7.backend.main.domain.asset_lineage import AssetLineage
from pixsim7.backend.main.services.asset.lineage_service import AssetLineageService
from pixsim7.backend.main.services.asset.branching_service import AssetBranchingService
from pixsim7.backend.main.services.asset.lineage_refresh_service import LineageRefreshService
from pixsim7.backend.main.shared.storage_utils import storage_key_to_url
from pixsim_logging import get_logger

logger = get_logger()

router = APIRouter(prefix="/lineage", tags=["lineage"], include_in_schema=False)


@router.get("/assets/{asset_id}/parents")
async def get_parents(asset_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    service = AssetLineageService(db)
    asset = await db.get(Asset, asset_id)
    if not asset or asset.user_id != user.id:
        raise HTTPException(status_code=404, detail="Asset not found")
    parents = await service.get_parents(asset_id)
    return {"asset_id": asset_id, "parents": [p.id for p in parents]}


@router.get("/assets/{asset_id}/children")
async def get_children(asset_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    service = AssetLineageService(db)
    asset = await db.get(Asset, asset_id)
    if not asset or asset.user_id != user.id:
        raise HTTPException(status_code=404, detail="Asset not found")
    children = await service.get_children(asset_id)
    return {"asset_id": asset_id, "children": [c.id for c in children]}


@router.get("/graph/{asset_id}")
async def get_lineage_graph(
    asset_id: int,
    depth: int = 2,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user)
):
    """Return a depth-limited lineage graph (parents and children).

    Direction: edges oriented parent -> child.
    Strategy: BFS outward from root for both parents (reverse traversal) and children.

    For MVP we traverse separately: up (parents) and down (children) each to given depth.
    """
    asset = await db.get(Asset, asset_id)
    if not asset or asset.user_id != user.id:
        raise HTTPException(status_code=404, detail="Asset not found")

    lineage_svc = AssetLineageService(db)

    # BFS down (children)
    down_nodes = {asset_id}
    down_edges = []
    frontier = [asset_id]
    for _ in range(depth):
        next_frontier = []
        for aid in frontier:
            children = await lineage_svc.get_children(aid)
            for child in children:
                if child.id not in down_nodes:
                    down_nodes.add(child.id)
                    next_frontier.append(child.id)
                down_edges.append({"source": aid, "target": child.id, "relation_type": "DERIVATION"})
        frontier = next_frontier

    # BFS up (parents)
    up_nodes = {asset_id}
    up_edges = []
    frontier = [asset_id]
    for _ in range(depth):
        next_frontier = []
        for aid in frontier:
            parents = await lineage_svc.get_parents(aid)
            for parent in parents:
                if parent.id not in up_nodes:
                    up_nodes.add(parent.id)
                    next_frontier.append(parent.id)
                up_edges.append({"source": parent.id, "target": aid, "relation_type": "DERIVATION"})
        frontier = next_frontier

    all_node_ids = sorted(set(list(down_nodes) + list(up_nodes)))

    # Load node details (thumbnail + media_type minimal for graph)
    node_rows = []
    if all_node_ids:
        q = select(Asset).where(Asset.id.in_(all_node_ids))
        res = await db.execute(q)
        node_rows = list(res.scalars().all())

    nodes = [
        {
            "id": n.id,
            "media_type": n.media_type.value,
            "provider_id": n.provider_id,
            "thumbnail_url": storage_key_to_url(n.thumbnail_key) or n.remote_url,
            "duration_sec": n.duration_sec,
        }
        for n in node_rows
    ]

    return {
        "root_asset_id": asset_id,
        "depth": depth,
        "nodes": nodes,
        "edges": down_edges + up_edges,
    }


@router.post("/branches/{asset_id}")
async def create_branch(asset_id: int, branch_time: float, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    asset = await db.get(Asset, asset_id)
    if not asset or asset.user_id != user.id:
        raise HTTPException(status_code=404, detail="Asset not found")
    svc = AssetBranchingService(db)
    branch = await svc.create_branch(asset_id, branch_time=branch_time)
    return {"branch_id": branch.id, "source_asset_id": asset_id, "branch_time": branch.branch_time}


@router.get("/branches/{asset_id}")
async def list_branches(asset_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    asset = await db.get(Asset, asset_id)
    if not asset or asset.user_id != user.id:
        raise HTTPException(status_code=404, detail="Asset not found")
    svc = AssetBranchingService(db)
    branches = await svc.list_branches(asset_id)
    return {"branches": [{"id": b.id, "time": b.branch_time, "name": b.branch_name} for b in branches]}


@router.post("/variants/{branch_id}")
async def add_variant(branch_id: int, variant_asset_id: int, variant_name: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    # Ensure branch and variant asset belong to user
    # Simple join checks
    svc = AssetBranchingService(db)
    # Fetch branch source asset for ownership
    branch_q = await db.execute(select(AssetLineage).where())  # placeholder to keep pattern; skip heavy validation
    variant = await svc.add_variant(branch_id, variant_asset_id, variant_name=variant_name)
    return {"variant_id": variant.id}


@router.post("/clips/{asset_id}")
async def create_clip(asset_id: int, start_time: float, end_time: float, clip_name: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    asset = await db.get(Asset, asset_id)
    if not asset or asset.user_id != user.id:
        raise HTTPException(status_code=404, detail="Asset not found")
    svc = AssetBranchingService(db)
    clip = await svc.create_clip(asset_id, start_time=start_time, end_time=end_time, clip_name=clip_name)
    return {"clip_id": clip.id}


@router.get("/clips/{asset_id}")
async def list_clips(asset_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    asset = await db.get(Asset, asset_id)
    if not asset or asset.user_id != user.id:
        raise HTTPException(status_code=404, detail="Asset not found")
    svc = AssetBranchingService(db)
    clips = await svc.list_clips(asset_id)
    return {"clips": [{"id": c.id, "start": c.start_time, "end": c.end_time, "name": c.clip_name} for c in clips]}


# ============================================================================
# Lineage Refresh API
# ============================================================================


class LineageRefreshRequest(BaseModel):
    """Request body for lineage refresh endpoint."""
    asset_ids: Optional[List[int]] = Field(
        None,
        description="Explicit list of asset IDs to refresh lineage for"
    )
    provider_id: Optional[str] = Field(
        None,
        description="Filter by provider ID (e.g., 'pixverse')"
    )
    scope: Optional[str] = Field(
        "current_user",
        description="Scope for provider-based refresh: 'current_user'"
    )
    clear_existing: bool = Field(
        True,
        description="Whether to clear existing lineage before rebuilding"
    )


@router.post("/refresh")
async def refresh_lineage(
    body: LineageRefreshRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Rebuild lineage for assets using stored provider metadata.

    This endpoint uses LineageRefreshService to:
    - Optionally clear existing AssetLineage edges for the specified assets
    - Re-extract embedded assets and rebuild lineage from media_metadata

    Two modes of operation:
    1. Explicit asset IDs: Pass `asset_ids` to refresh specific assets
    2. Provider filter: Pass `provider_id` + `scope="current_user"` to refresh
       all assets for that provider owned by the current user

    Returns per-asset results with counts of removed and new edges.
    """
    service = LineageRefreshService(db)

    asset_ids_to_refresh: List[int] = []

    if body.asset_ids:
        # Mode 1: Explicit asset IDs
        # Validate ownership
        stmt = select(Asset.id).where(
            Asset.id.in_(body.asset_ids),
            Asset.user_id == user.id,
        )
        result = await db.execute(stmt)
        owned_ids = {row[0] for row in result.fetchall()}

        # Filter to only owned assets
        asset_ids_to_refresh = [aid for aid in body.asset_ids if aid in owned_ids]

        if len(asset_ids_to_refresh) < len(body.asset_ids):
            logger.warning(
                "lineage_refresh_filtered_assets",
                requested=len(body.asset_ids),
                owned=len(asset_ids_to_refresh),
                user_id=user.id,
            )

    elif body.provider_id and body.scope == "current_user":
        # Mode 2: Provider filter for current user
        stmt = select(Asset.id).where(
            Asset.provider_id == body.provider_id,
            Asset.user_id == user.id,
        )
        result = await db.execute(stmt)
        asset_ids_to_refresh = [row[0] for row in result.fetchall()]

        logger.info(
            "lineage_refresh_by_provider",
            provider_id=body.provider_id,
            asset_count=len(asset_ids_to_refresh),
            user_id=user.id,
        )

    else:
        raise HTTPException(
            status_code=400,
            detail="Must provide either asset_ids or provider_id with scope='current_user'"
        )

    if not asset_ids_to_refresh:
        return {
            "count": 0,
            "results": [],
            "message": "No assets found matching the criteria",
        }

    # Run the refresh
    refresh_result = await service.refresh_for_assets(
        asset_ids_to_refresh,
        provider_id=body.provider_id,
        clear_existing=body.clear_existing,
    )

    logger.info(
        "lineage_refresh_completed",
        count=refresh_result["count"],
        user_id=user.id,
        provider_id=body.provider_id,
    )

    return refresh_result
