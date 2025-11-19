"""
Metrics domain module for preview API and derived value computations.

This module provides a generic metric evaluation system for computing
derived values (relationship tiers, intimacy levels, NPC moods, etc.)
without mutating game state.
"""

from .types import MetricType
from .registry import MetricRegistry, get_metric_registry
from .relationship_evaluators import (
    evaluate_relationship_tier,
    evaluate_relationship_intimacy,
)
from .mood_evaluators import (
    evaluate_npc_mood,
)
from .reputation_evaluators import (
    evaluate_reputation_band,
)

__all__ = [
    "MetricType",
    "MetricRegistry",
    "get_metric_registry",
    "evaluate_relationship_tier",
    "evaluate_relationship_intimacy",
    "evaluate_npc_mood",
    "evaluate_reputation_band",
]
