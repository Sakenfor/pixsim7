"""
Bridge between the old PySide6 GUI and the Launcher API.

Provides adapter classes that wrap the GUI's ServiceProcess objects so they
look like core.ProcessManager / core.LogManager to the API routes.  This
lets the API read live state from the GUI and dispatch commands back to it.

Usage (in LauncherWindow.__init__):
    from .api_bridge import start_embedded_api
    self._api_cleanup = start_embedded_api(self)
"""

from __future__ import annotations

import os
import threading
import time
from pathlib import Path
from typing import Dict, List, Optional, Callable

from launcher.core.types import (
    ServiceDefinition, ServiceState, ServiceStatus,
    HealthStatus, ProcessEvent, HealthEvent,
)
from launcher.core.event_bus import EventBus, get_event_bus, EventTypes


# ---------------------------------------------------------------------------
# Adapters — make GUI objects look like core managers to the API routes
# ---------------------------------------------------------------------------

class GUIServiceStateView(ServiceState):
    """Read-only view of a GUI ServiceProcess as a core ServiceState."""

    def __init__(self, sp):
        # Build a ServiceDefinition from the GUI's ServiceDef
        defn = sp.defn
        definition = ServiceDefinition(
            key=defn.key,
            title=defn.title,
            program=getattr(defn, "program", ""),
            args=getattr(defn, "args", []),
            cwd=getattr(defn, "cwd", ""),
            url=getattr(defn, "url", None),
            health_url=getattr(defn, "health_url", None),
            health_grace_attempts=getattr(defn, "health_grace_attempts", 5),
            depends_on=getattr(defn, "depends_on", None),
        )
        # Don't call super().__init__; we proxy all attributes live.
        object.__setattr__(self, "_sp", sp)
        object.__setattr__(self, "definition", definition)
        object.__setattr__(self, "max_log_lines", 5000)
        object.__setattr__(self, "failure_count", 0)

    # ── Proxied properties (always read live from ServiceProcess) ──

    @property
    def status(self) -> ServiceStatus:
        sp = object.__getattribute__(self, "_sp")
        if sp.running:
            return ServiceStatus.RUNNING
        if getattr(sp, "requested_running", False):
            return ServiceStatus.STARTING
        return ServiceStatus.STOPPED

    @status.setter
    def status(self, value):
        pass  # read-only from API side

    @property
    def health(self) -> HealthStatus:
        sp = object.__getattribute__(self, "_sp")
        return getattr(sp, "health_status", HealthStatus.UNKNOWN)

    @health.setter
    def health(self, value):
        pass

    @property
    def pid(self) -> Optional[int]:
        sp = object.__getattribute__(self, "_sp")
        return (getattr(sp, "started_pid", None)
                or getattr(sp, "detected_pid", None)
                or getattr(sp, "persisted_pid", None))

    @pid.setter
    def pid(self, value):
        pass

    @property
    def detected_pid(self) -> Optional[int]:
        sp = object.__getattribute__(self, "_sp")
        return getattr(sp, "detected_pid", None)

    @detected_pid.setter
    def detected_pid(self, value):
        pass

    @property
    def last_error(self) -> str:
        sp = object.__getattribute__(self, "_sp")
        return getattr(sp, "last_error_line", "")

    @last_error.setter
    def last_error(self, value):
        pass

    @property
    def tool_available(self) -> bool:
        sp = object.__getattribute__(self, "_sp")
        return getattr(sp, "tool_available", True)

    @tool_available.setter
    def tool_available(self, value):
        pass

    @property
    def tool_check_message(self) -> str:
        sp = object.__getattribute__(self, "_sp")
        return getattr(sp, "tool_check_message", "")

    @tool_check_message.setter
    def tool_check_message(self, value):
        pass

    @property
    def externally_managed(self) -> bool:
        sp = object.__getattribute__(self, "_sp")
        return getattr(sp, "externally_managed", False)

    @externally_managed.setter
    def externally_managed(self, value):
        pass

    @property
    def requested_running(self) -> bool:
        sp = object.__getattribute__(self, "_sp")
        return getattr(sp, "requested_running", False)

    @requested_running.setter
    def requested_running(self, value):
        pass

    @property
    def log_buffer(self) -> list:
        sp = object.__getattribute__(self, "_sp")
        buf = getattr(sp, "log_buffer", [])
        try:
            return list(buf)  # snapshot to avoid concurrent-deque issues
        except Exception:
            return []

    @log_buffer.setter
    def log_buffer(self, value):
        pass


