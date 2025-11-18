"""
Service Process Adapter - Compatibility layer for existing Qt UI.

Provides the same interface as the old ServiceProcess class,
but uses the new launcher_core managers internally.

This allows the Qt UI to work unchanged while using the new architecture.
"""

from typing import Optional, List
from PySide6.QtCore import QObject, Signal

try:
    from .services import ServiceDef
    from .launcher_facade import LauncherFacade
except ImportError:
    from services import ServiceDef
    from launcher_facade import LauncherFacade

try:
    from launcher.core.types import HealthStatus, ServiceStatus
except ImportError:
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    from launcher.core.types import HealthStatus, ServiceStatus


class ServiceProcessAdapter(QObject):
    """
    Adapter that makes launcher_core compatible with the old ServiceProcess interface.

    The Qt UI expects ServiceProcess objects with specific attributes and methods.
    This adapter provides that interface while delegating to the facade/core managers.
    """

    # Signals (for compatibility with old code that might use them)
    readyReadStandardOutput = Signal()
    readyReadStandardError = Signal()
    finished = Signal(int, object)
    errorOccurred = Signal(object)

    def __init__(self, defn: ServiceDef, facade: LauncherFacade):
        super().__init__()
        self.defn = defn
        self._facade = facade

        # Connect facade signals to update our state
        self._facade.health_update.connect(self._on_health_update)
        self._facade.process_started.connect(self._on_process_started)
        self._facade.process_stopped.connect(self._on_process_stopped)
        self._facade.process_failed.connect(self._on_process_failed)

    @property
    def running(self) -> bool:
        """Check if service is running."""
        return self._facade.is_running(self.defn.key)

    @running.setter
    def running(self, value: bool):
        """Set running state (for compatibility)."""
        # This is set by the core, so we just ignore direct sets
        pass

    @property
    def health_status(self) -> HealthStatus:
        """Get current health status."""
        health = self._facade.get_service_health(self.defn.key)
        return health if health else HealthStatus.STOPPED

    @health_status.setter
    def health_status(self, value: HealthStatus):
        """Set health status (for compatibility)."""
        # This is set by the health manager, so we ignore direct sets
        pass

    @property
    def tool_available(self) -> bool:
        """Check if required tools are available."""
        state = self._facade.process_mgr.get_state(self.defn.key)
        return state.tool_available if state else True

    @tool_available.setter
    def tool_available(self, value: bool):
        """Set tool availability (for compatibility)."""
        pass

    @property
    def tool_check_message(self) -> str:
        """Get tool check message."""
        state = self._facade.process_mgr.get_state(self.defn.key)
        return state.tool_check_message if state else ''

    @tool_check_message.setter
    def tool_check_message(self, value: str):
        """Set tool check message (for compatibility)."""
        pass

    @property
    def last_error_line(self) -> str:
        """Get last error line."""
        state = self._facade.process_mgr.get_state(self.defn.key)
        return state.last_error if state else ''

    @last_error_line.setter
    def last_error_line(self, value: str):
        """Set last error line (for compatibility)."""
        pass

    @property
    def log_buffer(self) -> List[str]:
        """Get log buffer."""
        return self._facade.get_service_logs(self.defn.key)

    @log_buffer.setter
    def log_buffer(self, value: List[str]):
        """Set log buffer (for compatibility)."""
        pass

    @property
    def detected_pid(self) -> Optional[int]:
        """Get detected PID."""
        return self._facade.get_service_pid(self.defn.key)

    @detected_pid.setter
    def detected_pid(self, value: Optional[int]):
        """Set detected PID (for compatibility)."""
        pass

    @property
    def started_pid(self) -> Optional[int]:
        """Get started PID (same as detected_pid)."""
        return self._facade.get_service_pid(self.defn.key)

    @started_pid.setter
    def started_pid(self, value: Optional[int]):
        """Set started PID (for compatibility)."""
        pass

    def check_tool_availability(self) -> bool:
        """Check if required tools are available."""
        return self._facade.process_mgr.check_tool_availability(self.defn.key)

    def start(self) -> bool:
        """Start the service."""
        return self._facade.start_service(self.defn.key)

    def stop(self, graceful: bool = True):
        """Stop the service."""
        return self._facade.stop_service(self.defn.key, graceful=graceful)

    def clear_logs(self):
        """Clear service logs."""
        self._facade.clear_service_logs(self.defn.key)

    # Event handlers
    def _on_health_update(self, service_key: str, status: HealthStatus):
        """Handle health update from facade."""
        if service_key == self.defn.key:
            # Health status is already updated via property
            pass

    def _on_process_started(self, service_key: str, data: dict):
        """Handle process started event."""
        if service_key == self.defn.key:
            # Running state is already updated via property
            pass

    def _on_process_stopped(self, service_key: str, data: dict):
        """Handle process stopped event."""
        if service_key == self.defn.key:
            # Running state is already updated via property
            # Emit finished signal for compatibility
            self.finished.emit(0, None)

    def _on_process_failed(self, service_key: str, error: str):
        """Handle process failed event."""
        if service_key == self.defn.key:
            # Error is already updated via property
            self.errorOccurred.emit(None)
