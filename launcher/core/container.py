"""
Service Container - Dependency injection container for launcher.

Provides a central place to create and wire up all managers with their
dependencies, making it easy to configure and test the system.
"""

from typing import Optional, List
from pathlib import Path

from .types import ServiceDefinition, ServiceState
from .config import LauncherConfig, create_default_config
from .event_bus import EventBus, get_event_bus, Event, EventTypes
from .process_manager import ProcessManager
from .health_manager import HealthManager
from .log_manager import LogManager


class LauncherContainer:
    """
    Dependency injection container for launcher components.

    Centralized creation and wiring of all managers, making configuration
    and testing much easier.

    Example:
        ```python
        # Create container with services
        container = LauncherContainer(services)

        # Get managers (automatically wired up)
        process_mgr = container.get_process_manager()
        health_mgr = container.get_health_manager()
        log_mgr = container.get_log_manager()

        # Start everything
        container.start_all()

        # Use managers...

        # Stop everything
        container.stop_all()
        ```
    """

    def __init__(
        self,
        services: List[ServiceDefinition],
        config: Optional[LauncherConfig] = None,
        event_bus: Optional[EventBus] = None
    ):
        """
        Initialize the container.

        Args:
            services: List of service definitions to manage
            config: Optional configuration (uses defaults if not provided)
            event_bus: Optional event bus (uses global if not provided)
        """
        self.services = services
        self.config = config or create_default_config()
        self.event_bus = event_bus or get_event_bus()

        # Manager instances (created lazily)
        self._process_mgr: Optional[ProcessManager] = None
        self._health_mgr: Optional[HealthManager] = None
        self._log_mgr: Optional[LogManager] = None

        # Shared state dictionary (all managers reference the same states)
        self._states: Optional[dict] = None

    def get_process_manager(self) -> ProcessManager:
        """
        Get or create the process manager.

        Returns:
            ProcessManager instance
        """
        if self._process_mgr is None:
            self._process_mgr = ProcessManager(
                services=self.services,
                log_dir=self.config.process.log_dir,
                event_callback=self._on_process_event
            )
            # Share states with other managers
            self._states = self._process_mgr.states

        return self._process_mgr

    def get_health_manager(self) -> HealthManager:
        """
        Get or create the health manager.

        Returns:
            HealthManager instance
        """
        if self._health_mgr is None:
            # Ensure process manager exists first (creates states)
            process_mgr = self.get_process_manager()

            self._health_mgr = HealthManager(
                states=process_mgr.states,
                event_callback=self._on_health_event,
                interval_sec=self.config.health.base_interval,
                adaptive_enabled=self.config.health.adaptive_enabled,
                startup_interval=self.config.health.startup_interval,
                stable_interval=self.config.health.stable_interval
            )

        return self._health_mgr

    def get_log_manager(self) -> LogManager:
        """
        Get or create the log manager.

        Returns:
            LogManager instance
        """
        if self._log_mgr is None:
            # Ensure process manager exists first (creates states)
            process_mgr = self.get_process_manager()

            self._log_mgr = LogManager(
                states=process_mgr.states,
                log_dir=self.config.log.log_dir,
                max_log_lines=self.config.log.max_log_lines,
                monitor_interval=self.config.log.monitor_interval,
                log_callback=self._on_log_line
            )

        return self._log_mgr

    def get_event_bus(self) -> EventBus:
        """
        Get the event bus.

        Returns:
            EventBus instance
        """
        return self.event_bus

    def start_all(self):
        """
        Start all managers.

        This starts health monitoring and log monitoring.
        Process manager doesn't have a background thread, so no need to start it.
        """
        if self.config.auto_start_managers:
            health_mgr = self.get_health_manager()
            log_mgr = self.get_log_manager()

            if not health_mgr.is_running():
                health_mgr.start()

            if self.config.log.monitor_enabled and not log_mgr.is_monitoring():
                log_mgr.start_monitoring()

    def stop_all(self):
        """
        Stop all managers.

        Stops health and log monitoring, and optionally stops all services.
        """
        # Stop monitoring
        if self._health_mgr and self._health_mgr.is_running():
            self._health_mgr.stop()

        if self._log_mgr and self._log_mgr.is_monitoring():
            self._log_mgr.stop_monitoring()

        # Optionally stop all services
        if self.config.stop_services_on_exit and self._process_mgr:
            self._process_mgr.cleanup()

    def _on_process_event(self, event):
        """Publish process events to event bus."""
        # Convert ProcessEvent to Event
        from .types import ProcessEvent
        if isinstance(event, ProcessEvent):
            event_type = f"process.{event.event_type}"
            self.event_bus.publish_simple(
                event_type=event_type,
                source="ProcessManager",
                data=event
            )

    def _on_health_event(self, event):
        """Publish health events to event bus."""
        # Convert HealthEvent to Event
        from .types import HealthEvent
        if isinstance(event, HealthEvent):
            self.event_bus.publish_simple(
                event_type=EventTypes.HEALTH_UPDATE,
                source="HealthManager",
                data=event
            )

    def _on_log_line(self, service_key: str, line: str):
        """Publish log events to event bus."""
        self.event_bus.publish_simple(
            event_type=EventTypes.LOG_LINE,
            source="LogManager",
            data={'service_key': service_key, 'line': line}
        )

    def get_states(self) -> dict:
        """
        Get the shared service states dictionary.

        Returns:
            Dictionary mapping service keys to ServiceState objects
        """
        if self._states is None:
            # Force creation of process manager
            self.get_process_manager()
        return self._states

    def __enter__(self):
        """Context manager entry."""
        self.start_all()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.stop_all()
        return False


def create_container(
    services: List[ServiceDefinition],
    root_dir: Optional[Path] = None,
    config_overrides: Optional[dict] = None
) -> LauncherContainer:
    """
    Factory function to create a configured container.

    Args:
        services: List of service definitions
        root_dir: Project root directory
        config_overrides: Optional dict to override default config values

    Returns:
        Configured LauncherContainer

    Example:
        ```python
        services = [ServiceDefinition(...), ...]
        container = create_container(
            services,
            root_dir=Path('/path/to/project'),
            config_overrides={'health': {'base_interval': 1.0}}
        )

        with container:
            # Managers are started
            container.get_process_manager().start('backend')
            # ...
        # Managers are stopped automatically
        ```
    """
    config = create_default_config(root_dir)

    # Apply overrides
    if config_overrides:
        # Simple override: update config dict
        for section, values in config_overrides.items():
            if section == 'process':
                for k, v in values.items():
                    setattr(config.process, k, v)
            elif section == 'health':
                for k, v in values.items():
                    setattr(config.health, k, v)
            elif section == 'log':
                for k, v in values.items():
                    setattr(config.log, k, v)
            else:
                setattr(config, section, values)

    return LauncherContainer(services, config)
