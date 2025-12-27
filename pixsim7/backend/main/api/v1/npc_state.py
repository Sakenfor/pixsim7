"""
NPC State Management API endpoints.

Manages NPC memories, emotions, milestones, world events, and personality evolution.
"""

from typing import Dict, Any, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession
from pixsim7.backend.main.services.npc import (
    MemoryService, EmotionalStateService, MilestoneService,
    WorldAwarenessService, PersonalityEvolutionService
)
from pixsim7.backend.main.domain.game.entities.npc_memory import MemoryImportance, MemoryType


router = APIRouter(tags=["npc-state"])


class SetEmotionRequest(BaseModel):
    """Request to set NPC emotion"""
    emotion: str = Field(..., description="Emotion type (happy, sad, angry, etc.)")
    intensity: float = Field(default=0.7, ge=0.0, le=1.0, description="Intensity (0.0-1.0)")
    duration_seconds: Optional[float] = Field(None, description="How long it lasts")
    triggered_by: Optional[str] = Field(None, description="What caused this")
    session_id: Optional[int] = Field(None, description="Session this is part of")


class RegisterWorldEventRequest(BaseModel):
    """Request to register a world event"""
    event_type: str = Field(..., description="Type of event (time_of_day, weather, story_event, etc.)")
    event_name: str = Field(..., description="Event identifier")
    event_description: str = Field(..., description="What happened")
    relevance_score: float = Field(default=0.5, ge=0.0, le=1.0, description="How relevant to NPC")
    duration_hours: Optional[float] = Field(None, description="How long event is relevant")
    opinion: Optional[str] = Field(None, description="NPC's opinion on the event")





@router.get("/npcs/{npc_id}/memories")
async def get_npc_memories(
    npc_id: int,
    db: DatabaseSession,
    user: CurrentUser,
    topic: Optional[str] = None,
    limit: int = 20,
    session_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Get conversation memories for an NPC

    Args:
        npc_id: NPC ID
        topic: Filter by topic
        limit: Maximum results
        session_id: Filter by session

    Returns:
        List of memories
    """
    memory_service = MemoryService(db)

    memories = await memory_service.recall_memories(
        npc_id=npc_id,
        user_id=user.id,
        topic=topic,
        session_id=session_id,
        limit=limit
    )

    return {
        "memories": [
            {
                "id": m.id,
                "topic": m.topic,
                "summary": m.summary,
                "player_said": m.player_said,
                "npc_said": m.npc_said,
                "importance": m.importance.value,
                "memory_type": m.memory_type.value,
                "strength": m.strength,
                "created_at": m.created_at.isoformat(),
                "tags": m.tags
            }
            for m in memories
        ],
        "total": len(memories)
    }


@router.get("/npcs/{npc_id}/memories/summary")
async def get_npc_memory_summary(
    npc_id: int,
    db: DatabaseSession,
    user: CurrentUser
) -> Dict[str, Any]:
    """
    Get memory summary statistics for an NPC

    Returns count by type and importance
    """
    memory_service = MemoryService(db)
    summary = await memory_service.get_memory_summary(npc_id, user.id)

    return summary


@router.get("/npcs/{npc_id}/emotions")
async def get_npc_emotions(
    npc_id: int,
    db: DatabaseSession,
    user: CurrentUser,
    session_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Get current emotional states for an NPC

    Returns active emotions with intensities
    """
    emotion_service = EmotionalStateService(db)

    emotions = await emotion_service.get_current_emotions(
        npc_id=npc_id,
        session_id=session_id
    )

    modifiers = emotion_service.get_emotion_modifiers(emotions)

    return {
        "current_emotions": [
            {
                "id": e.id,
                "emotion": e.emotion.value,
                "intensity": e.intensity,
                "triggered_by": e.triggered_by,
                "started_at": e.started_at.isoformat(),
                "expires_at": e.expires_at.isoformat() if e.expires_at else None
            }
            for e in emotions
        ],
        "modifiers": modifiers,
        "total_active": len(emotions)
    }


class SetEmotionRequest(BaseModel):
    """Request to set NPC emotion"""
    emotion: str = Field(..., description="Emotion type (happy, sad, angry, etc.)")
    intensity: float = Field(default=0.7, ge=0.0, le=1.0, description="Intensity (0.0-1.0)")
    duration_seconds: Optional[float] = Field(None, description="How long it lasts")
    triggered_by: Optional[str] = Field(None, description="What caused this")
    session_id: Optional[int] = Field(None, description="Session this is part of")


@router.post("/npcs/{npc_id}/emotions")
async def set_npc_emotion(
    npc_id: int,
    req: SetEmotionRequest,
    db: DatabaseSession,
    user: CurrentUser
) -> Dict[str, Any]:
    """
    Set an emotional state for an NPC

    Triggers a new emotion with specified intensity and duration
    """
    from pixsim7.backend.main.domain.game.entities.npc_memory import EmotionType

    # Validate emotion type
    try:
        emotion = EmotionType(req.emotion)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid emotion type. Valid types: {[e.value for e in EmotionType]}"
        )

    emotion_service = EmotionalStateService(db)

    state = await emotion_service.set_emotion(
        npc_id=npc_id,
        emotion=emotion,
        intensity=req.intensity,
        duration_seconds=req.duration_seconds,
        triggered_by=req.triggered_by or f"manual_trigger_by_user_{user.id}",
        session_id=req.session_id
    )

    return {
        "success": True,
        "emotion_id": state.id,
        "emotion": state.emotion.value,
        "intensity": state.intensity,
        "expires_at": state.expires_at.isoformat() if state.expires_at else None
    }


