"""
Manager Interfaces - Protocol definitions for dependency injection.

These protocols define the contracts that managers must implement,
making it easy to swap implementations or create mocks for testing.
"""

from typing import Protocol, Optional, Dict, List, Callable
from pathlib import Path
from .types import (
    ServiceDefinition,
    ServiceState,
    ServiceStatus,
    HealthStatus,
    ProcessEvent,
    HealthEvent
)


class IProcessManager(Protocol):
    """
    Interface for process management.

    Defines the contract for starting, stopping, and monitoring service processes.
    """

    def start(self, service_key: str) -> bool:
        """
        Start a service.

        Args:
            service_key: Unique key identifying the service

        Returns:
            True if started successfully, False otherwise
        """
        ...

    def stop(self, service_key: str, graceful: bool = True) -> bool:
        """
        Stop a service.

        Args:
            service_key: Unique key identifying the service
            graceful: If True, attempt graceful shutdown before force kill

        Returns:
            True if stopped successfully, False otherwise
        """
        ...

    def restart(self, service_key: str) -> bool:
        """
        Restart a service.

        Args:
            service_key: Unique key identifying the service

        Returns:
            True if restarted successfully, False otherwise
        """
        ...

    def get_state(self, service_key: str) -> Optional[ServiceState]:
        """
        Get the current state of a service.

        Args:
            service_key: Unique key identifying the service

        Returns:
            ServiceState object or None if service not found
        """
        ...

    def get_all_states(self) -> Dict[str, ServiceState]:
        """
        Get states of all managed services.

        Returns:
            Dictionary mapping service keys to ServiceState objects
        """
        ...

    def is_running(self, service_key: str) -> bool:
        """
        Check if a service is currently running.

        Args:
            service_key: Unique key identifying the service

        Returns:
            True if service is running, False otherwise
        """
        ...

    def cleanup(self):
        """
        Clean up all processes and resources.

        Should be called on shutdown to ensure clean termination.
        """
        ...


class IHealthManager(Protocol):
    """
    Interface for health monitoring.

    Defines the contract for monitoring service health status.
    """

    def start(self):
        """Start health monitoring in background thread."""
        ...

    def stop(self, timeout: float = 5.0):
        """
        Stop health monitoring.

        Args:
            timeout: Maximum time to wait for thread to stop (seconds)
        """
        ...

    def is_running(self) -> bool:
        """
        Check if health monitoring is active.

        Returns:
            True if monitoring thread is running, False otherwise
        """
        ...


class ILogManager(Protocol):
    """
    Interface for log management.

    Defines the contract for managing service logs.
    """

    def append_log(self, service_key: str, line: str, stream: str = "OUT"):
        """
        Append a log line to a service's logs.

        Args:
            service_key: Unique key identifying the service
            line: Log line content
            stream: Stream name ("OUT" or "ERR")
        """
        ...

    def get_logs(
        self,
        service_key: str,
        filter_text: Optional[str] = None,
        filter_level: Optional[str] = None,
        max_lines: Optional[int] = None
    ) -> List[str]:
        """
        Get log lines for a service with optional filtering.

        Args:
            service_key: Unique key identifying the service
            filter_text: Optional text filter (case-insensitive)
            filter_level: Optional log level filter (ERROR, WARNING, etc.)
            max_lines: Maximum number of lines to return

        Returns:
            List of log lines
        """
        ...

    def clear_logs(self, service_key: str):
        """
        Clear logs for a service.

        Args:
            service_key: Unique key identifying the service
        """
        ...

    def start_monitoring(self):
        """Start monitoring log files for changes."""
        ...

    def stop_monitoring(self, timeout: float = 5.0):
        """
        Stop monitoring log files.

        Args:
            timeout: Maximum time to wait for thread to stop (seconds)
        """
        ...

    def is_monitoring(self) -> bool:
        """
        Check if log monitoring is active.

        Returns:
            True if monitoring, False otherwise
        """
        ...

    def get_log_file_path(self, service_key: str) -> Optional[Path]:
        """
        Get the path to a service's log file.

        Args:
            service_key: Unique key identifying the service

        Returns:
            Path object or None if service not found
        """
        ...


class IEventBus(Protocol):
    """
    Interface for event bus.

    Defines the contract for pub/sub event system.
    """

    def subscribe(self, event_type: str, handler: Callable):
        """
        Subscribe to an event type.

        Args:
            event_type: Type of event to subscribe to
            handler: Callback function to invoke when event occurs
        """
        ...

    def unsubscribe(self, event_type: str, handler: Callable):
        """
        Unsubscribe from an event type.

        Args:
            event_type: Type of event to unsubscribe from
            handler: Callback function to remove
        """
        ...

    def publish(self, event_type: str, data: any):
        """
        Publish an event to all subscribers.

        Args:
            event_type: Type of event
            data: Event data (ProcessEvent, HealthEvent, etc.)
        """
        ...

    def clear(self, event_type: Optional[str] = None):
        """
        Clear subscribers.

        Args:
            event_type: If provided, clear only this event type.
                       If None, clear all subscribers.
        """
        ...
