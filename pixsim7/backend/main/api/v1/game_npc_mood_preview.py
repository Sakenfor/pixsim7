"""
NPC Mood Preview API

Provides read-only preview endpoints for computing NPC mood states
based on relationship values and emotional states.

These endpoints are stateless and do not mutate game sessions.
"""

from __future__ import annotations

from typing import Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_database
from pixsim7.backend.main.domain.metrics.mood_evaluators import (
    evaluate_npc_mood,
    evaluate_unified_npc_mood,
)

router = APIRouter()


# ===== Request/Response Models =====


class RelationshipValuesInput(BaseModel):
    """Relationship values for mood computation."""

    affinity: float
    trust: float
    chemistry: float
    tension: float


class EmotionalStateInput(BaseModel):
    """Emotional state override."""

    emotion: str
    intensity: float


class PreviewMoodRequest(BaseModel):
    """Request for previewing NPC mood."""

    world_id: int
    npc_id: int
    session_id: Optional[int] = None
    relationship_values: Optional[RelationshipValuesInput] = None
    emotional_state: Optional[EmotionalStateInput] = None


class PreviewMoodResponse(BaseModel):
    """Response for NPC mood preview."""

    mood_id: str
    valence: float
    arousal: float
    emotion_type: Optional[str] = None
    emotion_intensity: Optional[float] = None
    npc_id: int


class UnifiedMoodGeneral(BaseModel):
    """General mood portion of unified mood preview."""

    mood_id: str
    valence: float
    arousal: float


class UnifiedMoodIntimacy(BaseModel):
    """Intimacy mood portion of unified mood preview."""

    mood_id: str
    intensity: float


class UnifiedActiveEmotion(BaseModel):
    """Active discrete emotion portion of unified mood preview."""

    emotion_type: str
    intensity: float
    trigger: Optional[str] = None
    expires_at: Optional[str] = None


class UnifiedMoodResponse(BaseModel):
    """Response for unified NPC mood preview."""

    general_mood: UnifiedMoodGeneral
    intimacy_mood: Optional[UnifiedMoodIntimacy] = None
    active_emotion: Optional[UnifiedActiveEmotion] = None


# ===== Endpoints =====


@router.post("/preview-mood", response_model=PreviewMoodResponse)
async def preview_npc_mood(
    request: PreviewMoodRequest, db: AsyncSession = Depends(get_database)
):
    """
    Preview what mood state an NPC would have based on relationship and emotional state.

    This endpoint is stateless and does not modify any game sessions.
    It uses world-specific mood schemas if configured, otherwise
    falls back to hardcoded default mood quadrants (excited/content/anxious/calm).

    The mood is computed using a valence-arousal model:
    - Valence (0-100): Pleasure, driven by affinity and chemistry
    - Arousal (0-100): Energy/activation, driven by chemistry and tension

    Optionally integrates with the EmotionalState system to include
    discrete emotions alongside valence/arousal.

    Args:
        request: Preview request with world_id, npc_id, and optional overrides
        db: Database session (injected)

    Returns:
        Computed mood_id, valence, arousal, and optional emotion data

    Raises:
        404: World not found
        400: Invalid request (missing fields, invalid types)
    """
    try:
        # Build payload for evaluator
        payload: Dict[str, Any] = {
            "npc_id": request.npc_id,
        }

        if request.session_id:
            payload["session_id"] = request.session_id

        if request.relationship_values:
            payload["relationship_values"] = {
                "affinity": request.relationship_values.affinity,
                "trust": request.relationship_values.trust,
                "chemistry": request.relationship_values.chemistry,
                "tension": request.relationship_values.tension,
            }

        if request.emotional_state:
            payload["emotional_state"] = {
                "emotion": request.emotional_state.emotion,
                "intensity": request.emotional_state.intensity,
            }

        # Call evaluator
        result = await evaluate_npc_mood(
            world_id=request.world_id,
            payload=payload,
            db=db,
        )

        # Return response
        return PreviewMoodResponse(
            mood_id=result["mood_id"],
            valence=result["valence"],
            arousal=result["arousal"],
            emotion_type=result.get("emotion_type"),
            emotion_intensity=result.get("emotion_intensity"),
            npc_id=result["npc_id"],
        )

    except ValueError as e:
        # Invalid input or world not found
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Unexpected error
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@router.post("/preview-unified-mood", response_model=UnifiedMoodResponse)
async def preview_unified_mood(
    request: PreviewMoodRequest, db: AsyncSession = Depends(get_database)
):
    """
    Preview unified NPC mood (general + intimacy + active emotion).

    This endpoint mirrors preview-mood but returns richer data based on
    the unified mood evaluator. It is stateless and does not modify
    any game sessions.
    """
    try:
        payload: Dict[str, Any] = {
            "npc_id": request.npc_id,
        }

        if request.session_id:
            payload["session_id"] = request.session_id

        if request.relationship_values:
            payload["relationship_values"] = {
                "affinity": request.relationship_values.affinity,
                "trust": request.relationship_values.trust,
                "chemistry": request.relationship_values.chemistry,
                "tension": request.relationship_values.tension,
            }

        if request.emotional_state:
            payload["emotional_state"] = {
                "emotion": request.emotional_state.emotion,
                "intensity": request.emotional_state.intensity,
            }

        # Call unified evaluator
        result = await evaluate_unified_npc_mood(
            world_id=request.world_id,
            payload=payload,
            db=db,
        )

        # Pydantic will coerce the dict into UnifiedMoodResponse
        return UnifiedMoodResponse(**result)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")
