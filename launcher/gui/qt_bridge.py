"""
Qt Bridge - Converts launcher_core events to Qt signals.

Thread-safe: all signal emissions are dispatched to the main thread
via internal signals with QueuedConnection, so callbacks from background
threads (HealthManager, ProcessManager stop threads) never deadlock.
"""

from PySide6.QtCore import QObject, Signal, Qt

try:
    from launcher.core import ProcessEvent, HealthEvent
    from launcher.core.types import HealthStatus
except ImportError:
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    from launcher.core import ProcessEvent, HealthEvent
    from launcher.core.types import HealthStatus


class QtEventBridge(QObject):
    """
    Bridge between launcher_core events and Qt signals.

    All public signals are emitted on the main thread regardless of
    which thread calls the on_* methods.
    """

    # Public signals (always emitted on main thread)
    process_started = Signal(str, dict)
    process_stopped = Signal(str, dict)
    process_failed = Signal(str, str)
    process_output = Signal(str, str)
    health_update = Signal(str, object)
    log_line = Signal(str, str)

    # Internal cross-thread relay signals
    _relay_process = Signal(str, str, object)   # (key, event_type, data)
    _relay_health = Signal(str, object)         # (key, status)
    _relay_log = Signal(str, str)               # (key, line)

    def __init__(self, parent=None):
        super().__init__(parent)
        # Connect internal relays to dispatch handlers on the main thread
        self._relay_process.connect(self._dispatch_process, Qt.QueuedConnection)
        self._relay_health.connect(self._dispatch_health, Qt.QueuedConnection)
        self._relay_log.connect(self._dispatch_log, Qt.QueuedConnection)

    # ── Callbacks (called from any thread) ──

    def on_process_event(self, event: ProcessEvent):
        self._relay_process.emit(event.service_key, event.event_type, event.data or {})

    def on_health_event(self, event: HealthEvent):
        self._relay_health.emit(event.service_key, event.status)

    def on_log_line(self, service_key: str, line: str):
        self._relay_log.emit(service_key, line)

    # ── Main-thread dispatchers ──

    def _dispatch_process(self, key: str, event_type: str, data: object):
        if event_type == "started":
            self.process_started.emit(key, data if isinstance(data, dict) else {})
        elif event_type == "stopped":
            self.process_stopped.emit(key, data if isinstance(data, dict) else {})
        elif event_type == "failed":
            error = data.get("error", "Unknown error") if isinstance(data, dict) else str(data)
            self.process_failed.emit(key, error)
        elif event_type == "output":
            output = data.get("output", "") if isinstance(data, dict) else str(data)
            self.process_output.emit(key, output)

    def _dispatch_health(self, key: str, status: object):
        self.health_update.emit(key, status)

    def _dispatch_log(self, key: str, line: str):
        self.log_line.emit(key, line)
