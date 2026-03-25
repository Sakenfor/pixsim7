"""
Health Bridge — thin Qt adapter between core HealthManager and GUI.

Receives HealthEvent callbacks from the core health manager (background thread)
and re-emits them as Qt signals on the main thread.  Also handles GUI-only
enrichments: worker card details and OpenAPI freshness checking.

Replaces the monolithic HealthWorker (~920 LOC) with ~220 LOC.
"""

import os
import time
import socket
from typing import Dict, Optional

from PySide6.QtCore import QObject, QTimer, Signal, Qt

try:
    from .status import HealthStatus
    from .logger import launcher_logger as _launcher_logger
    from .openapi_checker import check_openapi_freshness, OpenAPIStatus
    from .process_utils import is_process_alive
except ImportError:
    from status import HealthStatus
    from logger import launcher_logger as _launcher_logger
    from openapi_checker import check_openapi_freshness, OpenAPIStatus
    from process_utils import is_process_alive

try:
    from launcher.core.types import HealthEvent, ServiceDefinition, ServiceState, ServiceStatus
    from launcher.core import HealthManager
except ImportError:
    from launcher.core.types import HealthEvent, ServiceDefinition, ServiceState, ServiceStatus
    from launcher.core import HealthManager


def _log(event: str, level: str = "info", **kwargs):
    if not _launcher_logger:
        return
    try:
        getattr(_launcher_logger, level)(event, **kwargs)
    except Exception:
        pass


class ServiceStateProxy(ServiceState):
    """
    Adapter that makes a GUI ServiceProcess look like a core ServiceState.

    The core HealthManager operates on ServiceState objects.  This proxy
    reads/writes through to the underlying ServiceProcess so both layers
    share state without manual syncing.
    """

    def __init__(self, sp):
        defn = sp.defn
        # Detect docker-compose services from program name
        program = getattr(defn, "program", "")
        is_detached = "docker" in program or defn.key == "db"
        definition = ServiceDefinition(
            key=defn.key,
            title=defn.title,
            program=program,
            args=getattr(defn, "args", []),
            cwd=getattr(defn, "cwd", ""),
            url=getattr(defn, "url", None),
            health_url=getattr(defn, "health_url", None),
            health_grace_attempts=getattr(defn, "health_grace_attempts", 5),
            depends_on=getattr(defn, "depends_on", None),
            is_detached=is_detached,
        )
        # Don't call super().__init__ — we override all properties
        object.__setattr__(self, "_sp", sp)
        object.__setattr__(self, "definition", definition)
        object.__setattr__(self, "log_buffer", [])
        object.__setattr__(self, "max_log_lines", 0)
        object.__setattr__(self, "last_error", "")
        object.__setattr__(self, "tool_available", True)
        object.__setattr__(self, "tool_check_message", "")
        object.__setattr__(self, "failure_count", 0)

    @property
    def status(self) -> ServiceStatus:
        sp = object.__getattribute__(self, "_sp")
        if sp.running:
            return ServiceStatus.RUNNING
        if getattr(sp, "requested_running", False):
            return ServiceStatus.STARTING
        return ServiceStatus.STOPPED

    @status.setter
    def status(self, value: ServiceStatus):
        sp = object.__getattribute__(self, "_sp")
        if value == ServiceStatus.RUNNING:
            sp.running = True
        elif value == ServiceStatus.STOPPED:
            sp.running = False

    @property
    def health(self) -> HealthStatus:
        sp = object.__getattribute__(self, "_sp")
        return getattr(sp, "health_status", HealthStatus.UNKNOWN)

    @health.setter
    def health(self, value: HealthStatus):
        sp = object.__getattribute__(self, "_sp")
        sp.health_status = value

    @property
    def pid(self) -> Optional[int]:
        sp = object.__getattribute__(self, "_sp")
        # Match ServiceProcess.get_effective_pid(): started > detected > persisted
        return (getattr(sp, "started_pid", None)
                or getattr(sp, "detected_pid", None)
                or getattr(sp, "persisted_pid", None))

    @pid.setter
    def pid(self, value):
        sp = object.__getattribute__(self, "_sp")
        sp.started_pid = value

    @property
    def detected_pid(self) -> Optional[int]:
        sp = object.__getattribute__(self, "_sp")
        return getattr(sp, "detected_pid", None)

    @detected_pid.setter
    def detected_pid(self, value):
        sp = object.__getattribute__(self, "_sp")
        sp.detected_pid = value

    @property
    def requested_running(self) -> bool:
        sp = object.__getattribute__(self, "_sp")
        return getattr(sp, "requested_running", False)

    @requested_running.setter
    def requested_running(self, value: bool):
        sp = object.__getattribute__(self, "_sp")
        sp.requested_running = value

    @property
    def externally_managed(self) -> bool:
        sp = object.__getattribute__(self, "_sp")
        return getattr(sp, "externally_managed", False)

    @externally_managed.setter
    def externally_managed(self, value: bool):
        sp = object.__getattribute__(self, "_sp")
        sp.externally_managed = value


