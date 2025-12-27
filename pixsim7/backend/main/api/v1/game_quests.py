"""
Game quest management endpoints

Uses async database session and service patterns for consistency with other game APIs.
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from pixsim7.backend.main.api.dependencies import CurrentUser, GameSessionSvc
from pixsim7.backend.main.services.game.quest import QuestService, Quest

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


async def _get_owned_session(session_id: int, user: CurrentUser, game_session_service: GameSessionSvc):
    """Fetch a session and ensure it belongs to the current user."""
    gs = await game_session_service.get_session(session_id)
    if not gs or gs.user_id != user.id:
        raise HTTPException(status_code=404, detail="Game session not found")
    return gs


@router.get("/sessions/{session_id}/quests", response_model=List[Quest])
async def list_session_quests(
    session_id: int,
    user: CurrentUser,
    game_session_service: GameSessionSvc,
    status: Optional[str] = None,
):
    """List all quests for a game session, optionally filtered by status"""
    game_session = await _get_owned_session(session_id, user, game_session_service)
    quests = QuestService.list_quests(game_session.flags, status_filter=status)
    return quests


@router.get("/sessions/{session_id}/quests/{quest_id}", response_model=Quest)
async def get_session_quest(
    session_id: int,
    quest_id: str,
    user: CurrentUser,
    game_session_service: GameSessionSvc,
):
    """Get a specific quest from a game session"""
    game_session = await _get_owned_session(session_id, user, game_session_service)
    quest = QuestService.get_quest(game_session.flags, quest_id)
    if not quest:
        raise HTTPException(status_code=404, detail="Quest not found")
    return quest


@router.post("/sessions/{session_id}/quests", response_model=Quest)
async def add_quest_to_session(
    session_id: int,
    request: AddQuestRequest,
    user: CurrentUser,
    game_session_service: GameSessionSvc,
):
    """Add a new quest to a game session"""
    game_session = await _get_owned_session(session_id, user, game_session_service)

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

    # Update session via service
    await game_session_service.update_session(
        session_id=session_id,
        flags=updated_flags,
    )

    # Create event for quest addition
    await game_session_service.create_event(
        session_id=session_id,
        action="quest_add",
        diff={"quest_id": request.quest_id, "title": request.title},
    )

    return QuestService.get_quest(updated_flags, request.quest_id)


@router.patch("/sessions/{session_id}/quests/{quest_id}/status", response_model=Quest)
async def update_quest_status(
    session_id: int,
    quest_id: str,
    request: UpdateQuestStatusRequest,
    user: CurrentUser,
    game_session_service: GameSessionSvc,
):
    """Update quest status"""
    game_session = await _get_owned_session(session_id, user, game_session_service)

    try:
        updated_flags = QuestService.update_quest_status(
            game_session.flags,
            quest_id,
            request.status
        )

        # Update session via service
        await game_session_service.update_session(
            session_id=session_id,
            flags=updated_flags,
        )

        # Create event for quest status change
        await game_session_service.create_event(
            session_id=session_id,
            action="quest_status",
            diff={"quest_id": quest_id, "status": request.status},
        )

        return QuestService.get_quest(updated_flags, quest_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/sessions/{session_id}/quests/{quest_id}/objectives", response_model=Quest)
async def update_objective_progress(
    session_id: int,
    quest_id: str,
    request: UpdateObjectiveRequest,
    user: CurrentUser,
    game_session_service: GameSessionSvc,
):
    """Update objective progress"""
    game_session = await _get_owned_session(session_id, user, game_session_service)

    try:
        updated_flags = QuestService.update_objective_progress(
            game_session.flags,
            quest_id,
            request.objective_id,
            request.progress,
            request.completed
        )

        # Update session via service
        await game_session_service.update_session(
            session_id=session_id,
            flags=updated_flags,
        )

        # Create event for objective progress
        diff = {
            "quest_id": quest_id,
            "objective_id": request.objective_id,
            "progress": request.progress,
        }
        if request.completed is not None:
            diff["completed"] = request.completed

        await game_session_service.create_event(
            session_id=session_id,
            action="quest_progress",
            diff=diff,
        )

        return QuestService.get_quest(updated_flags, quest_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/sessions/{session_id}/quests/{quest_id}/objectives/{objective_id}/complete", response_model=Quest)
async def complete_objective(
    session_id: int,
    quest_id: str,
    objective_id: str,
    user: CurrentUser,
    game_session_service: GameSessionSvc,
):
    """Mark an objective as completed"""
    game_session = await _get_owned_session(session_id, user, game_session_service)

    try:
        updated_flags = QuestService.complete_objective(
            game_session.flags,
            quest_id,
            objective_id
        )

        # Update session via service
        await game_session_service.update_session(
            session_id=session_id,
            flags=updated_flags,
        )

        # Create event for objective completion
        await game_session_service.create_event(
            session_id=session_id,
            action="quest_objective_complete",
            diff={"quest_id": quest_id, "objective_id": objective_id},
        )

        return QuestService.get_quest(updated_flags, quest_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
