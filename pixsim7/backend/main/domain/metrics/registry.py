"""
Metric registry for managing available metric evaluators.

Uses shared SimpleRegistry for core functionality.
"""

from pixsim7.backend.main.lib.registry import SimpleRegistry, KeyNotFoundError
from .types import MetricType, MetricEvaluator


class MetricRegistry(SimpleRegistry[MetricType, MetricEvaluator]):
    """
    Registry of available metric evaluators.

    Built on SimpleRegistry for consistent registry behavior.
    """

    def __init__(self):
        super().__init__(name="MetricRegistry", log_operations=False)

    def get_evaluator(self, metric_type: MetricType) -> MetricEvaluator:
        """Get evaluator for a metric type."""
        try:
            return self.get(metric_type)
        except KeyNotFoundError:
            raise ValueError(f"Unknown metric type: {metric_type}")

    def list_metrics(self) -> list[MetricType]:
        """List all registered metric types."""
        return self.keys()

    def is_registered(self, metric_type: MetricType) -> bool:
        """Check if a metric type is registered."""
        return self.has(metric_type)


# Global registry instance
_registry = MetricRegistry()


def get_metric_registry() -> MetricRegistry:
    """Get the global metric registry."""
    return _registry
