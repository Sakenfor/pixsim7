"""
World-agnostic helpers for treating a StatDefinition as a reusable
“stat package”. These utilities wrap StatEngine with a small, focused
API that tools, tests, or editors can call without needing a GameWorld
or database session.

The idea is that a game maker or editor can:
- Define one or more StatDefinition objects (e.g., relationships, skills)
- Use these helpers to initialize, merge, and normalize stat data
  for arbitrary entities (NPCs, items, players, etc.)

Other systems that behave like packages can follow a similar pattern:
small, world-agnostic helpers around their core engine types.
"""

from __future__ import annotations

from typing import Dict, Any

from .engine import StatEngine
from .schemas import StatDefinition


def initialize_stat_package_entity(stat_definition: StatDefinition) -> Dict[str, float]:
    """
    Initialize a single entity's stats for this package using
    default axis values from the StatDefinition.

    This is a thin wrapper around StatEngine.initialize_entity_stats.
    """
    return StatEngine.initialize_entity_stats(stat_definition)


def merge_stat_package_entity(
    base_stats: Dict[str, Any],
    override_stats: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """
    Merge base and override stats for a single entity within a stat package.

    This is a thin wrapper around StatEngine.merge_entity_stats and is
    useful for tools that want to apply temporary overrides (e.g. editor
    sliders) without mutating the base data.
    """
    return StatEngine.merge_entity_stats(base_stats, override_stats)


def normalize_stat_package_entity(
    entity_stats: Dict[str, Any],
    stat_definition: StatDefinition,
) -> Dict[str, Any]:
    """
    Normalize a single entity's stats for this package.

    Applies clamping, tier computation, and level computation using the
    provided StatDefinition. This is equivalent to calling
    StatEngine.normalize_entity_stats directly.
    """
    return StatEngine.normalize_entity_stats(entity_stats, stat_definition)


def normalize_stat_package_all(
    all_stats: Dict[str, Dict[str, Any]],
    stat_definition: StatDefinition,
) -> Dict[str, Dict[str, Any]]:
    """
    Normalize stats for all entities in a package in one call.

    This is a thin wrapper around StatEngine.normalize_all_stats and is
    convenient for tests, tools, or offline batch processing that work
    purely with in-memory data structures.
    """
    return StatEngine.normalize_all_stats(all_stats, stat_definition)

