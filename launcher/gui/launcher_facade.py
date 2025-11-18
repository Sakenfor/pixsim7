"""
Launcher Facade - Qt-friendly wrapper around launcher_core managers.

This facade provides a Qt-compatible interface to the pure Python core managers,
making integration with the existing Qt launcher seamless.
"""

import os
from typing import Dict, List, Optional
from pathlib import Path
from PySide6.QtCore import QObject

try:
    from .services import ServiceDef, build_services
    from .qt_bridge import QtEventBridge
    from .config import ROOT, UIState, load_ui_state
except ImportError:
    from services import ServiceDef, build_services
    from qt_bridge import QtEventBridge
    from config import ROOT, UIState, load_ui_state

try:
    from launcher.core import (
        ServiceDefinition,
        ProcessManager,
        HealthManager,
        LogManager,
    )
    from launcher.core.types import HealthStatus, ServiceStatus
except ImportError:
    # For development/testing
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    from launcher.core import (
        ServiceDefinition,
        ProcessManager,
        HealthManager,
        LogManager,
    )
    from launcher.core.types import HealthStatus, ServiceStatus


def convert_service_def(service_def: ServiceDef) -> ServiceDefinition:
    """
    Convert old ServiceDef to new ServiceDefinition.

    This allows existing service definitions to work with the new core.
    """
    # Handle special cases with custom handlers
    custom_start = None
    custom_stop = None
    custom_health = None
    is_detached = False

    if service_def.key == "db":
        # DB is detached (docker-compose runs in background)
        is_detached = True

        def db_start(state):
            """Custom start for docker-compose."""
            from launcher.core.types import ServiceStatus, HealthStatus
            try:
                from scripts.launcher_gui.docker_utils import compose_up_detached
                compose_file = os.path.join(ROOT, 'docker-compose.db-only.yml')
                ok, out = compose_up_detached(compose_file)
                if ok:
                    state.status = ServiceStatus.RUNNING
                    state.health = HealthStatus.STARTING
                    return True
                else:
                    state.status = ServiceStatus.FAILED
                    state.health = HealthStatus.UNHEALTHY
                    state.last_error = out.strip() if out else 'compose up failed'
                    return False
            except Exception as e:
                state.status = ServiceStatus.FAILED
                state.health = HealthStatus.UNHEALTHY
                state.last_error = str(e)
                return False

        def db_stop(state):
            """Custom stop for docker-compose."""
            from launcher.core.types import ServiceStatus, HealthStatus
            try:
                from scripts.launcher_gui.docker_utils import compose_down
                compose_file = os.path.join(ROOT, 'docker-compose.db-only.yml')
                ok, _ = compose_down(compose_file)
                state.status = ServiceStatus.STOPPED
                state.health = HealthStatus.STOPPED
                return ok
            except Exception:
                state.status = ServiceStatus.STOPPED
                state.health = HealthStatus.STOPPED
                return False

        def db_health(state):
            """Custom health check for docker-compose."""
            try:
                from scripts.launcher_gui.docker_utils import compose_ps
                compose_file = os.path.join(ROOT, 'docker-compose.db-only.yml')
                ok, stdout = compose_ps(compose_file)
                if ok and stdout:
                    out = stdout.lower()
                    return ' up ' in f" {out} " or 'running' in out
                return False
            except Exception:
                return False

        custom_start = db_start
        custom_stop = db_stop
        custom_health = db_health

    return ServiceDefinition(
        key=service_def.key,
        title=service_def.title,
        program=service_def.program,
        args=service_def.args,
        cwd=service_def.cwd,
        env_overrides=service_def.env_overrides,
        url=service_def.url,
        health_url=service_def.health_url,
        required_tool=service_def.required_tool,
        health_grace_attempts=service_def.health_grace_attempts,
        depends_on=service_def.depends_on,
        is_detached=is_detached,
        custom_start=custom_start,
        custom_stop=custom_stop,
        custom_health_check=custom_health,
    )


