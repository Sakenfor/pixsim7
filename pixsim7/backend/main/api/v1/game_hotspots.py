from typing import Optional, Dict, Any, Annotated, Union, Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field, ConfigDict, field_validator

from pixsim7.backend.main.domain.game.core.actions import game_action_registry


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


def validate_action(action: Union[Dict[str, Any], BaseModel, None]) -> None:
    """Validate action using registry. Raises ValueError if invalid."""
    if action is None:
        return
    action_dict = action.model_dump() if isinstance(action, BaseModel) else action
    game_action_registry.validate_action(action_dict)


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

    @model_validator(mode="after")
    def require_target(self) -> "HotspotTarget":
        has_extra = bool(getattr(self, "__pydantic_extra__", None))
        if self.mesh is None and self.rect2d is None and not has_extra:
            raise ValueError("At least one target field is required")
        return self


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


def validate_scope_binding(payload: Dict[str, Any]) -> None:
    scope = payload.get("scope")
    if scope == "location" and payload.get("location_id") is None:
        raise HTTPException(status_code=400, detail="location_id is required for location scope")
    if scope == "world" and payload.get("world_id") is None:
        raise HTTPException(status_code=400, detail="world_id is required for world scope")
    if scope == "scene" and payload.get("scene_id") is None:
        raise HTTPException(status_code=400, detail="scene_id is required for scene scope")


def to_hotspot_dto(h: Any) -> GameHotspotDTO:
    return GameHotspotDTO.model_construct(
        id=h.id,
        scope=h.scope,
        world_id=h.world_id,
        location_id=h.location_id,
        scene_id=h.scene_id,
        hotspot_id=h.hotspot_id,
        target=h.target,
        action=h.action,
        meta=h.meta,
    )
