"""
Migration utilities for converting legacy relationship schemas to abstract stat system.

Handles:
- Converting WorldMetaSchemas (relationship_schemas, intimacy_schema) -> WorldStatsConfig
- Converting GameSession.relationships -> GameSession.stats["relationships"]
"""

from typing import Dict, Any, List, Optional
from .schemas import (
    StatAxis,
    StatTier,
    StatLevel,
    StatDefinition,
    StatCondition,
    WorldStatsConfig,
)


def migrate_relationship_tiers_to_stat_tiers(
    relationship_tiers: List[Dict[str, Any]],
    axis_name: str = "affinity"
) -> List[StatTier]:
    """
    Convert legacy relationship tier definitions to StatTier format.

    Args:
        relationship_tiers: List of tier dicts from old relationship_schemas
        axis_name: Which axis these tiers apply to (default: "affinity")

    Returns:
        List of StatTier objects

    Example:
        Input: [{"id": "friend", "min": 40, "max": 69}, ...]
        Output: [StatTier(id="friend", axis_name="affinity", min=40, max=69), ...]
    """
    return [
        StatTier(
            id=tier.get("id"),
            axis_name=axis_name,
            min=float(tier.get("min", 0)),
            max=float(tier.get("max")) if tier.get("max") is not None else None,
        )
        for tier in relationship_tiers
    ]


def migrate_intimacy_level_to_stat_level(intimacy_level: Dict[str, Any]) -> StatLevel:
    """
    Convert legacy intimacy level definition to StatLevel format.

    Args:
        intimacy_level: Level dict from old intimacy_schema

    Returns:
        StatLevel object

    Example:
        Input: {"id": "intimate", "minAffinity": 70, "minTrust": 60, "minChemistry": 50}
        Output: StatLevel(
            id="intimate",
            conditions={
                "affinity": StatCondition(type="min", min_value=70),
                "trust": StatCondition(type="min", min_value=60),
                "chemistry": StatCondition(type="min", min_value=50)
            }
        )
    """
    conditions = {}

    # Map legacy field names to axis names
    field_mapping = {
        "minAffinity": ("affinity", "min"),
        "maxAffinity": ("affinity", "max"),
        "minTrust": ("trust", "min"),
        "maxTrust": ("trust", "max"),
        "minChemistry": ("chemistry", "min"),
        "maxChemistry": ("chemistry", "max"),
        "minTension": ("tension", "min"),
        "maxTension": ("tension", "max"),
    }

    # Group by axis
    axis_conditions: Dict[str, Dict[str, float]] = {}
    for field_name, value in intimacy_level.items():
        if field_name == "id":
            continue
        if field_name in field_mapping and value is not None:
            axis_name, cond_type = field_mapping[field_name]
            if axis_name not in axis_conditions:
                axis_conditions[axis_name] = {}
            axis_conditions[axis_name][cond_type] = float(value)

    # Create StatCondition for each axis
    for axis_name, conds in axis_conditions.items():
        has_min = "min" in conds
        has_max = "max" in conds

        if has_min and has_max:
            conditions[axis_name] = StatCondition(
                type="range",
                min_value=conds["min"],
                max_value=conds["max"]
            )
        elif has_min:
            conditions[axis_name] = StatCondition(
                type="min",
                min_value=conds["min"]
            )
        elif has_max:
            conditions[axis_name] = StatCondition(
                type="max",
                max_value=conds["max"]
            )

    return StatLevel(
        id=intimacy_level["id"],
        conditions=conditions,
        priority=0  # All legacy levels have same priority
    )