class GUIProcessAdapter:
    """
    Adapter that makes the GUI's Dict[str, ServiceProcess] look like
    a core ProcessManager to the API routes.

    Read operations proxy live state.  Write operations (start/stop/restart)
    are dispatched to the GUI via a callback that runs on the Qt main thread.
    """

    def __init__(
        self,
        processes: Dict[str, object],
        *,
        start_fn: Callable[[str], bool],
        stop_fn: Callable[[str, bool], bool],
        restart_fn: Callable[[str], bool],
        event_callback: Optional[Callable] = None,
    ):
        self._processes = processes
        self._start_fn = start_fn
        self._stop_fn = stop_fn
        self._restart_fn = restart_fn
        self.event_callback = event_callback
        self._state_views: Dict[str, GUIServiceStateView] = {}

    @property
    def states(self) -> Dict[str, GUIServiceStateView]:
        # Rebuild views if processes dict changed (e.g. after reload)
        for key, sp in self._processes.items():
            if key not in self._state_views:
                self._state_views[key] = GUIServiceStateView(sp)
        # Remove stale keys
        for key in list(self._state_views):
            if key not in self._processes:
                del self._state_views[key]
        return self._state_views

    def get_state(self, service_key: str) -> Optional[GUIServiceStateView]:
        return self.states.get(service_key)

    def get_all_states(self) -> Dict[str, GUIServiceStateView]:
        return dict(self.states)

    def is_running(self, service_key: str) -> bool:
        sp = self._processes.get(service_key)
        if not sp:
            return False
        return getattr(sp, "running", False)

    def start(self, service_key: str) -> bool:
        return self._start_fn(service_key)

    def stop(self, service_key: str, graceful: bool = True) -> bool:
        return self._stop_fn(service_key, graceful)

    def restart(self, service_key: str) -> bool:
        return self._restart_fn(service_key)

    def cleanup(self):
        pass  # GUI handles its own cleanup


class GUILogAdapter:
    """
    Adapter that makes the GUI's ServiceProcess log buffers look like
    a core LogManager to the API routes.
    """

    def __init__(self, processes: Dict[str, object]):
        self._processes = processes

    @property
    def states(self) -> Dict[str, GUIServiceStateView]:
        # API routes access log_mgr.states for checking service existence
        return {k: GUIServiceStateView(sp) for k, sp in self._processes.items()}

    def get_logs(
        self,
        service_key: str,
        filter_text: Optional[str] = None,
        filter_level: Optional[str] = None,
        max_lines: Optional[int] = None,
        tail: Optional[int] = None,
    ) -> List[str]:
        sp = self._processes.get(service_key)
        if not sp:
            return []
        try:
            buf = list(getattr(sp, "log_buffer", []))
        except Exception:
            return []

        lines = [str(line) for line in buf]

        if filter_text:
            ft = filter_text.lower()
            lines = [l for l in lines if ft in l.lower()]
        if filter_level:
            fl = filter_level.upper()
            lines = [l for l in lines if fl in l.upper()]
        if tail and tail > 0:
            lines = lines[-tail:]
        if max_lines and max_lines > 0:
            lines = lines[-max_lines:]

        return lines

    def clear_logs(self, service_key: str):
        sp = self._processes.get(service_key)
        if sp and hasattr(sp, "log_buffer"):
            try:
                sp.log_buffer.clear()
            except Exception:
                pass

    def clear_all_logs(self):
        for key in self._processes:
            self.clear_logs(key)

    def get_log_file_path(self, service_key: str) -> Optional[Path]:
        sp = self._processes.get(service_key)
        if sp:
            path = getattr(sp, "log_file_path", None)
            if path:
                return Path(path)
        return None

    def is_monitoring(self) -> bool:
        return True  # GUI always monitors via its own timers

    def start_monitoring(self):
        pass

    def stop_monitoring(self):
        pass


# ---------------------------------------------------------------------------
# Lightweight container that holds the adapters
# ---------------------------------------------------------------------------

class GUILauncherContainer:
    """
    Drop-in for core.LauncherContainer that wraps GUI adapters.

    Satisfies the API dependency injection (get_process_manager, etc.)
    without creating separate core managers.
    """

    def __init__(
        self,
        process_adapter: GUIProcessAdapter,
        log_adapter: GUILogAdapter,
        event_bus: Optional[EventBus] = None,
    ):
        self._process_adapter = process_adapter
        self._log_adapter = log_adapter
        self.event_bus = event_bus or get_event_bus()

    def get_process_manager(self):
        return self._process_adapter

    def get_health_manager(self):
        # API health route only checks is_running(); the adapter handles that
        return None

    def get_log_manager(self):
        return self._log_adapter

    def get_event_bus(self):
        return self.event_bus

    def start_all(self):
        pass  # GUI manages its own lifecycle

    def stop_all(self):
        pass


