from __future__ import annotations

from typing import Dict, Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from pixsim7_backend.api.dependencies import CurrentUser, GameSessionSvc

router = APIRouter()


class CreateSessionRequest(BaseModel):
    scene_id: int


class SessionAdvanceRequest(BaseModel):
    edge_id: int


class SessionUpdateRequest(BaseModel):
    world_time: Optional[float] = None
    flags: Optional[Dict[str, Any]] = None
    relationships: Optional[Dict[str, Any]] = None


class GameSessionResponse(BaseModel):
    id: int
    user_id: int
    scene_id: int
    current_node_id: int
    flags: Dict[str, Any]
    relationships: Dict[str, Any]
    world_time: float

    @classmethod
    def from_model(cls, gs: Any) -> "GameSessionResponse":
        return cls(
            id=gs.id,
            user_id=gs.user_id,
            scene_id=gs.scene_id,
            current_node_id=gs.current_node_id,
            flags=gs.flags,
            relationships=gs.relationships,
            world_time=gs.world_time,
        )


@router.post("/", response_model=GameSessionResponse)
async def create_session(
    req: CreateSessionRequest,
    game_session_service: GameSessionSvc,
    user: CurrentUser,
):
    """Create a new game session for the current user"""
    try:
        gs = await game_session_service.create_session(user_id=user.id, scene_id=req.scene_id)
    except ValueError as e:
        msg = str(e)
        if msg == "scene_not_found":
            raise HTTPException(status_code=404, detail="Scene not found")
        if msg == "scene_missing_entry_node":
            raise HTTPException(status_code=400, detail="Scene has no entry node")
        raise
    return GameSessionResponse.from_model(gs)


@router.get("/{session_id}", response_model=GameSessionResponse)
async def get_session(
    session_id: int,
    game_session_service: GameSessionSvc,
    user: CurrentUser,
):
    """Get a game session by ID"""
    gs = await game_session_service.get_session(session_id)
    if not gs or gs.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    return GameSessionResponse.from_model(gs)


@router.post("/{session_id}/advance", response_model=GameSessionResponse)
async def advance_session(
    session_id: int,
    req: SessionAdvanceRequest,
    game_session_service: GameSessionSvc,
    user: CurrentUser,
):
    """Advance a game session by selecting an edge"""
    gs = await game_session_service.get_session(session_id)
    if not gs or gs.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        gs = await game_session_service.advance_session(session_id=session_id, edge_id=req.edge_id)
    except ValueError as e:
        msg = str(e)
        if msg == "session_not_found":
            raise HTTPException(status_code=404, detail="Session not found")
        if msg == "invalid_edge_for_current_node":
            raise HTTPException(status_code=400, detail="Invalid edge for current node")
        raise
    return GameSessionResponse.from_model(gs)


@router.patch("/{session_id}", response_model=GameSessionResponse)
async def update_session(
    session_id: int,
    req: SessionUpdateRequest,
    game_session_service: GameSessionSvc,
    user: CurrentUser,
) -> GameSessionResponse:
    """Update world_time and/or flags for a game session.

    This is intended for world/life-sim style sessions that track
    continuous time and coarse-grained world state, independent of
    the scene graph progression.
    """
    gs = await game_session_service.get_session(session_id)
    if not gs or gs.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        gs = await game_session_service.update_session(
            session_id=session_id,
            world_time=req.world_time,
            flags=req.flags,
            relationships=req.relationships,
        )
    except ValueError as e:
        msg = str(e)
        if msg == "session_not_found":
            raise HTTPException(status_code=404, detail="Session not found")
        raise

    return GameSessionResponse.from_model(gs)
