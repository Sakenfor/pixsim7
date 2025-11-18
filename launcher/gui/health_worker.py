from typing import Dict, Optional
from PySide6.QtCore import QThread, Signal
import time

try:
    from .status import HealthStatus
    from .logger import launcher_logger as _launcher_logger
    from .docker_utils import compose_ps
    from .config import ROOT, UIState
    from .process_utils import find_pid_by_port
except ImportError:
    from status import HealthStatus
    from logger import launcher_logger as _launcher_logger
    from docker_utils import compose_ps
    from config import ROOT, UIState
    from process_utils import find_pid_by_port


class HealthWorker(QThread):
    health_update = Signal(str, HealthStatus)

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

        # Adaptive mode state tracking
        self.service_healthy_since: Dict[str, Optional[float]] = {}  # timestamp when service became healthy
        self.last_startup_detected: Optional[float] = None  # timestamp of last STARTING status

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
                                    # Mark as running if containers are up
                                    sp.running = True
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

                    # Special-case worker: attempt Redis ping (TCP connect) if no health_url
                    if key == 'worker':
                        try:
                            redis_url = os.getenv('ARQ_REDIS_URL') or os.getenv('REDIS_URL') or 'redis://localhost:6380/0'
                            # Parse host:port
                            host_port = redis_url.split('://', 1)[-1].split('/', 1)[0]
                            host, port = host_port.split(':') if ':' in host_port else (host_port, '6379')
                            port = int(port)
                            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                            sock.settimeout(0.5)  # Reduced from 1.5s to 0.5s
                            try:
                                sock.connect((host, port))
                                # Optional PING
                                try:
                                    sock.sendall(b'*1\r\n$4\r\nPING\r\n')
                                    # Read minimal response (+PONG)
                                    sock.recv(16)
                                except Exception:
                                    pass
                                # Worker is running if Redis is accessible
                                sp.running = True
                                # Detect PID if not started by launcher
                                self._detect_and_store_pid(sp, port=port)
                                self._emit_health_update(key, HealthStatus.HEALTHY)
                                self.failure_counts[key] = 0
                            except Exception:
                                self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
                                current_status = getattr(sp, 'health_status', None)

                                if self.failure_counts[key] < self.failure_threshold:
                                    # Keep running flag if we're just starting
                                    if sp.running:
                                        self._emit_health_update(key, HealthStatus.STARTING)
                                    else:
                                        sp.running = False
                                        self._emit_health_update(key, HealthStatus.STOPPED)
                                # If service was previously healthy, mark as unhealthy
                                elif current_status == HealthStatus.HEALTHY or sp.running:
                                    sp.running = False
                                    self._emit_health_update(key, HealthStatus.UNHEALTHY)
                                # Otherwise, service is just stopped
                                else:
                                    sp.running = False
                                    self._emit_health_update(key, HealthStatus.STOPPED)
                                if _launcher_logger:
                                    try:
                                        _launcher_logger.warning(
                                            "worker_redis_unreachable",
                                            host=host,
                                            port=port,
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
                            if _launcher_logger:
                                try:
                                    _launcher_logger.error("worker_redis_check_failed", attempts=self.failure_counts[key])
                                except Exception:
                                    pass
                        continue

                    health_url = getattr(getattr(sp, 'defn', None), 'health_url', None)
                    if health_url:
                        try:
                            req = urllib.request.Request(health_url, method='GET')
                            with urllib.request.urlopen(req, timeout=0.8) as response:  # Reduced from 2s to 0.8s
                                if response.status == 200:
                                    # Service is responding, mark as running
                                    sp.running = True
                                    # Detect PID if not started by launcher
                                    self._detect_and_store_pid(sp, url=health_url)
                                    self._emit_health_update(key, HealthStatus.HEALTHY)
                                    self.failure_counts[key] = 0
                                else:
                                    self._emit_health_update(key, HealthStatus.UNHEALTHY)
                                    self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
                        except Exception:
                            self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
                            # Use per-service grace attempts if defined
                            grace = getattr(getattr(sp, 'defn', None), 'health_grace_attempts', self.failure_threshold)
                            current_status = getattr(sp, 'health_status', None)

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
                                self._emit_health_update(key, HealthStatus.STOPPED)
                    else:
                        # No health URL, assume healthy if running flag is set
                        if sp.running:
                            self._emit_health_update(key, HealthStatus.HEALTHY)
                            self.failure_counts[key] = 0
                        else:
                            self._emit_health_update(key, HealthStatus.STOPPED)
                except Exception:
                    self._emit_health_update(key, HealthStatus.UNHEALTHY)
                    self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
            elapsed = time.time() - start_loop
            remaining = self.interval - elapsed
            if remaining > 0:
                time.sleep(remaining)