def migrate_relationship_schemas_to_stat_definition(
    relationship_schemas: Dict[str, List[Dict[str, Any]]],
    intimacy_schema: Optional[Dict[str, Any]] = None
) -> StatDefinition:
    """
    Convert legacy relationship schemas to a StatDefinition.

    Args:
        relationship_schemas: Old relationship_schemas from WorldMetaSchemas
        intimacy_schema: Old intimacy_schema from WorldMetaSchemas

    Returns:
        StatDefinition for "relationships"

    Example:
        Creates a StatDefinition with:
        - axes: affinity, trust, chemistry, tension (all 0-100)
        - tiers: from relationship_schemas["default"]
        - levels: from intimacy_schema["levels"]
    """
    # Define standard relationship axes
    axes = [
        StatAxis(
            name="affinity",
            min_value=0.0,
            max_value=100.0,
            default_value=0.0,
            display_name="Affinity",
            description="Overall fondness and attraction"
        ),
        StatAxis(
            name="trust",
            min_value=0.0,
            max_value=100.0,
            default_value=0.0,
            display_name="Trust",
            description="Reliability and confidence"
        ),
        StatAxis(
            name="chemistry",
            min_value=0.0,
            max_value=100.0,
            default_value=0.0,
            display_name="Chemistry",
            description="Physical and emotional compatibility"
        ),
        StatAxis(
            name="tension",
            min_value=0.0,
            max_value=100.0,
            default_value=0.0,
            display_name="Tension",
            description="Unresolved emotional energy"
        ),
    ]

    # Convert tiers from "default" schema
    tiers: List[StatTier] = []
    if relationship_schemas and "default" in relationship_schemas:
        tiers = migrate_relationship_tiers_to_stat_tiers(
            relationship_schemas["default"],
            axis_name="affinity"  # Tiers apply to affinity axis
        )

    # Convert intimacy levels
    levels: List[StatLevel] = []
    if intimacy_schema and "levels" in intimacy_schema:
        levels = [
            migrate_intimacy_level_to_stat_level(level)
            for level in intimacy_schema["levels"]
        ]

    return StatDefinition(
        id="relationships",
        display_name="Relationships",
        description="NPC relationship tracking with affinity, trust, chemistry, and tension",
        axes=axes,
        tiers=tiers,
        levels=levels,
    )


def migrate_world_meta_to_stats_config(world_meta: Dict[str, Any]) -> WorldStatsConfig:
    """
    Convert legacy WorldMetaSchemas to WorldStatsConfig.

    Args:
        world_meta: GameWorld.meta dict with legacy schemas

    Returns:
        WorldStatsConfig with migrated stat definitions

    Example:
        Input: {
            "relationship_schemas": {"default": [...]},
            "intimacy_schema": {"levels": [...]},
            ...other fields...
        }
        Output: WorldStatsConfig(
            definitions={
                "relationships": StatDefinition(...)
            }
        )
    """
    definitions = {}

    # Migrate relationship schemas if present
    relationship_schemas = world_meta.get("relationship_schemas")
    intimacy_schema = world_meta.get("intimacy_schema")

    if relationship_schemas or intimacy_schema:
        definitions["relationships"] = migrate_relationship_schemas_to_stat_definition(
            relationship_schemas or {},
            intimacy_schema
        )

    # Future: Could migrate other stat types here (reputation, mood, etc.)

    return WorldStatsConfig(
        version=1,
        definitions=definitions
    )


def migrate_session_relationships_to_stats(
    session_relationships: Dict[str, Any]
) -> Dict[str, Dict[str, Any]]:
    """
    Convert legacy GameSession.relationships to GameSession.stats format.

    Args:
        session_relationships: Old relationships dict

    Returns:
        New stats dict with relationships nested under "relationships" key

    Example:
        Input: {
            "npc:1": {"affinity": 75, "trust": 60, "tierId": "friend", "intimacyLevelId": "intimate"},
            "npc:2": {"affinity": 40}
        }
        Output: {
            "relationships": {
                "npc:1": {"affinity": 75, "trust": 60, "affinityTierId": "friend", "levelId": "intimate"},
                "npc:2": {"affinity": 40}
            }
        }

    Note: Field names are updated:
    - tierId -> affinityTierId (since tiers are axis-specific now)
    - intimacyLevelId -> levelId (generic name for multi-axis levels)
    """
    stats = {"relationships": {}}

    for entity_id, entity_data in session_relationships.items():
        migrated_entity = dict(entity_data)

        # Rename legacy computed fields
        if "tierId" in migrated_entity:
            migrated_entity["affinityTierId"] = migrated_entity.pop("tierId")
        if "intimacyLevelId" in migrated_entity:
            migrated_entity["levelId"] = migrated_entity.pop("intimacyLevelId")

        stats["relationships"][entity_id] = migrated_entity

    return stats


