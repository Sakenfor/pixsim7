from __future__ import annotations

from typing import Any, Dict, List, Optional, Annotated

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from pixsim7_game_service.infrastructure.database.session import get_session
from pixsim7_game_service.domain.models import GameScene, GameSceneNode, GameSceneEdge
from pixsim7_game_service.infrastructure.content_client import fetch_asset
from pixsim7_backend.api.dependencies import get_current_user
from pixsim7_backend.domain import User


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
  id: str
  type: str
  label: Optional[str] = None
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
  db: Session = Depends(get_session),
  user: User = Depends(get_current_user),
  authorization: Annotated[str | None, Header()] = None,
) -> SceneResponse:
  scene = db.get(GameScene, scene_id)
  if not scene:
    raise HTTPException(status_code=404, detail="Scene not found")

  nodes = db.exec(
    select(GameSceneNode).where(GameSceneNode.scene_id == scene.id)
  ).all()
  edges = db.exec(
    select(GameSceneEdge).where(GameSceneEdge.scene_id == scene.id)
  ).all()

  node_models: List[SceneNode] = []

  # Fetch associated assets for each node to build media segments.
  for n in nodes:
    media_segments: List[MediaSegment] = []

    # Primary asset_id on the node (single clip)
    if n.asset_id:
      asset = await fetch_asset(n.asset_id, authorization_header=authorization)
      if asset:
        remote_url = asset.get("remote_url") or asset.get("download_url")
        if remote_url:
          media_segments.append(
            MediaSegment(
              id=str(asset.get("id", n.asset_id)),
              url=remote_url,
              durationSec=asset.get("duration_sec"),
              tags=asset.get("tags") or None,
            )
          )

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

        asset = await fetch_asset(seg_asset_id_int, authorization_header=authorization)
        if not asset:
          continue
        remote_url = asset.get("remote_url") or asset.get("download_url")
        if not remote_url:
          continue

        seg_id = seg.get("id") or asset.get("id") or seg_asset_id_int
        tags = seg.get("tags") or asset.get("tags") or None

        media_segments.append(
          MediaSegment(
            id=str(seg_id),
            url=remote_url,
            durationSec=asset.get("duration_sec"),
            tags=tags,
          )
        )

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
