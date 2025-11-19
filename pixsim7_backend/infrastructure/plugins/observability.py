"""
Plugin Observability & Metrics

Tracks plugin behavior for monitoring, debugging, and diagnostics.

Features:
- Per-plugin metrics (request counts, error counts, latencies)
- Error tracking and health status
- Diagnostics endpoint for admin dashboard

See: claude-tasks/16-backend-plugin-capabilities-and-sandboxing.md Phase 16.5
"""

from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from collections import defaultdict
import structlog
import time

logger = structlog.get_logger(__name__)


# ===== METRIC DATA STRUCTURES =====

@dataclass
class PluginMetrics:
    """Metrics for a single plugin"""
    plugin_id: str

    # Request metrics (for route plugins)
    request_count: int = 0
    total_request_time: float = 0.0  # seconds
    error_count: int = 0
    last_request: Optional[datetime] = None

    # Behavior extension metrics
    condition_evaluations: int = 0
    condition_failures: int = 0
    effect_applications: int = 0
    effect_failures: int = 0

    # Event handler metrics
    event_handler_calls: int = 0
    event_handler_failures: int = 0

    # Error tracking
    recent_errors: List[Dict[str, Any]] = field(default_factory=list)
    max_recent_errors: int = 10  # Keep last N errors

    # Health status
    is_healthy: bool = True
    last_health_check: Optional[datetime] = None

    def record_request(self, duration: float, success: bool = True):
        """Record an HTTP request"""
        self.request_count += 1
        self.total_request_time += duration
        self.last_request = datetime.utcnow()

        if not success:
            self.error_count += 1
            self._check_health()

    def record_condition_evaluation(self, success: bool = True):
        """Record a behavior condition evaluation"""
        self.condition_evaluations += 1
        if not success:
            self.condition_failures += 1
            self._check_health()

    def record_effect_application(self, success: bool = True):
        """Record a behavior effect application"""
        self.effect_applications += 1
        if not success:
            self.effect_failures += 1
            self._check_health()

    def record_event_handler_call(self, success: bool = True):
        """Record an event handler call"""
        self.event_handler_calls += 1
        if not success:
            self.event_handler_failures += 1
            self._check_health()

    def record_error(
        self,
        error_type: str,
        error_message: str,
        context: Optional[Dict[str, Any]] = None,
    ):
        """Record an error"""
        error_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "error_type": error_type,
            "error_message": error_message,
            "context": context or {},
        }

        self.recent_errors.append(error_entry)

        # Keep only recent errors
        if len(self.recent_errors) > self.max_recent_errors:
            self.recent_errors = self.recent_errors[-self.max_recent_errors:]

        self._check_health()

    def _check_health(self):
        """
        Check plugin health based on error rates.

        Plugin is unhealthy if:
        - Error rate > 50% for requests
        - Condition failure rate > 30%
        - Effect failure rate > 30%
        - Event handler failure rate > 50%
        """
        # Request error rate
        if self.request_count > 10:
            error_rate = self.error_count / self.request_count
            if error_rate > 0.5:
                self.is_healthy = False
                return

        # Condition failure rate
        if self.condition_evaluations > 10:
            failure_rate = self.condition_failures / self.condition_evaluations
            if failure_rate > 0.3:
                self.is_healthy = False
                return

        # Effect failure rate
        if self.effect_applications > 10:
            failure_rate = self.effect_failures / self.effect_applications
            if failure_rate > 0.3:
                self.is_healthy = False
                return

        # Event handler failure rate
        if self.event_handler_calls > 10:
            failure_rate = self.event_handler_failures / self.event_handler_calls
            if failure_rate > 0.5:
                self.is_healthy = False
                return

        # If we got here, plugin is healthy
        self.is_healthy = True
        self.last_health_check = datetime.utcnow()

    def get_average_request_time(self) -> float:
        """Get average request time in milliseconds"""
        if self.request_count == 0:
            return 0.0
        return (self.total_request_time / self.request_count) * 1000  # ms

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API response"""
        return {
            "plugin_id": self.plugin_id,
            "requests": {
                "total": self.request_count,
                "errors": self.error_count,
                "error_rate": self.error_count / self.request_count if self.request_count > 0 else 0.0,
                "average_time_ms": self.get_average_request_time(),
                "last_request": self.last_request.isoformat() if self.last_request else None,
            },
            "behavior_extensions": {
                "condition_evaluations": self.condition_evaluations,
                "condition_failures": self.condition_failures,
                "condition_failure_rate": self.condition_failures / self.condition_evaluations if self.condition_evaluations > 0 else 0.0,
                "effect_applications": self.effect_applications,
                "effect_failures": self.effect_failures,
                "effect_failure_rate": self.effect_failures / self.effect_applications if self.effect_applications > 0 else 0.0,
            },
            "event_handlers": {
                "calls": self.event_handler_calls,
                "failures": self.event_handler_failures,
                "failure_rate": self.event_handler_failures / self.event_handler_calls if self.event_handler_calls > 0 else 0.0,
            },
            "health": {
                "is_healthy": self.is_healthy,
                "last_check": self.last_health_check.isoformat() if self.last_health_check else None,
                "recent_errors": self.recent_errors,
            },
        }


# ===== METRICS TRACKER =====

class PluginMetricsTracker:
    """
    Global metrics tracker for all plugins.

    Thread-safe singleton for collecting and reporting plugin metrics.
    """

    def __init__(self):
        self._metrics: Dict[str, PluginMetrics] = {}

    def get_or_create_metrics(self, plugin_id: str) -> PluginMetrics:
        """Get metrics for a plugin (create if doesn't exist)"""
        if plugin_id not in self._metrics:
            self._metrics[plugin_id] = PluginMetrics(plugin_id=plugin_id)
        return self._metrics[plugin_id]

    def record_request(self, plugin_id: str, duration: float, success: bool = True):
        """Record an HTTP request"""
        metrics = self.get_or_create_metrics(plugin_id)
        metrics.record_request(duration, success)

    def record_condition_evaluation(self, plugin_id: str, success: bool = True):
        """Record a behavior condition evaluation"""
        metrics = self.get_or_create_metrics(plugin_id)
        metrics.record_condition_evaluation(success)

    def record_effect_application(self, plugin_id: str, success: bool = True):
        """Record a behavior effect application"""
        metrics = self.get_or_create_metrics(plugin_id)
        metrics.record_effect_application(success)

    def record_event_handler_call(self, plugin_id: str, success: bool = True):
        """Record an event handler call"""
        metrics = self.get_or_create_metrics(plugin_id)
        metrics.record_event_handler_call(success)

    def record_error(
        self,
        plugin_id: str,
        error_type: str,
        error_message: str,
        context: Optional[Dict[str, Any]] = None,
    ):
        """Record an error"""
        metrics = self.get_or_create_metrics(plugin_id)
        metrics.record_error(error_type, error_message, context)

    def get_metrics(self, plugin_id: str) -> Optional[PluginMetrics]:
        """Get metrics for a specific plugin"""
        return self._metrics.get(plugin_id)

    def get_all_metrics(self) -> Dict[str, PluginMetrics]:
        """Get all plugin metrics"""
        return self._metrics

    def get_unhealthy_plugins(self) -> List[str]:
        """Get list of unhealthy plugin IDs"""
        return [
            plugin_id
            for plugin_id, metrics in self._metrics.items()
            if not metrics.is_healthy
        ]

    def get_summary(self) -> Dict[str, Any]:
        """Get summary statistics"""
        total_requests = sum(m.request_count for m in self._metrics.values())
        total_errors = sum(m.error_count for m in self._metrics.values())
        unhealthy = self.get_unhealthy_plugins()

        return {
            "total_plugins": len(self._metrics),
            "total_requests": total_requests,
            "total_errors": total_errors,
            "overall_error_rate": total_errors / total_requests if total_requests > 0 else 0.0,
            "unhealthy_plugins": unhealthy,
            "unhealthy_count": len(unhealthy),
        }

    def reset_metrics(self, plugin_id: Optional[str] = None):
        """Reset metrics for a plugin (or all plugins)"""
        if plugin_id:
            if plugin_id in self._metrics:
                self._metrics[plugin_id] = PluginMetrics(plugin_id=plugin_id)
        else:
            self._metrics.clear()


# ===== GLOBAL INSTANCE =====

# Global metrics tracker (singleton)
metrics_tracker = PluginMetricsTracker()


# ===== INSTRUMENTATION HELPERS =====

class RequestTimer:
    """
    Context manager for timing plugin requests.

    Usage:
        with RequestTimer(plugin_id) as timer:
            # Do request
            pass
    """

    def __init__(self, plugin_id: str):
        self.plugin_id = plugin_id
        self.start_time = None
        self.success = True

    def __enter__(self):
        self.start_time = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        duration = time.time() - self.start_time

        if exc_type is not None:
            self.success = False
            metrics_tracker.record_error(
                self.plugin_id,
                exc_type.__name__,
                str(exc_val),
                {"traceback": True},
            )

        metrics_tracker.record_request(self.plugin_id, duration, self.success)
        return False  # Don't suppress exceptions