class LauncherFacade(QObject):
    """
    Qt-friendly facade for launcher_core managers.

    Provides the same interface the Qt UI expects, but uses core managers internally.
    This allows incremental migration from the old ServiceProcess to the new architecture.
    """

    def __init__(self, parent: Optional[QObject] = None):
        super().__init__(parent)

        # Load service definitions
        service_defs = build_services()
        core_services = [convert_service_def(sd) for sd in service_defs]

        # Create Qt event bridge
        self.bridge = QtEventBridge(self)

        # Initialize core managers
        log_dir = Path(ROOT) / 'data' / 'logs' / 'console'

        self.process_mgr = ProcessManager(
            core_services,
            log_dir=log_dir,
            event_callback=self.bridge.on_process_event
        )

        # Load UI state for health check settings
        ui_state = load_ui_state()

        self.health_mgr = HealthManager(
            self.process_mgr.states,
            event_callback=self.bridge.on_health_event,
            interval_sec=ui_state.health_check_interval,
            adaptive_enabled=ui_state.health_check_adaptive,
            startup_interval=ui_state.health_check_startup_interval,
            stable_interval=ui_state.health_check_stable_interval
        )

        self.log_mgr = LogManager(
            self.process_mgr.states,
            log_callback=self.bridge.on_log_line
        )

        # Keep reference to original service defs for UI
        self._service_defs = {sd.key: sd for sd in service_defs}

    def start_all_managers(self):
        """Start health and log monitoring."""
        if not self.health_mgr.is_running():
            self.health_mgr.start()
        if not self.log_mgr.is_monitoring():
            self.log_mgr.start_monitoring()

    def stop_all_managers(self):
        """Stop health and log monitoring."""
        self.health_mgr.stop()
        self.log_mgr.stop_monitoring()

    def start_service(self, service_key: str) -> bool:
        """Start a service."""
        return self.process_mgr.start(service_key)

    def stop_service(self, service_key: str, graceful: bool = True) -> bool:
        """Stop a service."""
        return self.process_mgr.stop(service_key, graceful=graceful)

    def restart_service(self, service_key: str) -> bool:
        """Restart a service."""
        return self.process_mgr.restart(service_key)

    def get_service_status(self, service_key: str) -> Optional[str]:
        """Get service status as string."""
        state = self.process_mgr.get_state(service_key)
        if not state:
            return None
        return state.status.value

    def get_service_health(self, service_key: str) -> Optional[HealthStatus]:
        """Get service health status."""
        state = self.process_mgr.get_state(service_key)
        if not state:
            return None
        return state.health

    def get_service_pid(self, service_key: str) -> Optional[int]:
        """Get service PID."""
        state = self.process_mgr.get_state(service_key)
        if not state:
            return None
        return state.pid or state.detected_pid

    def get_service_logs(
        self,
        service_key: str,
        filter_text: Optional[str] = None,
        filter_level: Optional[str] = None,
        max_lines: Optional[int] = None
    ) -> List[str]:
        """Get service logs with optional filtering."""
        return self.log_mgr.get_logs(
            service_key,
            filter_text=filter_text,
            filter_level=filter_level,
            max_lines=max_lines
        )

    def clear_service_logs(self, service_key: str):
        """Clear logs for a service."""
        self.log_mgr.clear_logs(service_key)

    def get_service_definition(self, service_key: str) -> Optional[ServiceDef]:
        """Get original service definition (for UI compatibility)."""
        return self._service_defs.get(service_key)

    def get_all_service_keys(self) -> List[str]:
        """Get list of all service keys."""
        return list(self._service_defs.keys())

    def is_running(self, service_key: str) -> bool:
        """Check if a service is running."""
        return self.process_mgr.is_running(service_key)

    def cleanup(self):
        """Clean up all managers and stop all services."""
        self.stop_all_managers()
        self.process_mgr.cleanup()

    # Qt Signal accessors (for easy connection in Qt UI)
    @property
    def process_started(self):
        """Signal: process_started(service_key: str, data: dict)"""
        return self.bridge.process_started

    @property
    def process_stopped(self):
        """Signal: process_stopped(service_key: str, data: dict)"""
        return self.bridge.process_stopped

    @property
    def process_failed(self):
        """Signal: process_failed(service_key: str, error: str)"""
        return self.bridge.process_failed

    @property
    def health_update(self):
        """Signal: health_update(service_key: str, status: HealthStatus)"""
        return self.bridge.health_update

    @property
    def log_line(self):
        """Signal: log_line(service_key: str, line: str)"""
        return self.bridge.log_line
