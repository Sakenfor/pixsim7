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

__all__ = [
    "StatAxis",
    "StatTier",
    "StatLevel",
    "StatDefinition",
    "WorldStatsConfig",
    "StatEngine",
    "HasStats",
    "HasStatsWithMetadata",
]
