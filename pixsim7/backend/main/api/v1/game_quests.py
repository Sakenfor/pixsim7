"""
Game quest management endpoints
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlmodel import Session

from pixsim7.backend.main.infrastructure.database.core import get_session
from pixsim7.backend.main.domain.game.models import GameSession
from pixsim7.backend.main.services.game.quest_service import QuestService, Quest, QuestObjective

router = APIRouter(prefix="/game/quests", tags=["game-quests"])


# Request/Response models
class AddQuestRequest(BaseModel):
    quest_id: str
    title: str
    description: str
    objectives: List[Dict[str, Any]]
    metadata: Optional[Dict[str, Any]] = None


class UpdateQuestStatusRequest(BaseModel):
    status: str


class UpdateObjectiveRequest(BaseModel):
    objective_id: str
    progress: int
    completed: Optional[bool] = None


@router.get("/sessions/{session_id}/quests", response_model=List[Quest])
async def list_session_quests(
    session_id: int,
    status: Optional[str] = None,
    db: Session = Depends(get_session)
):
    """List all quests for a game session, optionally filtered by status"""
    game_session = db.get(GameSession, session_id)
    if not game_session:
        raise HTTPException(status_code=404, detail="Game session not found")

    quests = QuestService.list_quests(game_session.flags, status_filter=status)
    return quests


@router.get("/sessions/{session_id}/quests/{quest_id}", response_model=Quest)
async def get_session_quest(
    session_id: int,
    quest_id: str,
    db: Session = Depends(get_session)
):
    """Get a specific quest from a game session"""
    game_session = db.get(GameSession, session_id)
    if not game_session:
        raise HTTPException(status_code=404, detail="Game session not found")

    quest = QuestService.get_quest(game_session.flags, quest_id)
    if not quest:
        raise HTTPException(status_code=404, detail="Quest not found")

    return quest


@router.post("/sessions/{session_id}/quests", response_model=Quest)
async def add_quest_to_session(
    session_id: int,
    request: AddQuestRequest,
    db: Session = Depends(get_session)
):
    """Add a new quest to a game session"""
    game_session = db.get(GameSession, session_id)
    if not game_session:
        raise HTTPException(status_code=404, detail="Game session not found")

    # Check if quest already exists
    existing = QuestService.get_quest(game_session.flags, request.quest_id)
    if existing:
        raise HTTPException(status_code=400, detail="Quest already exists")

    # Add quest
    updated_flags = QuestService.add_quest(
        game_session.flags,
        request.quest_id,
        request.title,
        request.description,
        request.objectives,
        request.metadata
    )

    game_session.flags = updated_flags
    db.add(game_session)
    db.commit()
    db.refresh(game_session)

    return QuestService.get_quest(game_session.flags, request.quest_id)


@router.patch("/sessions/{session_id}/quests/{quest_id}/status", response_model=Quest)
async def update_quest_status(
    session_id: int,
    quest_id: str,
    request: UpdateQuestStatusRequest,
    db: Session = Depends(get_session)
):
    """Update quest status"""
    game_session = db.get(GameSession, session_id)
    if not game_session:
        raise HTTPException(status_code=404, detail="Game session not found")

    try:
        updated_flags = QuestService.update_quest_status(
            game_session.flags,
            quest_id,
            request.status
        )

        game_session.flags = updated_flags
        db.add(game_session)
        db.commit()
        db.refresh(game_session)

        return QuestService.get_quest(game_session.flags, quest_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/sessions/{session_id}/quests/{quest_id}/objectives", response_model=Quest)
async def update_objective_progress(
    session_id: int,
    quest_id: str,
    request: UpdateObjectiveRequest,
    db: Session = Depends(get_session)
):
    """Update objective progress"""
    game_session = db.get(GameSession, session_id)
    if not game_session:
        raise HTTPException(status_code=404, detail="Game session not found")

    try:
        updated_flags = QuestService.update_objective_progress(
            game_session.flags,
            quest_id,
            request.objective_id,
            request.progress,
            request.completed
        )

        game_session.flags = updated_flags
        db.add(game_session)
        db.commit()
        db.refresh(game_session)

        return QuestService.get_quest(game_session.flags, quest_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/sessions/{session_id}/quests/{quest_id}/objectives/{objective_id}/complete", response_model=Quest)
async def complete_objective(
    session_id: int,
    quest_id: str,
    objective_id: str,
    db: Session = Depends(get_session)
):
    """Mark an objective as completed"""
    game_session = db.get(GameSession, session_id)
    if not game_session:
        raise HTTPException(status_code=404, detail="Game session not found")

    try:
        updated_flags = QuestService.complete_objective(
            game_session.flags,
            quest_id,
            objective_id
        )

        game_session.flags = updated_flags
        db.add(game_session)
        db.commit()
        db.refresh(game_session)

        return QuestService.get_quest(game_session.flags, quest_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
