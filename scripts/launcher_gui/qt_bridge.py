"""
Qt Bridge - Converts launcher_core events to Qt signals.

This bridge allows the Qt UI to work with the pure Python core managers
by converting their callback-based events into Qt signals that the UI can connect to.
"""

from PySide6.QtCore import QObject, Signal
from typing import Optional

try:
    from pixsim7.launcher_core import ProcessEvent, HealthEvent
    from pixsim7.launcher_core.types import HealthStatus
except ImportError:
    # For development/testing
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    from pixsim7.launcher_core import ProcessEvent, HealthEvent
    from pixsim7.launcher_core.types import HealthStatus


class QtEventBridge(QObject):
    """
    Bridge between launcher_core events and Qt signals.

    The core managers use simple callbacks, but Qt UI needs signals.
    This class subscribes to core events and re-emits them as Qt signals.
    """

    # Process events
    process_started = Signal(str, dict)  # (service_key, data)
    process_stopped = Signal(str, dict)  # (service_key, data)
    process_failed = Signal(str, str)    # (service_key, error)
    process_output = Signal(str, str)    # (service_key, output)

    # Health events
    health_update = Signal(str, object)  # (service_key, HealthStatus)

    # Log events
    log_line = Signal(str, str)          # (service_key, line)

    def __init__(self, parent: Optional[QObject] = None):
        super().__init__(parent)

    def on_process_event(self, event: ProcessEvent):
        """
        Handle process events from core manager.

        Converts ProcessEvent to appropriate Qt signal.
        """
        if event.event_type == "started":
            self.process_started.emit(event.service_key, event.data or {})
        elif event.event_type == "stopped":
            self.process_stopped.emit(event.service_key, event.data or {})
        elif event.event_type == "failed":
            error = event.data.get("error", "Unknown error") if event.data else "Unknown error"
            self.process_failed.emit(event.service_key, error)
        elif event.event_type == "output":
            output = event.data.get("output", "") if event.data else ""
            self.process_output.emit(event.service_key, output)

    def on_health_event(self, event: HealthEvent):
        """
        Handle health events from core manager.

        Converts HealthEvent to Qt signal.
        """
        self.health_update.emit(event.service_key, event.status)

    def on_log_line(self, service_key: str, line: str):
        """
        Handle log events from core manager.

        Converts log callback to Qt signal.
        """
        self.log_line.emit(service_key, line)
