"""
Metric registry for managing available metric evaluators.
"""

from typing import Dict, Callable, Any
from .types import MetricType, MetricEvaluator


class MetricRegistry:
    """Registry of available metric evaluators."""

    def __init__(self):
        self._evaluators: Dict[MetricType, MetricEvaluator] = {}

    def register(self, metric_type: MetricType, evaluator: MetricEvaluator):
        """Register an evaluator for a metric type."""
        self._evaluators[metric_type] = evaluator

    def get_evaluator(self, metric_type: MetricType) -> MetricEvaluator:
        """Get evaluator for a metric type."""
        if metric_type not in self._evaluators:
            raise ValueError(f"Unknown metric type: {metric_type}")
        return self._evaluators[metric_type]

    def list_metrics(self) -> list[MetricType]:
        """List all registered metric types."""
        return list(self._evaluators.keys())

    def is_registered(self, metric_type: MetricType) -> bool:
        """Check if a metric type is registered."""
        return metric_type in self._evaluators


# Global registry instance
_registry = MetricRegistry()


def get_metric_registry() -> MetricRegistry:
    """Get the global metric registry."""
    return _registry
