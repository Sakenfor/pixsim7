"""
Behavior Registry Introspection API

Provides dynamic discovery of registered behavior extensions:
- Conditions (condition evaluators)
- Effects (effect handlers)
- Scoring factors

These endpoints allow UI/plugins to discover what behaviors are available
instead of hardcoding IDs in the frontend.

All responses use OpenAPI-typed Pydantic models for TS type generation.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()


# ==================
# Response Models
# ==================


class BehaviorConditionInfo(BaseModel):
    """Information about a registered behavior condition."""

    condition_id: str = Field(
        ...,
        description="Fully qualified condition ID (e.g., 'plugin:game-stealth:has_disguise')",
        examples=["evaluator:is_raining", "plugin:game-stealth:has_disguise"]
    )

    plugin_id: str = Field(
        ...,
        description="Plugin that registered this condition ('core' for built-ins)",
        examples=["core", "game-stealth"]
    )

    description: Optional[str] = Field(
        None,
        description="Human-readable description of what this condition checks",
        examples=["Check if it's currently raining"]
    )

    required_context: List[str] = Field(
        default_factory=list,
        description="Required context keys for this condition",
        examples=[["session_flags", "world_time"]]
    )

    params_schema: Optional[Dict[str, Any]] = Field(
        None,
        description="JSON Schema (Draft 7) for condition parameters",
        examples=[{
            "type": "object",
            "properties": {
                "questId": {"type": "string"}
            },
            "required": ["questId"]
        }]
    )


class BehaviorEffectInfo(BaseModel):
    """Information about a registered behavior effect."""

    effect_id: str = Field(
        ...,
        description="Fully qualified effect ID (e.g., 'effect:give_item', 'effect:plugin:game-romance:arousal_boost')",
        examples=["effect:give_item", "effect:plugin:game-romance:arousal_boost"]
    )

    plugin_id: str = Field(
        ...,
        description="Plugin that registered this effect ('core' for built-ins)",
        examples=["core", "game-romance"]
    )

    description: Optional[str] = Field(
        None,
        description="Human-readable description of what this effect does",
        examples=["Give an item to the player"]
    )

    default_params: Dict[str, Any] = Field(
        default_factory=dict,
        description="Default parameters for this effect",
        examples=[{"itemId": "", "quantity": 1}]
    )

    params_schema: Optional[Dict[str, Any]] = Field(
        None,
        description="JSON Schema (Draft 7) for effect parameters",
        examples=[{
            "type": "object",
            "properties": {
                "itemId": {"type": "string"},
                "quantity": {"type": "number", "minimum": 1}
            },
            "required": ["itemId"]
        }]
    )


class ScoringFactorInfo(BaseModel):
    """Information about a registered scoring factor."""

    factor_id: str = Field(
        ...,
        description="Scoring factor ID (e.g., 'activityPreference', 'plugin:custom_factor')",
        examples=["activityPreference", "categoryPreference", "plugin:my_plugin:weather_bonus"]
    )

    plugin_id: str = Field(
        ...,
        description="Plugin that registered this factor ('core' for built-ins)",
        examples=["core", "my_plugin"]
    )

    description: Optional[str] = Field(
        None,
        description="Human-readable description of what this factor scores",
        examples=["Activity-specific preference scoring factor"]
    )

    default_weight: float = Field(
        1.0,
        description="Default weight for this factor in scoring config",
        examples=[1.0, 0.8, 1.2]
    )

    params_schema: Optional[Dict[str, Any]] = Field(
        None,
        description="JSON Schema (Draft 7) for scoring factor parameters (optional, rarely used)",
        examples=[None]
    )


class BehaviorRegistryInfo(BaseModel):
    """Complete behavior registry information."""

    conditions: List[BehaviorConditionInfo] = Field(
        default_factory=list,
        description="All registered condition evaluators"
    )

    effects: List[BehaviorEffectInfo] = Field(
        default_factory=list,
        description="All registered effect handlers"
    )

    scoring_factors: List[ScoringFactorInfo] = Field(
        default_factory=list,
        description="All registered scoring factors"
    )


class BehaviorStatsInfo(BaseModel):
    """Behavior registry statistics."""

    locked: bool = Field(
        ...,
        description="Whether the registry is locked (no more registrations allowed)"
    )

    conditions_count: int = Field(
        ...,
        description="Total number of registered conditions",
        examples=[15]
    )

    effects_count: int = Field(
        ...,
        description="Total number of registered effects",
        examples=[8]
    )

    scoring_factors_count: int = Field(
        ...,
        description="Total number of registered scoring factors",
        examples=[7]
    )

    conditions_by_plugin: Dict[str, int] = Field(
        default_factory=dict,
        description="Condition counts by plugin",
        examples=[{"core": 12, "game-stealth": 3}]
    )

    effects_by_plugin: Dict[str, int] = Field(
        default_factory=dict,
        description="Effect counts by plugin",
        examples=[{"core": 5, "game-romance": 3}]
    )

    scoring_factors_by_plugin: Dict[str, int] = Field(
        default_factory=dict,
        description="Scoring factor counts by plugin",
        examples=[{"core": 7}]
    )


# ==================
# Endpoints
# ==================


@router.get("/conditions", response_model=List[BehaviorConditionInfo])
async def list_conditions() -> List[BehaviorConditionInfo]:
    """
    List all registered behavior conditions.

    Returns metadata about all condition evaluators registered by core
    and plugins, including parameter schemas for dynamic UI generation.

    Results are sorted by condition_id for stability.
    """
    from pixsim7.backend.main.infrastructure.plugins.behavior_registry import (
        behavior_registry
    )

    conditions = behavior_registry.list_conditions()

    # Sort by condition_id for deterministic ordering
    conditions_sorted = sorted(conditions, key=lambda c: c.condition_id)

    return [
        BehaviorConditionInfo(
            condition_id=c.condition_id,
            plugin_id=c.plugin_id,
            description=c.description,
            required_context=c.required_context,
            params_schema=c.params_schema,
        )
        for c in conditions_sorted
    ]


@router.get("/effects", response_model=List[BehaviorEffectInfo])
async def list_effects() -> List[BehaviorEffectInfo]:
    """
    List all registered behavior effects.

    Returns metadata about all effect handlers registered by core
    and plugins, including parameter schemas for dynamic UI generation.

    Results are sorted by effect_id for stability.
    """
    from pixsim7.backend.main.infrastructure.plugins.behavior_registry import (
        behavior_registry
    )

    effects = behavior_registry.list_effects()

    # Sort by effect_id for deterministic ordering
    effects_sorted = sorted(effects, key=lambda e: e.effect_id)

    return [
        BehaviorEffectInfo(
            effect_id=e.effect_id,
            plugin_id=e.plugin_id,
            description=e.description,
            default_params=e.default_params,
            params_schema=e.params_schema,
        )
        for e in effects_sorted
    ]


@router.get("/scoring-factors", response_model=List[ScoringFactorInfo])
async def list_scoring_factors() -> List[ScoringFactorInfo]:
    """
    List all registered scoring factors.

    Returns metadata about all scoring factors registered by core
    and plugins, including default weights and parameter schemas.

    Results are sorted by factor_id for stability.
    """
    from pixsim7.backend.main.infrastructure.plugins.behavior_registry import (
        behavior_registry
    )

    factors = behavior_registry.list_scoring_factors()

    # Sort by factor_id for deterministic ordering
    factors_sorted = sorted(factors, key=lambda f: f.factor_id)

    return [
        ScoringFactorInfo(
            factor_id=f.factor_id,
            plugin_id=f.plugin_id,
            description=f.description,
            default_weight=f.default_weight,
            params_schema=f.params_schema,
        )
        for f in factors_sorted
    ]


@router.get("/registry", response_model=BehaviorRegistryInfo)
async def get_registry() -> BehaviorRegistryInfo:
    """
    Get complete behavior registry information.

    Returns all conditions, effects, and scoring factors in a single response.
    This is a convenience endpoint that combines the three separate endpoints.

    All lists are sorted for stability.
    """
    from pixsim7.backend.main.infrastructure.plugins.behavior_registry import (
        behavior_registry
    )

    # Get all metadata
    conditions = behavior_registry.list_conditions()
    effects = behavior_registry.list_effects()
    scoring_factors = behavior_registry.list_scoring_factors()

    # Sort for deterministic ordering
    conditions_sorted = sorted(conditions, key=lambda c: c.condition_id)
    effects_sorted = sorted(effects, key=lambda e: e.effect_id)
    factors_sorted = sorted(scoring_factors, key=lambda f: f.factor_id)

    return BehaviorRegistryInfo(
        conditions=[
            BehaviorConditionInfo(
                condition_id=c.condition_id,
                plugin_id=c.plugin_id,
                description=c.description,
                required_context=c.required_context,
                params_schema=c.params_schema,
            )
            for c in conditions_sorted
        ],
        effects=[
            BehaviorEffectInfo(
                effect_id=e.effect_id,
                plugin_id=e.plugin_id,
                description=e.description,
                default_params=e.default_params,
                params_schema=e.params_schema,
            )
            for e in effects_sorted
        ],
        scoring_factors=[
            ScoringFactorInfo(
                factor_id=f.factor_id,
                plugin_id=f.plugin_id,
                description=f.description,
                default_weight=f.default_weight,
                params_schema=f.params_schema,
            )
            for f in factors_sorted
        ],
    )


@router.get("/stats", response_model=BehaviorStatsInfo)
async def get_stats() -> BehaviorStatsInfo:
    """
    Get behavior registry statistics.

    Returns counts and lock status for the behavior registry.
    Useful for debugging and monitoring.
    """
    from pixsim7.backend.main.infrastructure.plugins.behavior_registry import (
        behavior_registry
    )

    stats = behavior_registry.get_stats()

    return BehaviorStatsInfo(
        locked=stats["locked"],
        conditions_count=stats["conditions"]["total"],
        effects_count=stats["effects"]["total"],
        scoring_factors_count=len(behavior_registry.list_scoring_factors()),
        conditions_by_plugin=stats["conditions"]["by_plugin"],
        effects_by_plugin=stats["effects"]["by_plugin"],
        scoring_factors_by_plugin={},  # Not in stats yet, would need to add
    )
