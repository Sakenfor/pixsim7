from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from pixsim7.backend.main.api.dependencies import CurrentUser, AssetSvc, DatabaseSession
from pixsim7.backend.main.domain.game import GameScene, GameSceneNode, GameSceneEdge
from pixsim7.backend.main.services.tag_service import TagService


router = APIRouter()


class SceneEdgeCondition(BaseModel):
    key: str
    op: Optional[str] = None
    value: Any


class SceneEdgeEffect(BaseModel):
    key: str
    op: Optional[str] = None
    value: Optional[Any] = None


class MediaSegment(BaseModel):
    id: str
    url: str
    durationSec: Optional[float] = None
    tags: Optional[List[str]] = None


class SceneNode(BaseModel):
    """Scene node model for API responses.

    Node configurations are stored in the `meta` field using standardized naming:
    - meta.choiceConfig: Choice node configuration (choices array)
    - meta.conditionConfig: Condition node configuration (conditions array, logicMode)
    - meta.endConfig: End node configuration (endType, message)
    - meta.videoConfig: Video node configuration (selectionKind, progressionSteps, etc.)
    - meta.miniGameConfig: Mini-game configuration (gameType, rounds, difficulty, timeLimit)
    - meta.seductionConfig: Seduction node configuration (stages, affinityCheckFlag, allowRetry)
    - meta.generationConfig: Generation node configuration (generationType, purpose, strategy)

    Additional metadata fields:
    - meta.lifeSim: Life simulation metadata (advanceMinutes)
    - meta.npcId: Hard NPC binding (camelCase, not snake_case)
    - meta.speakerRole: Role-based NPC binding
    - meta.npcState: NPC expression state

    Legacy note: Some fields (choices, condition, endType, endMessage) may exist at root level
    for backward compatibility, but new code should use the standardized meta.<type>Config pattern.
    """
    id: str
    type: str
    label: Optional[str] = None
    mediaUrl: Optional[str] = None
    media: Optional[List[MediaSegment]] = None
    selection: Optional[Dict[str, Any]] = None
    playback: Optional[Dict[str, Any]] = None
    choices: Optional[List[Dict[str, Any]]] = None  # Legacy - use meta.choiceConfig instead
    condition: Optional[Dict[str, Any]] = None  # Legacy - use meta.conditionConfig instead
    trueTargetNodeId: Optional[str] = None
    falseTargetNodeId: Optional[str] = None
    targetSceneId: Optional[str] = None
    parameterBindings: Optional[Dict[str, Any]] = None
    returnRouting: Optional[Dict[str, Any]] = None
    returnPointId: Optional[str] = None
    returnValues: Optional[Dict[str, Any]] = None
    endType: Optional[str] = None  # Legacy - use meta.endConfig instead
    endMessage: Optional[str] = None  # Legacy - use meta.endConfig instead
    meta: Optional[Dict[str, Any]] = None


class SceneEdge(BaseModel):
    id: str
    from_: str = Field(..., alias="from")
    to: str
    label: Optional[str] = None
    conditions: Optional[List[SceneEdgeCondition]] = None
    effects: Optional[List[SceneEdgeEffect]] = None
    isDefault: Optional[bool] = None

    class Config:
        populate_by_name = True


class SceneResponse(BaseModel):
    id: str
    title: Optional[str] = None
    nodes: List[SceneNode]
    edges: List[SceneEdge]
    startNodeId: str


@router.get("/{scene_id}", response_model=SceneResponse)
async def get_scene(
    scene_id: int,
    db: DatabaseSession,
    asset_service: AssetSvc,
    user: CurrentUser,
) -> SceneResponse:
    """Get a game scene by ID with all its nodes and edges.

    This endpoint describes how different assets (videos, images, 3D scenes, etc.)
    are connected in a narrative flow. It does not assume any particular
    visualization: the same scene graph can drive 2D or 3D presentations.
    """
    scene = await db.get(GameScene, scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    tag_service = TagService(db)

    # Fetch nodes and edges
    nodes_result = await db.execute(
        select(GameSceneNode).where(GameSceneNode.scene_id == scene.id)
    )
    nodes = nodes_result.scalars().all()

    edges_result = await db.execute(
        select(GameSceneEdge).where(GameSceneEdge.scene_id == scene.id)
    )
    edges = edges_result.scalars().all()

    node_models: List[SceneNode] = []

    # Fetch associated assets for each node to build media segments.
    for n in nodes:
        media_segments: List[MediaSegment] = []

        # Primary asset_id on the node (single clip)
        if n.asset_id:
            try:
                asset = await asset_service.get_asset_for_user(n.asset_id, user)
                # Use remote_url or download_url
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
                # If asset not found or not accessible, skip it
                pass

        # Optional meta.segments: multiple clips chained/pooled within this node
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
                    # If asset not found or not accessible, skip it
                    continue

        media_url: Optional[str] = media_segments[0].url if media_segments else None

        node_models.append(
            SceneNode(
                id=str(n.id),
                type="video",
                label=n.label,
                mediaUrl=media_url,
                media=media_segments or None,
                selection=None,
                playback=None,
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