def get_default_relationship_definition() -> StatDefinition:
    """
    Get the default relationship StatDefinition that matches the legacy hardcoded system.

    This provides a sensible default for games that want standard relationship tracking
    without needing to define custom schemas.

    Returns:
        StatDefinition with:
        - 4 axes: affinity, trust, chemistry, tension (0-100)
        - 5 tiers: stranger, acquaintance, friend, close_friend, lover
        - 5 levels: light_flirt, deep_flirt, intimate, very_intimate, soulmates

    Usage:
        # In GameWorld.meta
        world.meta = {
            "stats_config": {
                "version": 1,
                "definitions": {
                    "relationships": get_default_relationship_definition().dict()
                }
            }
        }
    """
    return StatDefinition(
        id="relationships",
        display_name="Relationships",
        description="NPC relationship tracking with affinity, trust, chemistry, and tension",
        axes=[
            StatAxis(
                name="affinity",
                min_value=0.0,
                max_value=100.0,
                default_value=0.0,
                display_name="Affinity",
                description="Overall fondness and attraction",
                semantic_type="positive_sentiment",
                semantic_weight=1.0,
            ),
            StatAxis(
                name="trust",
                min_value=0.0,
                max_value=100.0,
                default_value=0.0,
                display_name="Trust",
                description="Reliability and confidence",
                semantic_type="trust_indicator",
                semantic_weight=1.0,
            ),
            StatAxis(
                name="chemistry",
                min_value=0.0,
                max_value=100.0,
                default_value=0.0,
                display_name="Chemistry",
                description="Physical and emotional compatibility",
                semantic_type="arousal_source",
                semantic_weight=1.0,
            ),
            StatAxis(
                name="tension",
                min_value=0.0,
                max_value=100.0,
                default_value=0.0,
                display_name="Tension",
                description="Unresolved emotional energy",
                semantic_type="negative_sentiment",
                semantic_weight=1.0,
            ),
        ],
        tiers=[
            # Affinity tiers (matching legacy defaults)
            StatTier(id="stranger", axis_name="affinity", min=0.0, max=9.99),
            StatTier(id="acquaintance", axis_name="affinity", min=10.0, max=29.99),
            StatTier(id="friend", axis_name="affinity", min=30.0, max=59.99),
            StatTier(id="close_friend", axis_name="affinity", min=60.0, max=79.99),
            StatTier(id="lover", axis_name="affinity", min=80.0, max=None),  # No upper bound
        ],
        levels=[
            # Multi-axis intimacy levels (matching legacy defaults)
            StatLevel(
                id="light_flirt",
                conditions={
                    "affinity": StatCondition(type="min", min_value=20.0),
                    "chemistry": StatCondition(type="min", min_value=20.0),
                },
                priority=1
            ),
            StatLevel(
                id="deep_flirt",
                conditions={
                    "affinity": StatCondition(type="min", min_value=40.0),
                    "chemistry": StatCondition(type="min", min_value=40.0),
                    "trust": StatCondition(type="min", min_value=20.0),
                },
                priority=2
            ),
            StatLevel(
                id="intimate",
                conditions={
                    "affinity": StatCondition(type="min", min_value=60.0),
                    "chemistry": StatCondition(type="min", min_value=60.0),
                    "trust": StatCondition(type="min", min_value=40.0),
                },
                priority=3
            ),
            StatLevel(
                id="very_intimate",
                conditions={
                    "affinity": StatCondition(type="min", min_value=80.0),
                    "chemistry": StatCondition(type="min", min_value=80.0),
                    "trust": StatCondition(type="min", min_value=60.0),
                },
                priority=4
            ),
            StatLevel(
                id="soulmates",
                conditions={
                    "affinity": StatCondition(type="min", min_value=95.0),
                    "chemistry": StatCondition(type="min", min_value=95.0),
                    "trust": StatCondition(type="min", min_value=90.0),
                    "tension": StatCondition(type="max", max_value=10.0),  # Low tension
                },
                priority=5
            ),
        ],
    )


def needs_migration(world_meta: Dict[str, Any]) -> bool:
    """
    Check if world meta needs migration to new stat system.

    Returns:
        True if world has legacy relationship_schemas/intimacy_schema but no stats_config
    """
    has_legacy = (
        "relationship_schemas" in world_meta or
        "intimacy_schema" in world_meta
    )
    has_new = "stats_config" in world_meta

    return has_legacy and not has_new
