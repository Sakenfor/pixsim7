"""
Abstract stat system for flexible game mechanics.

Provides a generic framework for tracking and computing stats, tiers, and levels.
Replaces hardcoded relationship system with configurable stat definitions.
"""

from .schemas import (
    StatAxis,
    StatTier,
    StatLevel,
    StatDefinition,
    WorldStatsConfig,
)
from .engine import StatEngine

__all__ = [
    "StatAxis",
    "StatTier",
    "StatLevel",
    "StatDefinition",
    "WorldStatsConfig",
    "StatEngine",
]
