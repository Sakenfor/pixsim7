from __future__ import annotations

from typing import Dict, Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from pixsim7_backend.api.dependencies import CurrentUser, GameSessionSvc

router = APIRouter()


async def _get_owned_session(session_id: int, user: CurrentUser, game_session_service: GameSessionSvc):
    """Fetch a session and ensure it belongs to the current user."""

    gs = await game_session_service.get_session(session_id)
    if not gs or gs.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    return gs


class CreateSessionRequest(BaseModel):
    scene_id: int
    world_id: Optional[int] = None
    flags: Optional[Dict[str, Any]] = None


class SessionAdvanceRequest(BaseModel):
    edge_id: int


class SessionUpdateRequest(BaseModel):
    world_time: Optional[float] = None
    flags: Optional[Dict[str, Any]] = None
    relationships: Optional[Dict[str, Any]] = None
    expected_version: Optional[int] = None  # For optimistic locking


class GameSessionResponse(BaseModel):
    id: int
    user_id: int
    scene_id: int
    current_node_id: int
    world_id: Optional[int] = None
    flags: Dict[str, Any]
    relationships: Dict[str, Any]
    world_time: float
    version: int  # Optimistic locking version

    @classmethod
    def from_model(cls, gs: Any) -> "GameSessionResponse":
        return cls(
            id=gs.id,
            user_id=gs.user_id,
            scene_id=gs.scene_id,
            current_node_id=gs.current_node_id,
            world_id=gs.world_id,
            flags=gs.flags,
            relationships=gs.relationships,
            world_time=gs.world_time,
            version=gs.version,
        )


@router.post("/", response_model=GameSessionResponse)
async def create_session(
    req: CreateSessionRequest,
    game_session_service: GameSessionSvc,
    user: CurrentUser,
):
    """Create a new game session for the current user with optional initial flags"""
    try:
        gs = await game_session_service.create_session(
            user_id=user.id,
            scene_id=req.scene_id,
            world_id=req.world_id,
            flags=req.flags,
        )
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
    gs = await _get_owned_session(session_id, user, game_session_service)
    return GameSessionResponse.from_model(gs)


@router.post("/{session_id}/advance", response_model=GameSessionResponse)
async def advance_session(
    session_id: int,
    req: SessionAdvanceRequest,
    game_session_service: GameSessionSvc,
    user: CurrentUser,
):
    """Advance a game session by selecting an edge"""
    await _get_owned_session(session_id, user, game_session_service)
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

    Supports optimistic locking: if expected_version is provided and doesn't
    match the current version, returns 409 Conflict with the current session state.
    """
    await _get_owned_session(session_id, user, game_session_service)
    try:
        gs = await game_session_service.update_session(
            session_id=session_id,
            world_time=req.world_time,
            flags=req.flags,
            relationships=req.relationships,
            expected_version=req.expected_version,
        )
    except ValueError as e:
        msg = str(e)
        if msg == "session_not_found":
            raise HTTPException(status_code=404, detail="Session not found")
        elif msg == "version_conflict":
            # Get current session state for conflict resolution
            current_session = await game_session_service.get_session(session_id)
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "version_conflict",
                    "message": "Session was modified by another process",
                    "current_session": GameSessionResponse.from_model(current_session).model_dump(),
                },
            )
        elif msg.startswith("turn_based_validation_failed"):
            raise HTTPException(status_code=400, detail=msg)
        raise

    return GameSessionResponse.from_model(gs)
