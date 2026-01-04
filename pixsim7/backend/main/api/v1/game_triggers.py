from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, ConfigDict

from pixsim7.backend.main.api.dependencies import CurrentUser, GameTriggerSvc
from pixsim7.backend.main.api.v1.game_hotspots import GameHotspotDTO, HotspotAction, HotspotTarget


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


def validate_scope_binding(payload: Dict[str, Any]) -> None:
    scope = payload.get("scope")
    if scope == "location" and payload.get("location_id") is None:
        raise HTTPException(status_code=400, detail="location_id is required for location scope")
    if scope == "world" and payload.get("world_id") is None:
        raise HTTPException(status_code=400, detail="world_id is required for world scope")
    if scope == "scene" and payload.get("scene_id") is None:
        raise HTTPException(status_code=400, detail="scene_id is required for scene scope")


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
    return [
        GameHotspotDTO(
            id=t.id,
            scope=t.scope,
            world_id=t.world_id,
            location_id=t.location_id,
            scene_id=t.scene_id,
            hotspot_id=t.hotspot_id,
            target=t.target,
            action=t.action,
            meta=t.meta,
        )
        for t in triggers
    ]


@router.get("/{trigger_id}", response_model=GameHotspotDTO)
async def get_trigger(
    trigger_id: int,
    game_trigger_service: GameTriggerSvc,
    user: CurrentUser,
) -> GameHotspotDTO:
    trigger = await game_trigger_service.get_trigger(trigger_id)
    if not trigger:
        raise HTTPException(status_code=404, detail="Trigger not found")
    return GameHotspotDTO(
        id=trigger.id,
        scope=trigger.scope,
        world_id=trigger.world_id,
        location_id=trigger.location_id,
        scene_id=trigger.scene_id,
        hotspot_id=trigger.hotspot_id,
        target=trigger.target,
        action=trigger.action,
        meta=trigger.meta,
    )


@router.post("/", response_model=GameHotspotDTO)
async def create_trigger(
    payload: GameTriggerCreate,
    game_trigger_service: GameTriggerSvc,
    user: CurrentUser,
) -> GameHotspotDTO:
    payload_dict = payload.model_dump(exclude_none=True)
    validate_scope_binding(payload_dict)
    trigger = await game_trigger_service.create_trigger(payload_dict)
    return GameHotspotDTO(
        id=trigger.id,
        scope=trigger.scope,
        world_id=trigger.world_id,
        location_id=trigger.location_id,
        scene_id=trigger.scene_id,
        hotspot_id=trigger.hotspot_id,
        target=trigger.target,
        action=trigger.action,
        meta=trigger.meta,
    )


@router.patch("/{trigger_id}", response_model=GameHotspotDTO)
async def update_trigger(
    trigger_id: int,
    payload: GameTriggerUpdate,
    game_trigger_service: GameTriggerSvc,
    user: CurrentUser,
) -> GameHotspotDTO:
    payload_dict = payload.model_dump(exclude_none=True)
    if "scope" in payload_dict:
        validate_scope_binding(payload_dict)
    trigger = await game_trigger_service.update_trigger(trigger_id, payload_dict)
    if not trigger:
        raise HTTPException(status_code=404, detail="Trigger not found")
    return GameHotspotDTO(
        id=trigger.id,
        scope=trigger.scope,
        world_id=trigger.world_id,
        location_id=trigger.location_id,
        scene_id=trigger.scene_id,
        hotspot_id=trigger.hotspot_id,
        target=trigger.target,
        action=trigger.action,
        meta=trigger.meta,
    )


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
