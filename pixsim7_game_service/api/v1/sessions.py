from __future__ import annotations

from typing import Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from pixsim7_game_service.infrastructure.database.session import get_session
from pixsim7_game_service.services.game_session_service import GameSessionService
from pixsim7_backend.api.dependencies import get_current_user
from pixsim7_backend.domain import User

router = APIRouter()


class CreateSessionRequest(BaseModel):
    scene_id: int


class SessionAdvanceRequest(BaseModel):
    edge_id: int


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
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    service = GameSessionService(db)
    try:
        gs = service.create_session(user_id=user.id, scene_id=req.scene_id)
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
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    service = GameSessionService(db)
    gs = service.get_session(session_id)
    if not gs or gs.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    return GameSessionResponse.from_model(gs)


@router.post("/{session_id}/advance", response_model=GameSessionResponse)
async def advance_session(
    session_id: int,
    req: SessionAdvanceRequest,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    service = GameSessionService(db)
    gs = service.get_session(session_id)
    if not gs or gs.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        gs = service.advance_session(session_id=session_id, edge_id=req.edge_id)
    except ValueError as e:
        msg = str(e)
        if msg == "session_not_found":
            raise HTTPException(status_code=404, detail="Session not found")
        if msg == "invalid_edge_for_current_node":
            raise HTTPException(status_code=400, detail="Invalid edge for current node")
        raise
    return GameSessionResponse.from_model(gs)
