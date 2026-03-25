from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import AliasChoices, BaseModel, Field
from sqlalchemy import delete, select

from pixsim7.backend.main.api.dependencies import (
    AssetSvc,
    CurrentGamePrincipal,
    DatabaseSession,
)
from pixsim7.backend.main.domain.game import GameScene, GameSceneEdge, GameSceneNode
from pixsim7.backend.main.infrastructure.events.bus import event_bus
from pixsim7.backend.main.services.game.derived_projections import sync_scene_graph_projection
from pixsim7.backend.main.services.game.events import SCENE_CREATED, SCENE_UPDATED
from pixsim7.backend.main.services.tag_service import TagService
from pixsim7.backend.main.shared.schemas.api_base import ApiModel


router = APIRouter()


class MediaSegment(BaseModel):
    id: str
    url: str
    durationSec: Optional[float] = None
    tags: Optional[List[str]] = None


class NodeHotspotRegionRect2d(BaseModel):
    x: float
    y: float
    w: float
    h: float


class NodeHotspotRegion(BaseModel):
    id: str
    label: Optional[str] = None
    rect2d: NodeHotspotRegionRect2d
    edge_id: str
    tooltip: Optional[str] = None


class SceneNode(BaseModel):
    """Scene node model for API responses."""

    id: str
    type: str
    label: Optional[str] = None
    assetId: Optional[int] = None
    mediaUrl: Optional[str] = None
    media: Optional[List[MediaSegment]] = None
    selection: Optional[Dict[str, Any]] = None
    playback: Optional[Dict[str, Any]] = None
    choices: Optional[List[Dict[str, Any]]] = None
    condition: Optional[Dict[str, Any]] = None
    trueTargetNodeId: Optional[str] = None
    falseTargetNodeId: Optional[str] = None
    targetSceneId: Optional[str] = None
    parameterBindings: Optional[Dict[str, Any]] = None
    returnRouting: Optional[Dict[str, Any]] = None
    returnPointId: Optional[str] = None
    returnValues: Optional[Dict[str, Any]] = None
    endType: Optional[str] = None
    endMessage: Optional[str] = None
    hotspot_regions: Optional[List[NodeHotspotRegion]] = None
    meta: Optional[Dict[str, Any]] = None


class SceneEdge(BaseModel):
    id: str
    from_: str = Field(..., alias="from")
    to: str
    label: Optional[str] = None
    conditions: Optional[Any] = None
    effects: Optional[Any] = None
    isDefault: Optional[bool] = None

    class Config:
        populate_by_name = True


class SceneResponse(BaseModel):
    id: str
    title: Optional[str] = None
    nodes: List[SceneNode]
    edges: List[SceneEdge]
    startNodeId: str


class SceneSummary(ApiModel):
    id: int
    world_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    entry_node_id: Optional[int] = None


class SceneNodeWrite(ApiModel):
    id: Optional[str] = None
    asset_id: int
    label: Optional[str] = None
    loopable: bool = False
    skippable: bool = False
    reveal_choices_at_sec: Optional[float] = None
    hotspot_regions: Optional[List[Dict[str, Any]]] = None
    meta: Optional[Dict[str, Any]] = None


class SceneEdgeWrite(ApiModel):
    id: Optional[str] = None
    from_node_id: str = Field(
        validation_alias=AliasChoices("from_node_id", "fromNodeId", "from"),
    )
    to_node_id: str = Field(
        validation_alias=AliasChoices("to_node_id", "toNodeId", "to"),
    )
    choice_label: str = ""
    weight: float = 1.0
    reveal_at_sec: Optional[float] = None
    cooldown_sec: Optional[int] = None
    conditions: Optional[Any] = None
    effects: Optional[Any] = None


class UpsertScenePayload(ApiModel):
    world_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    entry_node_id: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("entry_node_id", "entryNodeId", "startNodeId"),
    )
    meta: Optional[Dict[str, Any]] = None
    nodes: List[SceneNodeWrite] = Field(default_factory=list)
    edges: List[SceneEdgeWrite] = Field(default_factory=list)


