from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from pixsim7_backend.api.dependencies import CurrentUser, GameWorldSvc


router = APIRouter()


class GameWorldSummary(BaseModel):
    id: int
    name: str


class GameWorldDetail(BaseModel):
    id: int
    name: str
    meta: Optional[Dict[str, Any]] = None
    world_time: float


class CreateWorldRequest(BaseModel):
    name: str
    meta: Optional[Dict[str, Any]] = None


class AdvanceWorldTimeRequest(BaseModel):
    delta_seconds: float


@router.get("/", response_model=List[GameWorldSummary])
async def list_worlds(
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> List[GameWorldSummary]:
    """
    List game worlds owned by the current user.
    """
    worlds = await game_world_service.list_worlds_for_user(owner_user_id=user.id)
    return [GameWorldSummary(id=w.id, name=w.name) for w in worlds]


@router.post("/", response_model=GameWorldDetail)
async def create_world(
    req: CreateWorldRequest,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> GameWorldDetail:
    """
    Create a new game world for the current user.
    """
    world = await game_world_service.create_world(
        owner_user_id=user.id,
        name=req.name,
        meta=req.meta or {},
    )
    state = await game_world_service.get_world_state(world.id)
    world_time = state.world_time if state else 0.0
    return GameWorldDetail(id=world.id, name=world.name, meta=world.meta, world_time=world_time)


@router.get("/{world_id}", response_model=GameWorldDetail)
async def get_world(
    world_id: int,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> GameWorldDetail:
    """
    Get a world and its current global time.
    """
    world = await game_world_service.get_world(world_id)
    if not world or world.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="World not found")

    state = await game_world_service.get_world_state(world.id)
    world_time = state.world_time if state else 0.0
    return GameWorldDetail(id=world.id, name=world.name, meta=world.meta, world_time=world_time)


@router.post("/{world_id}/advance", response_model=GameWorldDetail)
async def advance_world_time(
    world_id: int,
    req: AdvanceWorldTimeRequest,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> GameWorldDetail:
    """
    Manually advance global world time for a world.

    This is primarily intended for development and editor tools; production
    environments may advance time via background jobs instead.
    """
    world = await game_world_service.get_world(world_id)
    if not world or world.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="World not found")

    try:
        state = await game_world_service.advance_world_time(
            world_id=world_id,
            delta_seconds=req.delta_seconds,
        )
    except ValueError as e:
        if str(e) == "world_not_found":
            raise HTTPException(status_code=404, detail="World not found")
        raise

    return GameWorldDetail(id=world.id, name=world.name, meta=world.meta, world_time=state.world_time)

