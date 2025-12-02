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
# Legacy relationship migration helpers are kept in the migration module;
# only the default relationship definition is exported at the package level
# so the core API stays focused on generic stats.
from .migration import get_default_relationship_definition
from .package_utils import (
    initialize_stat_package_entity,
    merge_stat_package_entity,
    normalize_stat_package_entity,
    normalize_stat_package_all,
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
    # Relationship preset
    "get_default_relationship_definition",
    # Package-style helpers
    "initialize_stat_package_entity",
    "merge_stat_package_entity",
    "normalize_stat_package_entity",
    "normalize_stat_package_all",
]
