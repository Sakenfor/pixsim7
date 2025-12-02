"""
Metrics domain module for preview API and derived value computations.

This module provides a generic metric evaluation system for computing
derived values (relationship tiers, intimacy levels, NPC moods, etc.)
without mutating game state.
"""

from .types import MetricType
from .registry import MetricRegistry, get_metric_registry
from .mood_evaluators import evaluate_npc_mood
from .reputation_evaluators import evaluate_reputation_band


def _register_default_metrics() -> None:
    """
    Register built-in metric evaluators in the global registry.

    This makes it possible to look up evaluators by MetricType from any
    API route or service without hard-coding imports.
    """
    registry = get_metric_registry()

    if not registry.is_registered(MetricType.NPC_MOOD):
        registry.register(MetricType.NPC_MOOD, evaluate_npc_mood)

    if not registry.is_registered(MetricType.REPUTATION_BAND):
        registry.register(MetricType.REPUTATION_BAND, evaluate_reputation_band)


# Perform one-time registration on module import
_register_default_metrics()

__all__ = [
    "MetricType",
    "MetricRegistry",
    "get_metric_registry",
    "evaluate_npc_mood",
    "evaluate_reputation_band",
]