def _parse_node_ref(ref: str, node_ids_by_ref: Dict[str, int]) -> int:
    token = str(ref or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Scene edge node refs cannot be empty")
    if token in node_ids_by_ref:
        return node_ids_by_ref[token]
    raise HTTPException(
        status_code=400,
        detail=f"Unknown scene node ref: {token}",
    )


async def _load_scene_or_404(
    db: DatabaseSession,
    scene_id: int,
    *,
    world_id: Optional[int] = None,
) -> GameScene:
    scene = await db.get(GameScene, scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    if world_id is not None and scene.world_id is not None and int(scene.world_id) != int(world_id):
        raise HTTPException(status_code=404, detail="Scene not found")
    return scene


async def _replace_scene_graph(
    db: DatabaseSession,
    scene: GameScene,
    payload: UpsertScenePayload,
) -> None:
    if not payload.nodes:
        raise HTTPException(status_code=400, detail="Scene must include at least one node")

    scene.entry_node_id = None
    db.add(scene)
    await db.flush()

    await db.execute(delete(GameSceneEdge).where(GameSceneEdge.scene_id == int(scene.id)))
    await db.execute(delete(GameSceneNode).where(GameSceneNode.scene_id == int(scene.id)))

    node_ids_by_ref: Dict[str, int] = {}
    ordered_node_ids: List[int] = []

    for index, node in enumerate(payload.nodes):
        db_node = GameSceneNode(
            scene_id=int(scene.id),
            asset_id=int(node.asset_id),
            label=node.label,
            loopable=bool(node.loopable),
            skippable=bool(node.skippable),
            reveal_choices_at_sec=node.reveal_choices_at_sec,
            hotspot_regions=node.hotspot_regions,
            meta=node.meta,
        )
        db.add(db_node)
        await db.flush()

        node_id = int(db_node.id)
        ordered_node_ids.append(node_id)

        auto_ref = f"n{index + 1}"
        node_ids_by_ref[auto_ref] = node_id
        node_ids_by_ref[str(node_id)] = node_id

        if node.id is not None:
            explicit_ref = str(node.id).strip()
            if not explicit_ref:
                raise HTTPException(status_code=400, detail="Scene node id refs cannot be blank")
            existing = node_ids_by_ref.get(explicit_ref)
            if existing is not None and existing != node_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Duplicate scene node ref: {explicit_ref}",
                )
            node_ids_by_ref[explicit_ref] = node_id

    for edge in payload.edges:
        from_node_id = _parse_node_ref(edge.from_node_id, node_ids_by_ref)
        to_node_id = _parse_node_ref(edge.to_node_id, node_ids_by_ref)
        db.add(
            GameSceneEdge(
                scene_id=int(scene.id),
                from_node_id=from_node_id,
                to_node_id=to_node_id,
                choice_label=str(edge.choice_label or ""),
                weight=float(edge.weight),
                reveal_at_sec=edge.reveal_at_sec,
                cooldown_sec=edge.cooldown_sec,
                conditions=edge.conditions,
                effects=edge.effects,
            )
        )

    if payload.entry_node_id is not None:
        scene.entry_node_id = _parse_node_ref(payload.entry_node_id, node_ids_by_ref)
    else:
        scene.entry_node_id = ordered_node_ids[0]
    db.add(scene)


async def _build_scene_response(
    scene: GameScene,
    db: DatabaseSession,
    asset_service: AssetSvc,
    user: CurrentGamePrincipal,
) -> SceneResponse:
    tag_service = TagService(db)

    nodes_result = await db.execute(
        select(GameSceneNode)
        .where(GameSceneNode.scene_id == scene.id)
        .order_by(GameSceneNode.id)
    )
    nodes = nodes_result.scalars().all()

    edges_result = await db.execute(
        select(GameSceneEdge)
        .where(GameSceneEdge.scene_id == scene.id)
        .order_by(GameSceneEdge.id)
    )
    edges = edges_result.scalars().all()

    node_models: List[SceneNode] = []

    for n in nodes:
        media_segments: List[MediaSegment] = []

        if n.asset_id:
            try:
                asset = await asset_service.get_asset_for_user(n.asset_id, user)
                remote_url = asset.remote_url or asset.download_url
                tag_slugs = [t.slug for t in await tag_service.get_asset_tags(asset.id)]
                if remote_url:
                    media_segments.append(
                        MediaSegment(
                            id=str(asset.id),
                            url=remote_url,
                            durationSec=asset.duration_sec,
                            tags=tag_slugs or None,
                        )
                    )
            except Exception:
                pass

        meta = n.meta or {}
        segments_meta = meta.get("segments") if isinstance(meta, dict) else None
        if isinstance(segments_meta, list):
            for seg in segments_meta:
                if not isinstance(seg, dict):
                    continue
                seg_asset_id = seg.get("asset_id") or seg.get("assetId")
                if not seg_asset_id:
                    continue
                try:
                    seg_asset_id_int = int(seg_asset_id)
                except (TypeError, ValueError):
                    continue

                try:
                    asset = await asset_service.get_asset_for_user(seg_asset_id_int, user)
                    remote_url = asset.remote_url or asset.download_url
                    tag_slugs = [t.slug for t in await tag_service.get_asset_tags(asset.id)]
                    if not remote_url:
                        continue

                    seg_id = seg.get("id") or asset.id or seg_asset_id_int
                    tags = seg.get("tags") or tag_slugs or None
                    media_segments.append(
                        MediaSegment(
                            id=str(seg_id),
                            url=remote_url,
                            durationSec=asset.duration_sec,
                            tags=tags,
                        )
                    )
                except Exception:
                    continue

        media_url: Optional[str] = media_segments[0].url if media_segments else None
        node_models.append(
            SceneNode(
                id=str(n.id),
                type="video",
                label=n.label,
                assetId=int(n.asset_id) if n.asset_id is not None else None,
                mediaUrl=media_url,
                media=media_segments or None,
                selection=None,
                playback=None,
                hotspot_regions=n.hotspot_regions or None,
                meta=n.meta,
            )
        )

    edge_models: List[SceneEdge] = []
    for e in edges:
        edge_models.append(
            SceneEdge(
                id=str(e.id),
                from_=str(e.from_node_id),
                to=str(e.to_node_id),
                label=e.choice_label,
                conditions=e.conditions or None,
                effects=e.effects or None,
            )
        )

    if not scene.entry_node_id:
        raise HTTPException(status_code=400, detail="Scene has no entry node")

    return SceneResponse(
        id=str(scene.id),
        title=scene.title,
        nodes=node_models,
        edges=edge_models,
        startNodeId=str(scene.entry_node_id),
    )


@router.get("/", response_model=List[SceneSummary])
async def list_scenes(
    db: DatabaseSession,
    user: CurrentGamePrincipal,
    world_id: Optional[int] = None,
) -> List[SceneSummary]:
    stmt = select(GameScene).order_by(GameScene.id)
    if world_id is not None:
        stmt = stmt.where(GameScene.world_id == world_id)
    rows = await db.execute(stmt)
    scenes = list(rows.scalars().all())
    return [
        SceneSummary(
            id=int(scene.id),
            world_id=scene.world_id,
            title=str(scene.title),
            description=scene.description,
            entry_node_id=scene.entry_node_id,
        )
        for scene in scenes
    ]


@router.post("/", response_model=SceneResponse, status_code=201)
async def create_scene(
    payload: UpsertScenePayload,
    db: DatabaseSession,
    asset_service: AssetSvc,
    user: CurrentGamePrincipal,
    world_id: Optional[int] = None,
) -> SceneResponse:
    effective_world_id = world_id if world_id is not None else payload.world_id

    scene = GameScene(
        world_id=effective_world_id,
        title=payload.title,
        description=payload.description,
        meta=payload.meta,
    )
    db.add(scene)
    await db.flush()

    await _replace_scene_graph(db, scene, payload)
    await db.commit()

    scene = await _load_scene_or_404(db, int(scene.id))
    await sync_scene_graph_projection(db, int(scene.id))
    scene = await _load_scene_or_404(db, int(scene.id))
    await event_bus.publish(SCENE_CREATED, {"scene_id": int(scene.id), "world_id": scene.world_id})
    return await _build_scene_response(scene, db, asset_service, user)


@router.put("/{scene_id}", response_model=SceneResponse)
async def replace_scene(
    scene_id: int,
    payload: UpsertScenePayload,
    db: DatabaseSession,
    asset_service: AssetSvc,
    user: CurrentGamePrincipal,
    world_id: Optional[int] = None,
) -> SceneResponse:
    scene = await _load_scene_or_404(db, scene_id, world_id=world_id)

    effective_world_id = world_id if world_id is not None else payload.world_id
    scene.title = payload.title
    scene.description = payload.description
    scene.meta = payload.meta
    if effective_world_id is not None:
        scene.world_id = int(effective_world_id)
    db.add(scene)

    await _replace_scene_graph(db, scene, payload)
    await db.commit()

    scene = await _load_scene_or_404(db, scene_id)
    await sync_scene_graph_projection(db, int(scene.id))
    scene = await _load_scene_or_404(db, scene_id)
    await event_bus.publish(SCENE_UPDATED, {"scene_id": int(scene.id), "world_id": scene.world_id})
    return await _build_scene_response(scene, db, asset_service, user)


@router.get("/{scene_id}", response_model=SceneResponse)
async def get_scene(
    scene_id: int,
    db: DatabaseSession,
    asset_service: AssetSvc,
    user: CurrentGamePrincipal,
) -> SceneResponse:
    """Get a game scene by ID with all its nodes and edges."""
    scene = await _load_scene_or_404(db, scene_id)
    return await _build_scene_response(scene, db, asset_service, user)
