from typing import Dict, Optional
from PySide6.QtCore import QThread, Signal
import time

try:
    from .status import HealthStatus
    from .logger import launcher_logger as _launcher_logger
    from .docker_utils import compose_ps
    from .config import ROOT, UIState
    from .process_utils import find_pid_by_port
    from .openapi_checker import check_openapi_freshness, OpenAPIStatus
except ImportError:
    from status import HealthStatus
    from logger import launcher_logger as _launcher_logger
    from docker_utils import compose_ps
    from config import ROOT, UIState
    from process_utils import find_pid_by_port
    from openapi_checker import check_openapi_freshness, OpenAPIStatus


class HealthWorker(QThread):
    health_update = Signal(str, HealthStatus)
    openapi_update = Signal(str, object)  # (service_key, OpenAPIStatus)

    def __init__(self, processes: Dict[str, object], ui_state: Optional[UIState] = None, interval_sec: float = None, parent=None):
        super().__init__(parent)
        self.processes = processes
        self.ui_state = ui_state or UIState()

        # Health check interval settings
        self.base_interval = interval_sec if interval_sec is not None else self.ui_state.health_check_interval
        self.adaptive_enabled = self.ui_state.health_check_adaptive
        self.startup_interval = self.ui_state.health_check_startup_interval
        self.stable_interval = self.ui_state.health_check_stable_interval

        # Current interval (will be adjusted dynamically if adaptive mode is enabled)
        self.interval = self.base_interval

        self._stop = False
        self.failure_counts: Dict[str, int] = {}
        self.failure_threshold = 5  # default fallback
        # Track services we've already warned about being externally managed
        self._externally_managed_warned: Dict[str, bool] = {}

        # Adaptive mode state tracking
        self.service_healthy_since: Dict[str, Optional[float]] = {}  # timestamp when service became healthy
        self.last_startup_detected: Optional[float] = None  # timestamp of last STARTING status

        # OpenAPI check state (check less frequently than health)
        self.openapi_check_interval = 30  # seconds between OpenAPI checks
        self.last_openapi_check: Dict[str, float] = {}
        self.openapi_status_cache: Dict[str, OpenAPIStatus] = {}

    def stop(self):
        self._stop = True

    def _update_adaptive_interval(self):
        """Dynamically adjust health check interval based on service states."""
        if not self.adaptive_enabled:
            self.interval = self.base_interval
            return

        current_time = time.time()

        # Check if any service is starting (use fast interval)
        if self.last_startup_detected and (current_time - self.last_startup_detected) < 60:
            # Within 60 seconds of last startup, use fast interval
            new_interval = self.startup_interval
            if new_interval != self.interval:
                if _launcher_logger:
                    try:
                        _launcher_logger.debug(
                            "health_check_interval_changed",
                            new_interval=new_interval,
                            reason="startup_detected",
                            mode="fast"
                        )
                    except Exception:
                        pass
                self.interval = new_interval
            return

        # Check if all services are stable (use slow interval)
        if self.service_healthy_since:
            # Get minimum time any service has been healthy
            min_healthy_duration = min(
                (current_time - ts if ts else 0)
                for ts in self.service_healthy_since.values()
            )

            # If all services healthy for >5 minutes, use slow interval
            if min_healthy_duration > 300:  # 5 minutes
                new_interval = self.stable_interval
                if new_interval != self.interval:
                    if _launcher_logger:
                        try:
                            _launcher_logger.debug(
                                "health_check_interval_changed",
                                new_interval=new_interval,
                                reason="all_services_stable",
                                mode="slow",
                                min_healthy_duration=min_healthy_duration
                            )
                        except Exception:
                            pass
                    self.interval = new_interval
                return

        # Default to base interval
        if self.interval != self.base_interval:
            if _launcher_logger:
                try:
                    _launcher_logger.debug(
                        "health_check_interval_changed",
                        new_interval=self.base_interval,
                        reason="normal_operation",
                        mode="normal"
                    )
                except Exception:
                    pass
            self.interval = self.base_interval

    def _track_health_change(self, key: str, status: HealthStatus):
        """Track service health state changes for adaptive interval logic."""
        current_time = time.time()

        if status == HealthStatus.STARTING:
            # Track startup event
            self.last_startup_detected = current_time
            # Reset healthy tracking
            self.service_healthy_since[key] = None

        elif status == HealthStatus.HEALTHY:
            # Track when service became healthy (if not already tracked)
            if key not in self.service_healthy_since or self.service_healthy_since[key] is None:
                self.service_healthy_since[key] = current_time

        elif status in (HealthStatus.UNHEALTHY, HealthStatus.STOPPED):
            # Reset healthy tracking
            self.service_healthy_since[key] = None

    def _emit_health_update(self, key: str, status: HealthStatus):
        """Emit health update signal and track state change."""
        try:
            self.health_update.emit(key, status)
        except Exception:
            pass
        self._track_health_change(key, status)

    def _check_openapi_freshness(self, key: str, sp):
        """Check OpenAPI freshness for a service if applicable.

        Only checks if:
        - Service has openapi_url and openapi_types_path defined
        - Service is currently healthy
        - Enough time has passed since last check
        """
        defn = getattr(sp, 'defn', None)
        if not defn:
            return

        openapi_url = getattr(defn, 'openapi_url', None)
        types_path = getattr(defn, 'openapi_types_path', None)

        if not openapi_url or not types_path:
            return

        # Rate limit checks
        current_time = time.time()
        last_check = self.last_openapi_check.get(key, 0)
        if current_time - last_check < self.openapi_check_interval:
            return

        self.last_openapi_check[key] = current_time

        try:
            result = check_openapi_freshness(openapi_url, types_path, timeout=2.0)
            new_status = result.status

            # Only emit if status changed
            old_status = self.openapi_status_cache.get(key)
            if new_status != old_status:
                self.openapi_status_cache[key] = new_status
                try:
                    self.openapi_update.emit(key, new_status)
                except Exception:
                    pass

                if _launcher_logger:
                    try:
                        _launcher_logger.debug(
                            "openapi_freshness_check",
                            service_key=key,
                            status=new_status.value,
                            message=result.message
                        )
                    except Exception:
                        pass
        except Exception as e:
            if _launcher_logger:
                try:
                    _launcher_logger.warning(
                        "openapi_check_failed",
                        service_key=key,
                        error=str(e)
                    )
                except Exception:
                    pass

    def _detect_and_store_pid(self, sp, url: str = None, port: int = None):
        """Detect PID of running service and store it if not started by launcher."""
        # Only detect PID if we don't have a QProcess (not started by launcher)
        if sp.proc is not None:
            return

        # Skip if we already detected a PID for this service
        if hasattr(sp, 'detected_pid') and sp.detected_pid:
            return

        # Extract port from URL if not provided
        if url and not port:
            try:
                # Parse port from URL like "http://localhost:8001/health"
                from urllib.parse import urlparse
                parsed = urlparse(url)
                port = parsed.port
            except Exception:
                return

        if not port:
            return

        # Try to find PID by port
        try:
            pid = find_pid_by_port(port)
            if pid:
                sp.detected_pid = pid
                if _launcher_logger:
                    try:
                        _launcher_logger.info(
                            "detected_process_pid",
                            service_key=sp.defn.key,
                            port=port,
                            pid=pid
                        )
                    except Exception:
                        pass
        except Exception:
            pass

    def run(self):  # type: ignore[override]
        import urllib.request, socket, os
        while not self._stop:
            # Update adaptive interval based on current service states
            self._update_adaptive_interval()

            start_loop = time.time()
            for key, sp in list(self.processes.items()):
                try:
                    if key == 'db':
                        try:
                            compose_file = ROOT + '/docker-compose.db-only.yml'
                            ok, stdout = compose_ps(compose_file)
                            if ok and stdout:
                                out = stdout.lower()
                                if (' up ' in f" {out} ") or ('running' in out):
                                    # Containers are up
                                    requested_running = getattr(sp, 'requested_running', True)

                                    if requested_running:
                                        sp.running = True
                                        if hasattr(sp, 'externally_managed'):
                                            sp.externally_managed = False
                                    else:
                                        # User stopped but containers still running - externally managed
                                        if hasattr(sp, 'externally_managed'):
                                            sp.externally_managed = True

                                    self._emit_health_update(key, HealthStatus.HEALTHY)
                                    self.failure_counts[key] = 0
                                else:
                                    sp.running = False
                                    self._emit_health_update(key, HealthStatus.STOPPED)
                                    self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
                            else:
                                sp.running = False
                                self._emit_health_update(key, HealthStatus.STOPPED)
                                self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
                        except Exception:
                            sp.running = False
                            self._emit_health_update(key, HealthStatus.STOPPED)
                            self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
                        continue

                    # Check if service is actually running by checking health URL
                    # Don't skip health check just because running=False, as service might be running from previous session

                    # Special-case worker: check process is alive first, then verify Redis
                    if key == 'worker':
                        # CRITICAL: First check if the worker PROCESS is actually alive
                        pid = getattr(sp, "started_pid", None) or getattr(sp, "detected_pid", None)
                        process_alive = False

                        if pid:
                            try:
                                try:
                                    from .process_utils import is_process_alive
                                except ImportError:
                                    from process_utils import is_process_alive
                                process_alive = is_process_alive(pid)
                            except Exception:
                                process_alive = False

                        # If we think it's running but process is dead, mark as stopped
                        if sp.running and pid and not process_alive:
                            sp.running = False
                            sp.detected_pid = None
                            sp.started_pid = None
                            self._emit_health_update(key, HealthStatus.STOPPED)
                            if _launcher_logger:
                                try:
                                    _launcher_logger.warning(
                                        "worker_process_died",
                                        pid=pid,
                                        msg="Worker process is no longer running"
                                    )
                                except Exception:
                                    pass
                            continue

                        # If process is alive, verify Redis connection as additional health check
                        if sp.running and process_alive:
                            try:
                                redis_url = os.getenv('ARQ_REDIS_URL') or os.getenv('REDIS_URL') or 'redis://localhost:6380/0'
                                # Parse host:port
                                host_port = redis_url.split('://', 1)[-1].split('/', 1)[0]
                                host, port = host_port.split(':') if ':' in host_port else (host_port, '6379')
                                port = int(port)
                                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                                sock.settimeout(0.5)
                                try:
                                    sock.connect((host, port))
                                    # Optional PING
                                    try:
                                        sock.sendall(b'*1\r\n$4\r\nPING\r\n')
                                        sock.recv(16)
                                    except Exception:
                                        pass
                                    # Process alive and Redis accessible = healthy
                                    self._emit_health_update(key, HealthStatus.HEALTHY)
                                    self.failure_counts[key] = 0
                                except Exception:
                                    # Process alive but Redis not accessible = starting/unhealthy
                                    self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
                                    if self.failure_counts[key] < self.failure_threshold:
                                        self._emit_health_update(key, HealthStatus.STARTING)
                                    else:
                                        self._emit_health_update(key, HealthStatus.UNHEALTHY)
                                    if _launcher_logger:
                                        try:
                                            _launcher_logger.warning(
                                                "worker_redis_unreachable",
                                                host=host,
                                                port=port,
                                                pid=pid,
                                                attempts=self.failure_counts[key]
                                            )
                                        except Exception:
                                            pass
                                finally:
                                    try:
                                        sock.close()
                                    except Exception:
                                        pass
                            except Exception:
                                self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
                                self._emit_health_update(key, HealthStatus.UNHEALTHY)
                        else:
                            # Not running or no PID - mark as stopped
                            sp.running = False
                            self._emit_health_update(key, HealthStatus.STOPPED)
                        continue

                    health_url = getattr(getattr(sp, 'defn', None), 'health_url', None)
                    if health_url:
                        try:
                            req = urllib.request.Request(health_url, method='GET')
                            with urllib.request.urlopen(req, timeout=1.5) as response:  # Increased for reliability
                                if response.status == 200:
                                    # Service is responding
                                    requested_running = getattr(sp, 'requested_running', True)

                                    # Service is up, so always mark running.
                                    sp.running = True

                                    if requested_running:
                                        # User wants this service running, mark as healthy
                                        if hasattr(sp, 'externally_managed'):
                                            sp.externally_managed = False
                                    else:
                                        # User requested stop but service is still responding
                                        # Mark as externally managed (outside launcher control)
                                        if hasattr(sp, 'externally_managed'):
                                            sp.externally_managed = True
                                        # Only log this warning once per service until state changes
                                        if not self._externally_managed_warned.get(key, False):
                                            if _launcher_logger:
                                                try:
                                                    _launcher_logger.warning(
                                                        "service_running_despite_stop",
                                                        service_key=key,
                                                        msg="Service responding to health checks despite stop request - externally managed"
                                                    )
                                                except Exception:
                                                    pass
                                            self._externally_managed_warned[key] = True

                                    # Detect PID if not started by launcher
                                    self._detect_and_store_pid(sp, url=health_url)
                                    self._emit_health_update(key, HealthStatus.HEALTHY)
                                    self.failure_counts[key] = 0
                                    # Check OpenAPI freshness when service is healthy
                                    self._check_openapi_freshness(key, sp)
                                else:
                                    self._emit_health_update(key, HealthStatus.UNHEALTHY)
                                    self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
                        except Exception:
                            self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
                            # Use per-service grace attempts if defined
                            grace = getattr(getattr(sp, 'defn', None), 'health_grace_attempts', self.failure_threshold)
                            current_status = getattr(sp, 'health_status', None)

                            # If the health URL is down but the port is alive, treat as STARTING/UNHEALTHY.
                            if getattr(sp, "proc", None) is None:
                                try:
                                    self._detect_and_store_pid(sp, url=health_url)
                                except Exception:
                                    pass
                            detected_pid = getattr(sp, "detected_pid", None)
                            if detected_pid:
                                sp.running = True
                                if hasattr(sp, 'externally_managed'):
                                    sp.externally_managed = True
                                if self.failure_counts[key] < grace:
                                    self._emit_health_update(key, HealthStatus.STARTING)
                                else:
                                    self._emit_health_update(key, HealthStatus.UNHEALTHY)
                                continue

                            # If we're in grace period and status is STARTING, keep showing STARTING
                            if current_status in (HealthStatus.STARTING, HealthStatus.UNKNOWN) and self.failure_counts[key] < grace:
                                if sp.running:
                                    self._emit_health_update(key, HealthStatus.STARTING)
                                else:
                                    sp.running = False
                                    self._emit_health_update(key, HealthStatus.STOPPED)
                            # If service was previously healthy/running, mark as unhealthy
                            elif current_status == HealthStatus.HEALTHY or (sp.running and current_status == HealthStatus.STARTING):
                                sp.running = False
                                self._emit_health_update(key, HealthStatus.UNHEALTHY)
                            # Otherwise, service is just stopped
                            else:
                                sp.running = False
                                # Clear externally managed warning when service is fully stopped
                                if key in self._externally_managed_warned:
                                    self._externally_managed_warned.pop(key, None)
                                self._emit_health_update(key, HealthStatus.STOPPED)
                    else:
                        # No health URL: use PID-based detection where possible.
                        # This is especially important for detached services like
                        # the ARQ worker, which don't expose HTTP health checks.
                        pid = None
                        try:
                            pid = sp.get_effective_pid()
                        except Exception:
                            pid = getattr(sp, "started_pid", None) or getattr(sp, "detected_pid", None)

                        if pid:
                            try:
                                try:
                                    from .process_utils import is_process_alive
                                except ImportError:
                                    from process_utils import is_process_alive
                                alive = bool(is_process_alive(pid))
                            except Exception:
                                alive = True  # fall back to optimistic

                            if alive:
                                sp.running = True
                                if hasattr(sp, 'externally_managed') and getattr(sp, "proc", None) is None:
                                    sp.externally_managed = True
                                self._emit_health_update(key, HealthStatus.HEALTHY)
                                self.failure_counts[key] = 0
                            else:
                                sp.running = False
                                self._emit_health_update(key, HealthStatus.STOPPED)
                        else:
                            sp.running = False
                            self._emit_health_update(key, HealthStatus.STOPPED)
                except Exception:
                    self._emit_health_update(key, HealthStatus.UNHEALTHY)
                    self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
            elapsed = time.time() - start_loop
            remaining = self.interval - elapsed
            if remaining > 0:
                time.sleep(remaining)