@router.delete("/npcs/{npc_id}/emotions/{emotion_id}")
async def clear_npc_emotion(
    npc_id: int,
    emotion_id: int,
    db: DatabaseSession,
    user: CurrentUser
) -> Dict[str, Any]:
    """
    Clear a specific emotional state
    """
    emotion_service = EmotionalStateService(db)

    success = await emotion_service.clear_emotion(emotion_id)

    if not success:
        raise HTTPException(status_code=404, detail="Emotion not found")

    return {
        "success": True,
        "message": "Emotion cleared"
    }


@router.delete("/npcs/{npc_id}/emotions")
async def clear_all_npc_emotions(
    npc_id: int,
    db: DatabaseSession,
    user: CurrentUser,
    session_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Clear all active emotions for an NPC
    """
    emotion_service = EmotionalStateService(db)

    count = await emotion_service.clear_all_emotions(
        npc_id=npc_id,
        session_id=session_id
    )

    return {
        "success": True,
        "cleared_count": count,
        "message": f"Cleared {count} emotions"
    }

# ===== Relationship Milestone Endpoints =====

@router.get("/npcs/{npc_id}/milestones")
async def get_npc_milestones(
    npc_id: int,
    db: DatabaseSession,
    user: CurrentUser,
    limit: int = 50
) -> Dict[str, Any]:
    """
    Get all relationship milestones for an NPC

    Returns milestone history in chronological order
    """
    milestone_service = MilestoneService(db)

    milestones = await milestone_service.get_all_milestones(
        npc_id=npc_id,
        user_id=user.id,
        limit=limit
    )

    return {
        "npc_id": npc_id,
        "total": len(milestones),
        "milestones": [
            {
                "id": m.id,
                "type": m.milestone_type.value,
                "name": m.milestone_name,
                "relationship_tier": m.relationship_tier,
                "achieved_at": m.achieved_at.isoformat(),
                "triggered_by": m.triggered_by,
                "emotional_impact": m.emotional_impact.value if m.emotional_impact else None
            }
            for m in milestones
        ]
    }


@router.get("/npcs/{npc_id}/milestones/summary")
async def get_milestone_summary(
    npc_id: int,
    db: DatabaseSession,
    user: CurrentUser
) -> Dict[str, Any]:
    """
    Get summary of relationship milestones
    """
    milestone_service = MilestoneService(db)

    summary = await milestone_service.get_milestone_summary(
        npc_id=npc_id,
        user_id=user.id
    )

    return summary


# ===== World Context Endpoints =====

class RegisterWorldEventRequest(BaseModel):
    """Request to register a world event"""
    event_type: str = Field(..., description="Type of event (time_of_day, weather, story_event, etc.)")
    event_name: str = Field(..., description="Event identifier")
    event_description: str = Field(..., description="What happened")
    relevance_score: float = Field(default=0.5, ge=0.0, le=1.0, description="How relevant to NPC")
    duration_hours: Optional[float] = Field(None, description="How long event is relevant")
    opinion: Optional[str] = Field(None, description="NPC's opinion on the event")


@router.post("/npcs/{npc_id}/world-events")
async def register_world_event(
    npc_id: int,
    req: RegisterWorldEventRequest,
    db: DatabaseSession,
    user: CurrentUser,
    world_id: Optional[int] = None,
    session_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Register a world event that an NPC is aware of

    This allows NPCs to reference recent events in dialogue
    """
    from pixsim7.backend.main.domain.game.entities.npc_memory import WorldEventType

    # Validate event type
    try:
        event_type = WorldEventType(req.event_type)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid event type. Valid types: {[e.value for e in WorldEventType]}"
        )

    world_awareness_service = WorldAwarenessService(db)

    context = await world_awareness_service.register_event(
        npc_id=npc_id,
        event_type=event_type,
        event_name=req.event_name,
        event_description=req.event_description,
        world_id=world_id,
        session_id=session_id,
        relevance_score=req.relevance_score,
        duration_hours=req.duration_hours,
        opinion=req.opinion
    )

    return {
        "success": True,
        "event_id": context.id,
        "event_name": context.event_name,
        "relevance_score": context.relevance_score,
        "expires_at": context.expires_at.isoformat() if context.expires_at else None
    }