def build_health_states(processes: Dict[str, object]) -> Dict[str, ServiceStateProxy]:
    """Create ServiceStateProxy wrappers for all ServiceProcess objects."""
    return {key: ServiceStateProxy(sp) for key, sp in processes.items()}
    if not _launcher_logger:
        return
    try:
        getattr(_launcher_logger, level)(event, **kwargs)
    except Exception:
        pass


class HealthBridge(QObject):
    """
    Qt bridge for core HealthManager events.

    Converts background-thread callbacks into Qt signals on the main thread
    and runs periodic UI enrichments (worker card details, OpenAPI freshness).
    """

    health_update = Signal(str, HealthStatus)
    openapi_update = Signal(str, object)  # (service_key, OpenAPIStatus)
    # Internal signal for thread-safe event forwarding from background thread
    _internal_health = Signal(str, object, object)

    def __init__(
        self,
        processes: Dict[str, object],
        ui_state=None,
        parent: Optional[QObject] = None,
    ):
        super().__init__(parent)
        self.processes = processes

        # Wire internal cross-thread signal → main-thread dispatch
        self._internal_health.connect(self._dispatch_health, Qt.QueuedConnection)

        # Build proxy states for the core health manager
        self._states = build_health_states(processes)

        # Read health check settings from ui_state
        interval = 2.0
        adaptive = True
        startup_interval = 0.5
        stable_interval = 5.0
        if ui_state:
            interval = getattr(ui_state, "health_check_interval", interval)
            adaptive = getattr(ui_state, "health_check_adaptive", adaptive)
            startup_interval = getattr(ui_state, "health_check_startup_interval", startup_interval)
            stable_interval = getattr(ui_state, "health_check_stable_interval", stable_interval)

        # Core health manager (runs in background thread)
        self._health_mgr = HealthManager(
            states=self._states,
            event_callback=self.on_health_event,
            interval_sec=interval,
            adaptive_enabled=adaptive,
            startup_interval=startup_interval,
            stable_interval=stable_interval,
        )

        # OpenAPI freshness state
        self.openapi_check_interval = 30  # seconds
        self.last_openapi_check: Dict[str, float] = {}
        self.openapi_status_cache: Dict[str, OpenAPIStatus] = {}

        # Worker card detail refresh
        self._worker_timer = QTimer(self)
        self._worker_timer.timeout.connect(self._refresh_worker_card)
        self._worker_timer.start(15_000)

    def start(self):
        """Start the background health manager."""
        if not self._health_mgr.is_running():
            self._health_mgr.start()

    def rebuild_states(self, processes: Dict[str, object]):
        """Rebuild proxy states after processes dict changes (e.g. service reload)."""
        self.processes = processes
        self._states = build_health_states(processes)
        self._health_mgr.states = self._states

    # ── Core event callback (called on health manager's background thread) ──

    def on_health_event(self, event: HealthEvent):
        """Receive HealthEvent from core HealthManager (background thread)."""
        self._internal_health.emit(event.service_key, event.status, event.details)

    def _dispatch_health(self, key: str, status: HealthStatus, details: Optional[dict]):
        """Process health event on the main Qt thread."""
        sp = self.processes.get(key)
        if sp and details:
            if "externally_managed" in details:
                try:
                    sp.externally_managed = details["externally_managed"]
                except Exception:
                    pass
            if "detected_pid" in details:
                try:
                    sp.detected_pid = details["detected_pid"]
                except Exception:
                    pass

        # Sync running flag from health status
        if sp:
            if status in (HealthStatus.HEALTHY, HealthStatus.STARTING):
                sp.running = True
            elif status == HealthStatus.STOPPED:
                sp.running = False

        self.health_update.emit(key, status)

        # Trigger OpenAPI check when a service becomes healthy
        if status == HealthStatus.HEALTHY and sp:
            self._check_openapi_freshness(key, sp)

    # ── OpenAPI freshness ──

    def _check_openapi_freshness(self, key: str, sp):
        defn = getattr(sp, "defn", None)
        if not defn:
            return
        openapi_url = getattr(defn, "openapi_url", None)
        types_path = getattr(defn, "openapi_types_path", None)
        if not openapi_url or not types_path:
            return

        now = time.time()
        if now - self.last_openapi_check.get(key, 0) < self.openapi_check_interval:
            return
        self.last_openapi_check[key] = now

        try:
            result = check_openapi_freshness(openapi_url, types_path, timeout=2.0)
            old = self.openapi_status_cache.get(key)
            if result.status != old:
                self.openapi_status_cache[key] = result.status
                self.openapi_update.emit(key, result.status)
                _log("openapi_freshness_check", "debug",
                     service_key=key, status=result.status.value, message=result.message)
        except Exception as e:
            _log("openapi_check_failed", "warning", service_key=key, error=str(e))

    # ── Worker card details enrichment ──

    def _refresh_worker_card(self):
        sp = self.processes.get("worker")
        if not sp or not sp.running:
            return
        pid = getattr(sp, "started_pid", None) or getattr(sp, "detected_pid", None)
        redis_url = os.getenv("ARQ_REDIS_URL") or os.getenv("REDIS_URL") or "redis://localhost:6380/0"
        redis_reachable = False

        # Quick Redis PING
        try:
            host, port = self._parse_redis_url(redis_url)
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(0.5)
            try:
                sock.connect((host, port))
                sock.sendall(b"*1\r\n$4\r\nPING\r\n")
                sock.recv(16)
                redis_reachable = True
            except Exception:
                pass
            finally:
                sock.close()
        except Exception:
            pass

        self._update_worker_card_details(
            sp,
            process_alive=bool(pid and is_process_alive(pid)),
            main_pid=pid,
            redis_url=redis_url,
            redis_reachable=redis_reachable,
        )

    @staticmethod
    def _parse_redis_url(url: str) -> tuple:
        host_port = url.split("://", 1)[-1].split("/", 1)[0]
        if ":" in host_port:
            host, port_str = host_port.split(":", 1)
            return host, int(port_str)
        return host_port, 6379

    def _redis_simple_int(self, host: str, port: int, command: str, key: str) -> Optional[int]:
        def _bulk(s: str) -> bytes:
            enc = s.encode("utf-8")
            return b"$" + str(len(enc)).encode("ascii") + b"\r\n" + enc + b"\r\n"

        payload = b"*2\r\n" + _bulk(command) + _bulk(key)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(0.75)
        try:
            sock.connect((host, port))
            sock.sendall(payload)
            resp = sock.recv(128)
            if resp and resp.startswith(b":"):
                return int(resp[1:].split(b"\r\n", 1)[0])
            return None
        except Exception:
            return None
        finally:
            try:
                sock.close()
            except Exception:
                pass

    def _classify_arq_worker_pid(self, pid: int) -> Optional[str]:
        try:
            import psutil
            cmd = " ".join(psutil.Process(pid).cmdline())
            if "GenerationRetryWorkerSettings" in cmd:
                return "retry"
            if "SimulationWorkerSettings" in cmd:
                return "simulation"
            if "arq_worker.WorkerSettings" in cmd:
                return "main"
        except Exception:
            return None
        return None

    def _update_worker_card_details(
        self, sp, *, process_alive: bool, main_pid, redis_url, redis_reachable: bool
    ):
        now = time.time()
        last = float(getattr(sp, "_worker_card_details_ts", 0.0) or 0.0)
        cached = getattr(sp, "card_details", None)

        # Throttle expensive Redis queries
        if cached and (now - last) < 15.0:
            d = dict(cached)
            d["main_worker_running"] = bool(process_alive)
            d["main_worker_pid"] = main_pid
            d["redis_reachable"] = bool(redis_reachable)
            d["details_updated_at"] = time.strftime("%H:%M:%S")
            sp.card_details = d
            return

        host, port = self._parse_redis_url(redis_url)
        fresh = retry = sim = legacy = inprog = None
        if redis_reachable:
            fresh = self._redis_simple_int(host, port, "LLEN", "arq:queue")
            retry = self._redis_simple_int(host, port, "LLEN", "arq:queue:generation-retry")
            sim = self._redis_simple_int(host, port, "LLEN", "arq:queue:simulation-scheduler")
            legacy = self._redis_simple_int(host, port, "LLEN", "arq:queue:default")
            inprog = self._redis_simple_int(host, port, "ZCARD", "arq:in-progress")

        extra_pids = getattr(sp, "extra_started_pids", None) or []
        retry_pids: list[int] = []
        unknown_pids: list[int] = []
        for cpid in extra_pids:
            if cpid == main_pid:
                continue
            role = self._classify_arq_worker_pid(cpid)
            if role == "retry":
                retry_pids.append(cpid)
            elif role != "main":
                unknown_pids.append(cpid)
        if unknown_pids and not retry_pids:
            retry_pids = list(unknown_pids)
            unknown_pids = []

        details = {
            "main_worker_running": bool(process_alive),
            "main_worker_pid": main_pid,
            "retry_worker_running": bool(retry_pids),
            "retry_worker_pids": retry_pids or None,
            "redis_endpoint": f"{host}:{port}",
            "redis_reachable": bool(redis_reachable),
            "queue_pending_fresh": fresh,
            "queue_pending_retry": retry,
            "queue_pending_simulation": sim,
            "queue_in_progress": inprog,
            "queue_pending_legacy_default": legacy if legacy not in (None, 0) else None,
            "companion_worker_pids_unknown": unknown_pids or None,
            "details_updated_at": time.strftime("%H:%M:%S"),
        }
        if retry and retry > 0 and not retry_pids:
            details["note"] = "Retry queue has jobs but no retry worker process detected"
        elif not retry_pids:
            details["note"] = "Retry worker not detected (may be started separately)"

        sp.card_details = details
        sp._worker_card_details_ts = now

    # ── Lifecycle ──

    def stop(self):
        self._health_mgr.stop()
        self._worker_timer.stop()
