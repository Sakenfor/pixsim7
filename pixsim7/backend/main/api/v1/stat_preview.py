"""
Generic Stat Preview API

Provides read-only preview endpoints for computing stat tiers and levels
based on world-specific stat configurations.

This is a generic replacement for the legacy relationship preview API.
Works with any stat type: relationships, skills, reputation, etc.

These endpoints are stateless and do not mutate game sessions.
"""

from __future__ import annotations

from typing import Dict, Any, Optional, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.api.dependencies import get_database
from pixsim7.backend.main.domain.game import GameWorld
from pixsim7.backend.main.domain.game.stats import (
    StatEngine,
    WorldStatsConfig,
    get_derivation_engine,
    register_core_stat_packages,
)
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


class PreviewDerivedStatsRequest(BaseModel):
    """Request for previewing derived stat computation.

    Uses the DerivationEngine to compute derived stats from input values
    using semantic type mappings declared in stat packages.

    If world_id is 0 or omitted, uses default core packages (editor mode).
    If world_id is provided and exists, uses world's active packages.
    """

    world_id: Optional[int] = None  # 0 or None = use default core packages
    target_stat_id: str  # The derived stat to compute (e.g., "mood")
    input_values: Dict[str, Dict[str, float]]  # Map of stat_def_id -> {axis: value}
    package_ids: Optional[List[str]] = None  # Optional explicit package IDs (overrides world config)


class PreviewDerivedStatsResponse(BaseModel):
    """Response for derived stats preview."""

    target_stat_id: str
    derived_values: Dict[str, Any]  # The computed derived stat values (axes + label/levelId)
    input_axes: List[str]  # Input axes that contributed to derivation
    tiers: Dict[str, str] = {}  # Tier ID per axis (if computed)


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


@router.post("/preview-derived-stats", response_model=PreviewDerivedStatsResponse)
async def preview_derived_stats(
    request: PreviewDerivedStatsRequest, db: AsyncSession = Depends(get_database)
):
    """
    Preview derived stat computation using semantic derivation.

    This endpoint uses the DerivationEngine to compute derived stats
    (like mood) from input stat values (like relationships) using the
    semantic type mappings declared in registered stat packages.

    This is stateless and does not modify any game sessions. It's the
    authoritative way to preview what derived values the engine would
    compute for given inputs.

    **World Mode:**
    - If world_id is 0, None, or omitted: uses default core packages (editor mode)
    - If world_id is provided and exists: uses world's active packages

    **Package Selection:**
    - If package_ids is explicitly provided, those are used (overrides world config)
    - Otherwise, uses all registered core packages

    Args:
        request: Preview request with world_id, target stat, and input values
        db: Database session (injected)

    Returns:
        Derived stat values computed by the DerivationEngine, including:
        - derived_values: axis values + label/levelId
        - input_axes: actual input axes that contributed
        - tiers: per-axis tier IDs (if derivation computes them)

    Raises:
        404: World not found (only if world_id > 0)
        400: Invalid request or derivation not available

    Example for mood derivation:
        POST /preview-derived-stats
        {
            "world_id": 0,
            "target_stat_id": "mood",
            "input_values": {
                "relationships": {
                    "affinity": 75.0,
                    "trust": 60.0,
                    "chemistry": 70.0,
                    "tension": 10.0
                }
            }
        }

        Response:
        {
            "target_stat_id": "mood",
            "derived_values": {
                "valence": 72.5,
                "arousal": 60.0,
                "label": "happy"
            },
            "input_axes": [
                "core.relationships.relationships.affinity",
                "core.relationships.relationships.chemistry"
            ],
            "tiers": {
                "valence": "high",
                "arousal": "moderate"
            }
        }
    """
    from pixsim7.backend.main.domain.game.stats import list_stat_packages

    try:
        # Ensure core packages are registered
        register_core_stat_packages()

        # Determine if we're in editor/no-world mode
        world_id = request.world_id or 0
        world = None

        if world_id > 0:
            # Load world for world-specific package selection
            result = await db.execute(
                select(GameWorld).where(GameWorld.id == world_id)
            )
            world = result.scalar_one_or_none()

            if not world:
                raise HTTPException(
                    status_code=404,
                    detail={
                        "error": "World not found",
                        "world_id": world_id,
                    },
                )

        # Determine package IDs
        if request.package_ids:
            # Explicit package IDs override everything
            package_ids = request.package_ids
        elif world:
            # Try to get packages from world config
            # For now, use all registered packages (world-specific filtering TBD)
            package_ids = list(list_stat_packages().keys())
        else:
            # Editor mode: use all registered core packages
            package_ids = list(list_stat_packages().keys())

        # Use derivation engine to compute derived stats
        engine = get_derivation_engine()

        # Compute derivations - the engine returns DerivationResult with sources
        derived_results = engine.compute_derivations(
            stat_values=request.input_values,
            package_ids=package_ids,
        )

        # Check if target stat was derived
        if request.target_stat_id not in derived_results:
            available_inputs = list(request.input_values.keys())
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "Derivation not available",
                    "target_stat_id": request.target_stat_id,
                    "available_inputs": available_inputs,
                    "derived_stats": list(derived_results.keys()) if derived_results else [],
                    "packages_used": package_ids,
                    "hint": (
                        f"No derivation found for '{request.target_stat_id}' "
                        f"from inputs: {available_inputs}. Ensure the required "
                        "semantic types are available in the input stats."
                    ),
                },
            )

        # Get the derived values for target stat
        target_values = derived_results[request.target_stat_id]

        # Build input_axes list from the actual inputs provided
        input_axes: List[str] = []
        for stat_id, values in request.input_values.items():
            for axis_name in values.keys():
                input_axes.append(f"{stat_id}.{axis_name}")

        # Extract tiers if the derivation computed them
        # Derived values may contain tier info as {axis}_tier keys
        tiers: Dict[str, str] = {}
        derived_values_clean: Dict[str, Any] = {}

        for key, value in target_values.items():
            if key.endswith("_tier") and isinstance(value, str):
                # Extract tier: "valence_tier" -> tiers["valence"] = value
                axis_name = key[:-5]  # Remove "_tier" suffix
                tiers[axis_name] = value
            else:
                derived_values_clean[key] = value

        return PreviewDerivedStatsResponse(
            target_stat_id=request.target_stat_id,
            derived_values=derived_values_clean,
            input_axes=input_axes,
            tiers=tiers,
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