# ---------------------------------------------------------------------------
# Public entry point — call from LauncherWindow.__init__
# ---------------------------------------------------------------------------

def start_embedded_api(launcher_window, port: int = 8100) -> Callable[[], None]:
    """
    Start the Launcher API server in a background thread, sharing the GUI's
    live state via adapters.

    Args:
        launcher_window: The LauncherWindow instance (provides .processes dict
                         and service lifecycle methods).
        port: Port for the API (default 8100).

    Returns:
        A cleanup callable (currently a no-op; daemon thread dies with process).
    """
    import socket

    event_bus = get_event_bus()

    # Check if port is already in use (standalone API running).
    # Even if we skip starting uvicorn, we still inject our container
    # so the running API reads live GUI state instead of its own stale copy.
    port_taken = False
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        port_taken = s.connect_ex(("127.0.0.1", port)) == 0

    # Build adapters wrapping the GUI's live processes dict.
    # The callbacks need to be thread-safe — we use QMetaObject.invokeMethod
    # to dispatch start/stop/restart onto the Qt main thread.
    from PySide6.QtCore import QMetaObject, Qt, Q_ARG
    import functools

    # Simple thread-safe command dispatch using an event + result queue
    _result_events: Dict[str, threading.Event] = {}
    _result_values: Dict[str, bool] = {}

    def _threadsafe_call(method_name: str, key: str, *args) -> bool:
        """Call a GUI method from the API thread via Qt event loop."""
        call_id = f"{method_name}_{key}_{time.monotonic()}"
        evt = threading.Event()
        _result_events[call_id] = evt
        _result_values[call_id] = False

        def _run_on_main():
            try:
                fn = getattr(launcher_window, method_name, None)
                if callable(fn):
                    fn(key, *args) if args else fn(key)
                    _result_values[call_id] = True
            except Exception:
                _result_values[call_id] = False
            finally:
                _result_events[call_id].set()

        from PySide6.QtCore import QTimer
        QTimer.singleShot(0, _run_on_main)

        evt.wait(timeout=15.0)
        result = _result_values.pop(call_id, False)
        _result_events.pop(call_id, None)
        return result

    def start_fn(key: str) -> bool:
        return _threadsafe_call("_start_service", key)

    def stop_fn(key: str, graceful: bool = True) -> bool:
        method = "_stop_service" if graceful else "_force_stop_service"
        return _threadsafe_call(method, key)

    def restart_fn(key: str) -> bool:
        return _threadsafe_call("_restart_service", key)

    process_adapter = GUIProcessAdapter(
        launcher_window.processes,
        start_fn=start_fn,
        stop_fn=stop_fn,
        restart_fn=restart_fn,
    )

    log_adapter = GUILogAdapter(launcher_window.processes)
    container = GUILauncherContainer(process_adapter, log_adapter, event_bus)

    # Inject our container into the API's global dependency injection.
    # This works whether the API is running standalone or embedded — the
    # global container reference is in the same Python process either way.
    from launcher.api.dependencies import set_container
    set_container(container)

    if port_taken:
        # A standalone API process is occupying the port.  We can't inject
        # our container into a different process, so kill it and take over
        # with our embedded server that shares live GUI state.
        try:
            from .logger import launcher_logger
            if launcher_logger:
                launcher_logger.info("embedded_api_replacing_standalone", port=port)
        except Exception:
            pass
        try:
            from .process_utils import find_pid_by_port, kill_process_by_pid
            pid = find_pid_by_port(port)
            if pid and pid != os.getpid():
                kill_process_by_pid(pid, force=True)
                import time as _time
                _time.sleep(0.5)  # Give the port time to free up
        except Exception:
            pass

    # Start uvicorn in a daemon thread, keeping a handle for clean shutdown.
    import uvicorn
    from launcher.api.main import app

    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)

    def _run_api():
        server.run()

    api_thread = threading.Thread(target=_run_api, daemon=True, name="launcher-api")
    api_thread.start()

    # Store shutdown handle on the launcher window so stop logic can find it.
    launcher_window._embedded_api_server = server

    def _shutdown():
        server.should_exit = True

    try:
        from .logger import launcher_logger
        if launcher_logger:
            launcher_logger.info("embedded_api_started", port=port)
    except Exception:
        pass

    return _shutdown


def publish_health_event(event_bus: EventBus, key: str, status: HealthStatus):
    """Publish a health event to the EventBus so WebSocket clients see it."""
    event_bus.publish_simple(
        event_type=EventTypes.HEALTH_UPDATE,
        source="GUIHealthBridge",
        data=HealthEvent(
            service_key=key,
            status=status,
            timestamp=time.time(),
        ),
    )
