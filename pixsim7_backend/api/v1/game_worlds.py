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


class UpdateWorldMetaRequest(BaseModel):
    meta: Dict[str, Any]


async def _get_owned_world(world_id: int, user: CurrentUser, game_world_service: GameWorldSvc):
    """Fetch a world and ensure the requesting user owns it."""

    world = await game_world_service.get_world(world_id)
    if not world or world.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="World not found")
    return world


async def _build_world_detail(
    world,
    game_world_service: GameWorldSvc,
    *,
    state=None,
) -> GameWorldDetail:
    """Serialize a world with its current global time."""

    world_state = state or await game_world_service.get_world_state(world.id)
    world_time = world_state.world_time if world_state else 0.0
    return GameWorldDetail(id=world.id, name=world.name, meta=world.meta, world_time=world_time)


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
    return await _build_world_detail(world, game_world_service, state=state)


@router.get("/{world_id}", response_model=GameWorldDetail)
async def get_world(
    world_id: int,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> GameWorldDetail:
    """
    Get a world and its current global time.
    """
    world = await _get_owned_world(world_id, user, game_world_service)
    return await _build_world_detail(world, game_world_service)


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
    world = await _get_owned_world(world_id, user, game_world_service)

    try:
        state = await game_world_service.advance_world_time(
            world_id=world_id,
            delta_seconds=req.delta_seconds,
        )
    except ValueError as e:
        if str(e) == "world_not_found":
            raise HTTPException(status_code=404, detail="World not found")
        raise

    return await _build_world_detail(world, game_world_service, state=state)


@router.put("/{world_id}/meta", response_model=GameWorldDetail)
async def update_world_meta(
    world_id: int,
    req: UpdateWorldMetaRequest,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> GameWorldDetail:
    """
    Update the metadata for a game world.

    This allows designers to configure per-world settings like HUD layouts,
    enabled plugins, and other UI/UX customizations.
    """
    await _get_owned_world(world_id, user, game_world_service)

    # Update the world metadata
    updated_world = await game_world_service.update_world_meta(world_id, req.meta)

    # Get current world time
    return await _build_world_detail(updated_world, game_world_service)

