from __future__ import annotations

import logging
from typing import Any, Dict, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.game import (
    GameHotspot,
    GameLocation,
    GameNPC,
    GameScene,
    GameSceneEdge,
    GameSceneNode,
    NpcExpression,
)

logger = logging.getLogger(__name__)


def _as_dict(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _upsert_projection_blob(container: Dict[str, Any], key: str, value: Dict[str, Any]) -> bool:
    projections = _as_dict(container.get("_projections"))
    previous = projections.get(key)
    if previous == value:
        return False
    projections[key] = value
    container["_projections"] = projections
    return True


async def sync_npc_expression_projection(db: AsyncSession, npc_id: int) -> None:
    npc = await db.get(GameNPC, int(npc_id))
    if npc is None:
        return

    result = await db.execute(
        select(NpcExpression)
        .where(NpcExpression.npc_id == int(npc_id))
        .order_by(NpcExpression.state, NpcExpression.id)
    )
    expressions = list(result.scalars().all())

    states = sorted({str(expr.state) for expr in expressions if isinstance(expr.state, str) and expr.state})
    surface_types = sorted(
        {
            str(meta.get("surfaceType"))
            for expr in expressions
            for meta in [_as_dict(expr.meta)]
            if isinstance(meta.get("surfaceType"), str) and meta.get("surfaceType")
        }
    )

    projection = {
        "expression_count": len(expressions),
        "states": states,
        "surface_types": surface_types,
        "has_portrait_surface": "portrait" in surface_types,
    }

    personality = _as_dict(getattr(npc, "personality", {}))
    changed = _upsert_projection_blob(personality, "npc_expressions", projection)
    if not changed:
        return

    npc.personality = personality
    db.add(npc)
    await db.commit()
    logger.debug("Synced expression projection for npc_id=%s", npc_id)


async def sync_location_hotspot_projection(db: AsyncSession, location_id: int) -> None:
    location = await db.get(GameLocation, int(location_id))
    if location is None:
        return

    result = await db.execute(
        select(GameHotspot)
        .where(GameHotspot.location_id == int(location_id))
        .order_by(GameHotspot.hotspot_id, GameHotspot.id)
    )
    hotspots = list(result.scalars().all())

    hotspot_ids = sorted(
        {
            str(hotspot.hotspot_id)
            for hotspot in hotspots
            if isinstance(hotspot.hotspot_id, str) and hotspot.hotspot_id
        }
    )
    scene_refs = sorted(
        {
            int(hotspot.scene_id)
            for hotspot in hotspots
            if isinstance(hotspot.scene_id, int)
        }
    )

    projection = {
        "hotspot_count": len(hotspots),
        "hotspot_ids": hotspot_ids,
        "scene_refs": scene_refs,
    }

    meta = _as_dict(getattr(location, "meta", {}))
    changed = _upsert_projection_blob(meta, "location_hotspots", projection)
    if not changed:
        return

    location.meta = meta
    db.add(location)
    await db.commit()
    logger.debug("Synced hotspot projection for location_id=%s", location_id)


async def sync_scene_graph_projection(db: AsyncSession, scene_id: int) -> None:
    scene = await db.get(GameScene, int(scene_id))
    if scene is None:
        return

    nodes_result = await db.execute(
        select(GameSceneNode)
        .where(GameSceneNode.scene_id == int(scene_id))
        .order_by(GameSceneNode.id)
    )
    nodes = list(nodes_result.scalars().all())
    node_ids: List[int] = [int(node.id) for node in nodes if isinstance(node.id, int)]
    node_id_set = set(node_ids)

    edges_result = await db.execute(
        select(GameSceneEdge)
        .where(GameSceneEdge.scene_id == int(scene_id))
        .order_by(GameSceneEdge.id)
    )
    edges = list(edges_result.scalars().all())

    dangling_edges = 0
    for edge in edges:
        if int(edge.from_node_id) not in node_id_set or int(edge.to_node_id) not in node_id_set:
            dangling_edges += 1

    current_entry = int(scene.entry_node_id) if isinstance(scene.entry_node_id, int) else None
    resolved_entry = current_entry if current_entry in node_id_set else (node_ids[0] if node_ids else None)

    projection = {
        "node_count": len(nodes),
        "edge_count": len(edges),
        "entry_node_id": resolved_entry,
        "dangling_edge_count": dangling_edges,
    }

    meta = _as_dict(getattr(scene, "meta", {}))
    projection_changed = _upsert_projection_blob(meta, "scene_graph", projection)

    entry_changed = scene.entry_node_id != resolved_entry
    if not projection_changed and not entry_changed:
        return

    scene.meta = meta
    if entry_changed:
        scene.entry_node_id = resolved_entry

    db.add(scene)
    await db.commit()
    logger.debug("Synced scene graph projection for scene_id=%s", scene_id)
