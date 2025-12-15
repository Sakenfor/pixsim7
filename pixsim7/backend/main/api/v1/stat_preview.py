"""
Generic Stat Preview API

Provides read-only preview endpoints for computing stat tiers and levels
based on world-specific stat configurations.

This is a generic replacement for the legacy relationship preview API.
Works with any stat type: relationships, skills, reputation, etc.

These endpoints are stateless and do not mutate game sessions.
"""

from __future__ import annotations

from typing import Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.api.dependencies import get_database
from pixsim7.backend.main.domain.game import GameWorld
from pixsim7.backend.main.domain.game.stats import StatEngine, WorldStatsConfig
from pixsim7.backend.main.domain.game.stats.migration import (
    migrate_world_meta_to_stats_config,
    needs_migration as needs_world_migration,
    get_default_relationship_definition,
)

router = APIRouter()


# ===== Request/Response Models =====


class PreviewEntityStatsRequest(BaseModel):
    """Request for previewing entity stats (normalized with tiers/levels)."""

    world_id: int
    stat_definition_id: str
    values: Dict[str, float]  # Map of axis_name -> value


class PreviewEntityStatsResponse(BaseModel):
    """Response for entity stats preview."""

    stat_definition_id: str
    normalized_stats: Dict[str, Any]  # Includes clamped values + computed tier/level IDs


# ===== Endpoints =====


@router.post("/preview-entity-stats", response_model=PreviewEntityStatsResponse)
async def preview_entity_stats(
    request: PreviewEntityStatsRequest, db: AsyncSession = Depends(get_database)
):
    """
    Preview what stat tiers and levels would result from given axis values.

    This endpoint is stateless and does not modify any game sessions.
    It uses world-specific stat configurations, with automatic migration
    from legacy schemas and fallback to defaults.

    Works with any stat type: relationships, skills, reputation, etc.

    Args:
        request: Preview request with world_id, stat_definition_id, and axis values
        db: Database session (injected)

    Returns:
        Normalized stats including clamped values, tier IDs, and level ID

    Raises:
        404: World not found
        400: Invalid request (missing fields, stat definition not found)

    Example for relationships:
        POST /preview-entity-stats
        {
            "world_id": 1,
            "stat_definition_id": "relationships",
            "values": {
                "affinity": 75.0,
                "trust": 60.0,
                "chemistry": 70.0,
                "tension": 10.0
            }
        }

        Response:
        {
            "stat_definition_id": "relationships",
            "normalized_stats": {
                "affinity": 75.0,
                "affinityTierId": "close_friend",
                "trust": 60.0,
                "chemistry": 70.0,
                "tension": 10.0,
                "levelId": "intimate"
            }
        }
    """
    try:
        # Load world
        result = await db.execute(
            select(GameWorld).where(GameWorld.id == request.world_id)
        )
        world = result.scalar_one_or_none()

        if not world:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": "World not found",
                    "world_id": request.world_id,
                },
            )

        # Get or migrate stats config
        world_meta = world.meta or {}
        stats_config: Optional[WorldStatsConfig] = None

        if needs_world_migration(world_meta):
            # Auto-migrate legacy schemas
            stats_config = migrate_world_meta_to_stats_config(world_meta)
        elif "stats_config" in world_meta:
            stats_config = WorldStatsConfig.model_validate(world_meta["stats_config"])
        else:
            # No config found - for relationships, use default
            if request.stat_definition_id == "relationships":
                stats_config = WorldStatsConfig(
                    version=1,
                    definitions={"relationships": get_default_relationship_definition()},
                )
            else:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "Stat definition not configured",
                        "stat_definition_id": request.stat_definition_id,
                        "world_id": request.world_id,
                    },
                )

        # Get stat definition
        stat_definition = stats_config.definitions.get(request.stat_definition_id)
        if not stat_definition:
            # For relationships, try default as fallback
            if request.stat_definition_id == "relationships":
                stat_definition = get_default_relationship_definition()
            else:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "Stat definition not found",
                        "stat_definition_id": request.stat_definition_id,
                        "available_definitions": list(stats_config.definitions.keys()),
                    },
                )

        # Normalize using StatEngine
        normalized_stats = StatEngine.normalize_entity_stats(
            request.values, stat_definition
        )

        return PreviewEntityStatsResponse(
            stat_definition_id=request.stat_definition_id,
            normalized_stats=normalized_stats,
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail={"error": "Invalid request", "details": str(e)},
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"error": "Internal server error", "details": str(e)},
        )
