"""
Abstract stat system for flexible game mechanics.

Provides a generic framework for tracking and computing stats, tiers, and levels.
Replaces hardcoded relationship system with configurable stat definitions.

Supports:
- Session-owned stats (player's relationships, skills)
- Entity-owned stats (NPC attributes, item modifiers)
- Hybrid approach (base stats + session overrides)
- Equipment/buff/debuff modifiers
"""

from .schemas import (
    StatAxis,
    StatTier,
    StatLevel,
    StatDefinition,
    WorldStatsConfig,
)
from .engine import StatEngine
from .mixins import HasStats, HasStatsWithMetadata
from .migration import (
    get_default_relationship_definition,
    migrate_relationship_schemas_to_stat_definition,
    migrate_world_meta_to_stats_config,
    migrate_session_relationships_to_stats,
    needs_migration,
)

__all__ = [
    "StatAxis",
    "StatTier",
    "StatLevel",
    "StatDefinition",
    "WorldStatsConfig",
    "StatEngine",
    "HasStats",
    "HasStatsWithMetadata",
    # Migration utilities
    "get_default_relationship_definition",
    "migrate_relationship_schemas_to_stat_definition",
    "migrate_world_meta_to_stats_config",
    "migrate_session_relationships_to_stats",
    "needs_migration",
]