@router.get("/npcs/{npc_id}/world-events")
async def get_world_events(
    npc_id: int,
    db: DatabaseSession,
    user: CurrentUser,
    min_relevance: float = 0.3,
    limit: int = 10
) -> Dict[str, Any]:
    """
    Get relevant world events that an NPC is aware of
    """
    world_awareness_service = WorldAwarenessService(db)

    events = await world_awareness_service.get_relevant_events(
        npc_id=npc_id,
        min_relevance=min_relevance,
        limit=limit
    )

    return {
        "npc_id": npc_id,
        "total": len(events),
        "events": [
            {
                "id": e.id,
                "type": e.event_type.value,
                "name": e.event_name,
                "description": e.event_description,
                "relevance_score": e.relevance_score,
                "occurred_at": e.occurred_at.isoformat(),
                "opinion": e.opinion,
                "emotional_response": e.emotional_response.value if e.emotional_response else None
            }
            for e in events
        ]
    }


@router.get("/npcs/{npc_id}/world-events/summary")
async def get_world_context_summary(
    npc_id: int,
    db: DatabaseSession,
    user: CurrentUser
) -> Dict[str, Any]:
    """
    Get summary of NPC's world awareness
    """
    world_awareness_service = WorldAwarenessService(db)

    summary = await world_awareness_service.get_world_context_summary(
        npc_id=npc_id
    )

    return summary


# ===== Personality Evolution Endpoints =====

@router.get("/npcs/{npc_id}/personality/history")
async def get_personality_history(
    npc_id: int,
    db: DatabaseSession,
    user: CurrentUser,
    limit: int = 50
) -> Dict[str, Any]:
    """
    Get personality evolution history for an NPC
    """
    personality_service = PersonalityEvolutionService(db)

    history = await personality_service.get_all_personality_history(
        npc_id=npc_id,
        user_id=user.id,
        limit=limit
    )

    return {
        "npc_id": npc_id,
        "total": len(history),
        "changes": [
            {
                "id": e.id,
                "trait": e.trait_changed.value,
                "old_value": e.old_value,
                "new_value": e.new_value,
                "change_amount": e.change_amount,
                "triggered_by": e.triggered_by,
                "changed_at": e.changed_at.isoformat()
            }
            for e in history
        ]
    }


@router.get("/npcs/{npc_id}/personality/summary")
async def get_personality_summary(
    npc_id: int,
    db: DatabaseSession,
    user: CurrentUser
) -> Dict[str, Any]:
    """
    Get summary of personality evolution
    """
    personality_service = PersonalityEvolutionService(db)

    summary = await personality_service.get_personality_summary(
        npc_id=npc_id
    )

    return summary


@router.get("/npcs/{npc_id}/personality/trajectory/{trait}")
async def get_trait_trajectory(
    npc_id: int,
    trait: str,
    db: DatabaseSession,
    user: CurrentUser
) -> Dict[str, Any]:
    """
    Get trajectory/trend for a specific personality trait
    """
    from pixsim7.backend.main.domain.game.entities.npc_memory import PersonalityTrait

    # Validate trait
    try:
        trait_enum = PersonalityTrait(trait)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid trait. Valid traits: {[t.value for t in PersonalityTrait]}"
        )

    personality_service = PersonalityEvolutionService(db)

    trajectory = await personality_service.calculate_trait_trajectory(
        npc_id=npc_id,
        trait=trait_enum
    )

    return trajectory

