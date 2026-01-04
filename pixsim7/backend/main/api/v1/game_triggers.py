from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, ConfigDict

from pixsim7.backend.main.api.dependencies import CurrentUser, GameTriggerSvc
from pixsim7.backend.main.api.v1.game_hotspots import (
    GameHotspotDTO,
    HotspotAction,
    HotspotTarget,
    to_hotspot_dto,
    validate_scope_binding,
    validate_action,
)


router = APIRouter()


class GameTriggerCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    scope: str = Field(description="Trigger scope (location, world, scene, etc.)")
    hotspot_id: str
    world_id: Optional[int] = None
    location_id: Optional[int] = None
    scene_id: Optional[int] = None
    target: Optional[HotspotTarget] = None
    action: Optional[HotspotAction] = None
    meta: Optional[Dict[str, Any]] = None


class GameTriggerUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    scope: Optional[str] = None
    hotspot_id: Optional[str] = None
    world_id: Optional[int] = None
    location_id: Optional[int] = None
    scene_id: Optional[int] = None
    target: Optional[HotspotTarget] = None
    action: Optional[HotspotAction] = None
    meta: Optional[Dict[str, Any]] = None


@router.get("/", response_model=List[GameHotspotDTO])
async def list_triggers(
    game_trigger_service: GameTriggerSvc,
    user: CurrentUser,
    scope: Optional[str] = None,
    world_id: Optional[int] = None,
    location_id: Optional[int] = None,
    scene_id: Optional[int] = None,
) -> List[GameHotspotDTO]:
    triggers = await game_trigger_service.list_triggers(
        scope=scope,
        world_id=world_id,
        location_id=location_id,
        scene_id=scene_id,
    )
    return [to_hotspot_dto(t) for t in triggers]


@router.get("/{trigger_id}", response_model=GameHotspotDTO)
async def get_trigger(
    trigger_id: int,
    game_trigger_service: GameTriggerSvc,
    user: CurrentUser,
) -> GameHotspotDTO:
    trigger = await game_trigger_service.get_trigger(trigger_id)
    if not trigger:
        raise HTTPException(status_code=404, detail="Trigger not found")
    return to_hotspot_dto(trigger)


@router.post("/", response_model=GameHotspotDTO)
async def create_trigger(
    payload: GameTriggerCreate,
    game_trigger_service: GameTriggerSvc,
    user: CurrentUser,
) -> GameHotspotDTO:
    payload_dict = payload.model_dump(exclude_none=True)
    validate_scope_binding(payload_dict)
    validate_action(payload.action)
    trigger = await game_trigger_service.create_trigger(payload_dict)
    return to_hotspot_dto(trigger)


@router.patch("/{trigger_id}", response_model=GameHotspotDTO)
async def update_trigger(
    trigger_id: int,
    payload: GameTriggerUpdate,
    game_trigger_service: GameTriggerSvc,
    user: CurrentUser,
) -> GameHotspotDTO:
    payload_dict = payload.model_dump(exclude_none=True)
    existing = await game_trigger_service.get_trigger(trigger_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Trigger not found")
    merged = {
        "scope": payload_dict.get("scope", existing.scope),
        "world_id": payload_dict.get("world_id", existing.world_id),
        "location_id": payload_dict.get("location_id", existing.location_id),
        "scene_id": payload_dict.get("scene_id", existing.scene_id),
    }
    validate_scope_binding(merged)
    if payload.action is not None:
        validate_action(payload.action)
    trigger = await game_trigger_service.update_trigger(trigger_id, payload_dict)
    return to_hotspot_dto(trigger)


@router.delete("/{trigger_id}", response_model=Dict[str, Any])
async def delete_trigger(
    trigger_id: int,
    game_trigger_service: GameTriggerSvc,
    user: CurrentUser,
) -> Dict[str, Any]:
    deleted = await game_trigger_service.delete_trigger(trigger_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Trigger not found")
    return {"status": "ok", "deleted": trigger_id}
