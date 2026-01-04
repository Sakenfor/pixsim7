from typing import Optional, Dict, Any, Annotated, Union, Literal

from pydantic import BaseModel, Field, ConfigDict


class PlaySceneAction(BaseModel):
    type: Literal["play_scene"]
    scene_id: Optional[int] = None


class ChangeLocationAction(BaseModel):
    type: Literal["change_location"]
    target_location_id: Optional[int] = None


class NpcTalkAction(BaseModel):
    type: Literal["npc_talk"]
    npc_id: Optional[int] = None


HotspotAction = Annotated[
    Union[PlaySceneAction, ChangeLocationAction, NpcTalkAction],
    Field(discriminator="type"),
]


class HotspotTargetMesh(BaseModel):
    object_name: str = Field(description="Exact node/mesh name in glTF")


class HotspotTargetRect2d(BaseModel):
    x: float
    y: float
    w: float
    h: float


class HotspotTarget(BaseModel):
    model_config = ConfigDict(extra="allow")

    mesh: Optional[HotspotTargetMesh] = None
    rect2d: Optional[HotspotTargetRect2d] = None


class GameHotspotDTO(BaseModel):
    """A shared trigger/hotspot definition used by 2D and 3D runtimes."""

    model_config = ConfigDict(populate_by_name=True)

    id: Optional[int] = None
    scope: Optional[str] = None
    world_id: Optional[int] = None
    location_id: Optional[int] = None
    scene_id: Optional[int] = None
    hotspot_id: str
    target: Optional[HotspotTarget] = None
    action: Optional[HotspotAction] = None
    meta: Optional[Dict[str, Any]] = None
