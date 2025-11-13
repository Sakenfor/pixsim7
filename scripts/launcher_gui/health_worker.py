from typing import Dict
from PySide6.QtCore import QThread, Signal

try:
    from .status import HealthStatus
    from .logger import launcher_logger as _launcher_logger
    from .docker_utils import compose_ps
    from .config import ROOT
    from .process_utils import find_pid_by_port
except ImportError:
    from status import HealthStatus
    from logger import launcher_logger as _launcher_logger
    from docker_utils import compose_ps
    from config import ROOT
    from process_utils import find_pid_by_port


class HealthWorker(QThread):
    health_update = Signal(str, HealthStatus)

    def __init__(self, processes: Dict[str, object], interval_sec: float = 3.0, parent=None):
        super().__init__(parent)
        self.processes = processes
        self.interval = interval_sec
        self._stop = False
        self.failure_counts: Dict[str, int] = {}
        self.failure_threshold = 5  # default fallback

    def stop(self):
        self._stop = True

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
        import time, urllib.request, socket, os
        while not self._stop:
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
                                    self.health_update.emit(key, HealthStatus.HEALTHY)
                                    self.failure_counts[key] = 0
                                else:
                                    sp.running = False
                                    self.health_update.emit(key, HealthStatus.STOPPED)
                                    self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
                            else:
                                sp.running = False
                                self.health_update.emit(key, HealthStatus.STOPPED)
                                self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
                        except Exception:
                            sp.running = False
                            self.health_update.emit(key, HealthStatus.STOPPED)
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
                                self.health_update.emit(key, HealthStatus.HEALTHY)
                                self.failure_counts[key] = 0
                            except Exception:
                                self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
                                current_status = getattr(sp, 'health_status', None)

                                if self.failure_counts[key] < self.failure_threshold:
                                    # Keep running flag if we're just starting
                                    if sp.running:
                                        self.health_update.emit(key, HealthStatus.STARTING)
                                    else:
                                        sp.running = False
                                        self.health_update.emit(key, HealthStatus.STOPPED)
                                # If service was previously healthy, mark as unhealthy
                                elif current_status == HealthStatus.HEALTHY or sp.running:
                                    sp.running = False
                                    self.health_update.emit(key, HealthStatus.UNHEALTHY)
                                # Otherwise, service is just stopped
                                else:
                                    sp.running = False
                                    self.health_update.emit(key, HealthStatus.STOPPED)
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
                            self.health_update.emit(key, HealthStatus.UNHEALTHY)
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
                                    self.health_update.emit(key, HealthStatus.HEALTHY)
                                    self.failure_counts[key] = 0
                                else:
                                    self.health_update.emit(key, HealthStatus.UNHEALTHY)
                                    self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
                        except Exception:
                            self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
                            # Use per-service grace attempts if defined
                            grace = getattr(getattr(sp, 'defn', None), 'health_grace_attempts', self.failure_threshold)
                            current_status = getattr(sp, 'health_status', None)

                            # If we're in grace period and status is STARTING, keep showing STARTING
                            if current_status in (HealthStatus.STARTING, HealthStatus.UNKNOWN) and self.failure_counts[key] < grace:
                                if sp.running:
                                    self.health_update.emit(key, HealthStatus.STARTING)
                                else:
                                    sp.running = False
                                    self.health_update.emit(key, HealthStatus.STOPPED)
                            # If service was previously healthy/running, mark as unhealthy
                            elif current_status == HealthStatus.HEALTHY or (sp.running and current_status == HealthStatus.STARTING):
                                sp.running = False
                                self.health_update.emit(key, HealthStatus.UNHEALTHY)
                            # Otherwise, service is just stopped
                            else:
                                sp.running = False
                                self.health_update.emit(key, HealthStatus.STOPPED)
                    else:
                        # No health URL, assume healthy if running flag is set
                        if sp.running:
                            self.health_update.emit(key, HealthStatus.HEALTHY)
                            self.failure_counts[key] = 0
                        else:
                            self.health_update.emit(key, HealthStatus.STOPPED)
                except Exception:
                    self.health_update.emit(key, HealthStatus.UNHEALTHY)
                    self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
            elapsed = time.time() - start_loop
            remaining = self.interval - elapsed
            if remaining > 0:
                time.sleep(remaining)
