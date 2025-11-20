"""
Reputation Preview API

Provides read-only preview endpoints for computing reputation bands
based on relationship data, faction standings, and world schemas.

These endpoints are stateless and do not mutate game sessions.
"""

from __future__ import annotations

from typing import Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_database
from pixsim7.backend.main.domain.metrics.reputation_evaluators import evaluate_reputation_band

router = APIRouter()


# ===== Request/Response Models =====


class PreviewReputationRequest(BaseModel):
    """Request for previewing reputation band."""

    world_id: int
    subject_id: int
    subject_type: str  # "player" or "npc"
    target_id: Optional[int] = None
    target_type: Optional[str] = None  # "npc", "faction", or "group"
    reputation_score: Optional[float] = None
    session_id: Optional[int] = None
    faction_membership: Optional[Dict[str, float]] = None


class PreviewReputationResponse(BaseModel):
    """Response for reputation band preview."""

    reputation_band: str
    reputation_score: float
    subject_id: int
    target_id: Optional[int] = None
    target_type: Optional[str] = None


# ===== Endpoints =====


@router.post("/preview-reputation", response_model=PreviewReputationResponse)
async def preview_reputation_band(
    request: PreviewReputationRequest, db: AsyncSession = Depends(get_database)
):
    """
    Preview what reputation band would result from a given reputation score or relationship.

    This endpoint is stateless and does not modify any game sessions.
    It uses world-specific reputation schemas if configured, otherwise
    falls back to hardcoded default bands (enemy/hostile/neutral/friendly/ally).

    Supports multiple reputation types:
    - Player-to-NPC: Based on relationship affinity or explicit reputation
    - NPC-to-NPC: Based on stored NPC-NPC relationship data
    - Faction-based: Based on faction membership and standings

    Default bands (0-100 scale):
    - enemy: 0-20
    - hostile: 20-40
    - neutral: 40-60
    - friendly: 60-80
    - ally: 80-100

    Args:
        request: Preview request with subject, target, and optional score/session
        db: Database session (injected)

    Returns:
        Computed reputation_band, reputation_score, and echoed input values

    Raises:
        404: World not found
        400: Invalid request (missing required fields, invalid types)
    """
    try:
        # Build payload for evaluator
        payload: Dict[str, Any] = {
            "subject_id": request.subject_id,
            "subject_type": request.subject_type,
        }

        if request.target_id is not None:
            payload["target_id"] = request.target_id
        if request.target_type:
            payload["target_type"] = request.target_type
        if request.reputation_score is not None:
            payload["reputation_score"] = request.reputation_score
        if request.session_id:
            payload["session_id"] = request.session_id
        if request.faction_membership:
            payload["faction_membership"] = request.faction_membership

        # Call evaluator
        result = await evaluate_reputation_band(
            world_id=request.world_id,
            payload=payload,
            db=db,
        )

        # Return response
        return PreviewReputationResponse(
            reputation_band=result["reputation_band"],
            reputation_score=result["reputation_score"],
            subject_id=result["subject_id"],
            target_id=result.get("target_id"),
            target_type=result.get("target_type"),
        )

    except ValueError as e:
        # Invalid input or world not found
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Unexpected error
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")
