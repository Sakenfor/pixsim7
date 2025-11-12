from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select, Session
from typing import Dict, Any
from pydantic import BaseModel
from pixsim7_game_service.domain.models import (
    GameSession,
    GameScene,
    GameSceneNode,
    GameSceneEdge,
)
from pixsim7_game_service.infrastructure.database.session import get_session

router = APIRouter()

class CreateSessionRequest(BaseModel):
    user_id: int
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

@router.post("/", response_model=GameSessionResponse)
async def create_session(req: CreateSessionRequest, session: Session = Depends(get_session)):
    scene = session.exec(select(GameScene).where(GameScene.id == req.scene_id)).first()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    if not scene.entry_node_id:
        raise HTTPException(status_code=400, detail="Scene has no entry node")
    gs = GameSession(user_id=req.user_id, scene_id=scene.id, current_node_id=scene.entry_node_id)
    session.add(gs)
    session.commit()
    session.refresh(gs)
    return GameSessionResponse(
        id=gs.id,
        user_id=gs.user_id,
        scene_id=gs.scene_id,
        current_node_id=gs.current_node_id,
        flags=gs.flags,
        relationships=gs.relationships,
        world_time=gs.world_time,
    )

@router.get("/{session_id}", response_model=GameSessionResponse)
async def get_session(session_id: int, session: Session = Depends(get_session)):
    gs = session.get(GameSession, session_id)
    if not gs:
        raise HTTPException(status_code=404, detail="Session not found")
    return GameSessionResponse(
        id=gs.id,
        user_id=gs.user_id,
        scene_id=gs.scene_id,
        current_node_id=gs.current_node_id,
        flags=gs.flags,
        relationships=gs.relationships,
        world_time=gs.world_time,
    )

@router.post("/{session_id}/advance", response_model=GameSessionResponse)
async def advance_session(session_id: int, req: SessionAdvanceRequest, session: Session = Depends(get_session)):
    gs = session.get(GameSession, session_id)
    if not gs:
        raise HTTPException(status_code=404, detail="Session not found")
    # simplistic: validate edge exists from current_node -> new node
    edge = session.exec(select(GameSceneEdge).where(GameSceneEdge.id == req.edge_id)).first()
    if not edge or edge.from_node_id != gs.current_node_id:
        raise HTTPException(status_code=400, detail="Invalid edge for current node")
    gs.current_node_id = edge.to_node_id
    session.add(gs)
    session.commit()
    session.refresh(gs)
    return GameSessionResponse(
        id=gs.id,
        user_id=gs.user_id,
        scene_id=gs.scene_id,
        current_node_id=gs.current_node_id,
        flags=gs.flags,
        relationships=gs.relationships,
        world_time=gs.world_time,
    )
