"""
Relationship Preview API

⚠️ DEPRECATED: This API is disabled and will be removed in a future version.

Use /api/v1/stats/preview-entity-stats instead.

MIGRATION:
    Old endpoint: POST /api/v1/game/relationships/preview-tier
    New endpoint: POST /api/v1/stats/preview-entity-stats

    Example migration:
        # Old request
        {
            "world_id": 1,
            "affinity": 75.0,
            "schema_key": "default"
        }

        # New request
        {
            "world_id": 1,
            "stat_definition_id": "relationships",
            "values": {
                "affinity": 75.0,
                "trust": 50.0,
                "chemistry": 50.0,
                "tension": 0.0
            }
        }

The new API:
- Works with any stat type (relationships, skills, reputation, etc.)
- Uses StatEngine and WorldStatsConfig
- Returns all computed tiers and levels in one call
- Supports automatic migration from legacy schemas

See pixsim7/backend/main/api/v1/stat_preview.py for the new implementation.
"""

from __future__ import annotations

from typing import Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_database
from pixsim7.backend.main.domain.metrics import (
    MetricType,
    get_metric_registry,
)

router = APIRouter()


# ===== Request/Response Models =====


class PreviewTierRequest(BaseModel):
    """Request for previewing relationship tier."""

    world_id: int
    affinity: float
    schema_key: Optional[str] = "default"


class PreviewTierResponse(BaseModel):
    """Response for relationship tier preview."""

    tier_id: Optional[str]
    schema_key: str
    affinity: float


class RelationshipValues(BaseModel):
    """Relationship values for intimacy computation."""

    affinity: float
    trust: float
    chemistry: float
    tension: float


class PreviewIntimacyRequest(BaseModel):
    """Request for previewing intimacy level."""

    world_id: int
    relationship_values: RelationshipValues


class PreviewIntimacyResponse(BaseModel):
    """Response for intimacy level preview."""

    intimacy_level_id: Optional[str]
    relationship_values: RelationshipValues


# ===== Endpoints =====


@router.post("/preview-tier", response_model=PreviewTierResponse)
async def preview_relationship_tier(
    request: PreviewTierRequest, db: AsyncSession = Depends(get_database)
):
    """
    Preview what relationship tier would result from a given affinity value.

    This endpoint is stateless and does not modify any game sessions.
    It uses world-specific relationship schemas if configured, otherwise
    falls back to hardcoded default tiers.

    Args:
        request: Preview request with world_id, affinity, and optional schema_key
        db: Database session (injected)

    Returns:
        Computed tier_id and echoed input values

    Raises:
        404: World not found
        400: Invalid request (missing fields, invalid types)
    """
    try:
        # Call evaluator via metric registry
        evaluator = get_metric_registry().get_evaluator(MetricType.RELATIONSHIP_TIER)
        result = await evaluator(
            world_id=request.world_id,
            payload={
                "affinity": request.affinity,
                "schema_key": request.schema_key,
            },
            db=db,
        )

        return PreviewTierResponse(**result)

    except ValueError as e:
        error_msg = str(e)
        if "World not found" in error_msg:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": "World not found",
                    "world_id": request.world_id,
                },
            )
        else:
            raise HTTPException(
                status_code=400,
                detail={"error": "Invalid request", "details": error_msg},
            )


@router.post("/preview-intimacy", response_model=PreviewIntimacyResponse)
async def preview_relationship_intimacy(
    request: PreviewIntimacyRequest, db: AsyncSession = Depends(get_database)
):
    """
    Preview what intimacy level would result from given relationship values.

    This endpoint is stateless and does not modify any game sessions.
    It uses world-specific intimacy schemas if configured, otherwise
    falls back to hardcoded default levels.

    Args:
        request: Preview request with world_id and relationship values
        db: Database session (injected)

    Returns:
        Computed intimacy_level_id and echoed input values

    Raises:
        404: World not found
        400: Invalid request (missing fields, invalid types)
    """
    try:
        # Call evaluator via metric registry
        evaluator = get_metric_registry().get_evaluator(
            MetricType.RELATIONSHIP_INTIMACY
        )
        result = await evaluator(
            world_id=request.world_id,
            payload={
                "relationship_values": {
                    "affinity": request.relationship_values.affinity,
                    "trust": request.relationship_values.trust,
                    "chemistry": request.relationship_values.chemistry,
                    "tension": request.relationship_values.tension,
                }
            },
            db=db,
        )

        return PreviewIntimacyResponse(
            intimacy_level_id=result["intimacy_level_id"],
            relationship_values=RelationshipValues(
                **result["relationship_values"]
            ),
        )

    except ValueError as e:
        error_msg = str(e)
        if "World not found" in error_msg:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": "World not found",
                    "world_id": request.world_id,
                },
            )
        else:
            raise HTTPException(
                status_code=400,
                detail={"error": "Invalid request", "details": error_msg},
            )
