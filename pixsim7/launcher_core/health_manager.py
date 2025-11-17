"""
Health Manager - Pure Python service health monitoring.

Monitors service health via HTTP endpoints or custom checks,
without UI dependencies. Uses threading instead of QThread.
"""

import time
import socket
import threading
import urllib.request
from typing import Dict, Optional, Callable
from .types import HealthStatus, HealthEvent, ServiceState


class HealthManager:
    """
    Monitors service health in a background thread.

    Pure Python implementation with no Qt or UI dependencies.
    """

    def __init__(
        self,
        states: Dict[str, ServiceState],
        event_callback: Optional[Callable[[HealthEvent], None]] = None,
        interval_sec: float = 2.0,
        adaptive_enabled: bool = True,
        startup_interval: float = 0.5,
        stable_interval: float = 5.0
    ):
        """
        Initialize the health manager.

        Args:
            states: Dictionary of service states to monitor
            event_callback: Optional callback for health events
            interval_sec: Base health check interval in seconds
            adaptive_enabled: If True, adjust interval based on service state
            startup_interval: Fast interval during startup (seconds)
            stable_interval: Slow interval when all services stable (seconds)
        """
        self.states = states
        self.event_callback = event_callback

        # Health check interval settings
        self.base_interval = interval_sec
        self.adaptive_enabled = adaptive_enabled
        self.startup_interval = startup_interval
        self.stable_interval = stable_interval
        self.interval = self.base_interval

        # State tracking
        self.failure_counts: Dict[str, int] = {}
        self.service_healthy_since: Dict[str, Optional[float]] = {}
        self.last_startup_detected: Optional[float] = None

        # Thread control
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._running = False

    def start(self):
        """Start the health monitoring thread."""
        if self._running:
            return

        self._stop_event.clear()
        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def stop(self, timeout: float = 5.0):
        """
        Stop the health monitoring thread.

        Args:
            timeout: Maximum time to wait for thread to stop (seconds)
        """
        if not self._running:
            return

        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=timeout)
        self._running = False

    def is_running(self) -> bool:
        """Check if the health monitor is running."""
        return self._running

    def _emit_event(self, event: HealthEvent):
        """Emit a health event to the callback if registered."""
        if self.event_callback:
            try:
                self.event_callback(event)
            except Exception:
                pass  # Don't let callback errors break the manager

    def _update_adaptive_interval(self):
        """Dynamically adjust health check interval based on service states."""
        if not self.adaptive_enabled:
            self.interval = self.base_interval
            return

        current_time = time.time()

        # Check if any service is starting (use fast interval)
        if self.last_startup_detected and (current_time - self.last_startup_detected) < 60:
            self.interval = self.startup_interval
            return

        # Check if all services are stable (use slow interval)
        if self.service_healthy_since:
            min_healthy_duration = min(
                (current_time - ts if ts else 0)
                for ts in self.service_healthy_since.values()
            )

            # If all services healthy for >5 minutes, use slow interval
            if min_healthy_duration > 300:  # 5 minutes
                self.interval = self.stable_interval
                return

        # Default to base interval
        self.interval = self.base_interval

    def _track_health_change(self, key: str, status: HealthStatus):
        """Track service health state changes for adaptive interval logic."""
        current_time = time.time()

        if status == HealthStatus.STARTING:
            self.last_startup_detected = current_time
            self.service_healthy_since[key] = None

        elif status == HealthStatus.HEALTHY:
            if key not in self.service_healthy_since or self.service_healthy_since[key] is None:
                self.service_healthy_since[key] = current_time

        elif status in (HealthStatus.UNHEALTHY, HealthStatus.STOPPED):
            self.service_healthy_since[key] = None

    def _emit_health_update(self, key: str, status: HealthStatus, details: Optional[Dict] = None):
        """Emit health update and track state change."""
        # Update state
        if key in self.states:
            self.states[key].health = status

        # Emit event
        self._emit_event(HealthEvent(
            service_key=key,
            status=status,
            timestamp=time.time(),
            details=details
        ))

        # Track for adaptive intervals
        self._track_health_change(key, status)

    def _check_http_health(self, url: str, timeout: float = 0.8) -> bool:
        """
        Check health via HTTP endpoint.

        Args:
            url: Health check URL
            timeout: Request timeout in seconds

        Returns:
            True if endpoint returns 200 OK
        """
        try:
            req = urllib.request.Request(url, method='GET')
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.status == 200
        except Exception:
            return False

    def _check_tcp_health(self, host: str, port: int, timeout: float = 0.5) -> bool:
        """
        Check health via TCP connection.

        Args:
            host: Hostname or IP
            port: Port number
            timeout: Connection timeout in seconds

        Returns:
            True if connection succeeds
        """
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        try:
            sock.connect((host, port))
            return True
        except Exception:
            return False
        finally:
            try:
                sock.close()
            except Exception:
                pass

    def _check_redis_health(self, url: str) -> bool:
        """
        Check Redis health via TCP + PING command.

        Args:
            url: Redis URL (e.g., redis://localhost:6380/0)

        Returns:
            True if Redis responds to PING
        """
        try:
            # Parse host:port from URL
            host_port = url.split('://', 1)[-1].split('/', 1)[0]
            if ':' in host_port:
                host, port_str = host_port.split(':', 1)
                port = int(port_str)
            else:
                host = host_port
                port = 6379

            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(0.5)
            try:
                sock.connect((host, port))
                # Send PING command
                sock.sendall(b'*1\r\n$4\r\nPING\r\n')
                # Read response (expect +PONG)
                sock.recv(16)
                return True
            except Exception:
                return False
            finally:
                try:
                    sock.close()
                except Exception:
                    pass
        except Exception:
            return False

    def _check_docker_compose_health(self, compose_file: str) -> bool:
        """
        Check docker-compose service health.

        Args:
            compose_file: Path to docker-compose.yml

        Returns:
            True if containers are running
        """
        try:
            import subprocess
            result = subprocess.run(
                ['docker-compose', '-f', compose_file, 'ps'],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0 and result.stdout:
                out = result.stdout.lower()
                return ' up ' in f" {out} " or 'running' in out
        except Exception:
            pass
        return False

    def _run_loop(self):
        """Main health checking loop (runs in thread)."""
        import os

        while not self._stop_event.is_set():
            # Update adaptive interval
            self._update_adaptive_interval()

            start_time = time.time()

            # Check each service
            for key, state in self.states.items():
                if self._stop_event.is_set():
                    break

                definition = state.definition

                # Custom health check function
                if definition.custom_health_check:
                    try:
                        is_healthy = definition.custom_health_check(state)
                        if is_healthy:
                            self.failure_counts[key] = 0
                            self._emit_health_update(key, HealthStatus.HEALTHY)
                        else:
                            self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
                            if self.failure_counts[key] < definition.health_grace_attempts:
                                self._emit_health_update(key, HealthStatus.STARTING)
                            else:
                                self._emit_health_update(key, HealthStatus.UNHEALTHY)
                    except Exception:
                        self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
                        self._emit_health_update(key, HealthStatus.UNHEALTHY)
                    continue

                # Special case: docker-compose
                if definition.key == 'db' or definition.is_detached:
                    try:
                        # Check via docker-compose ps
                        compose_file = os.path.join(definition.cwd, 'docker-compose.db-only.yml')
                        if os.path.exists(compose_file):
                            is_healthy = self._check_docker_compose_health(compose_file)
                        else:
                            is_healthy = False

                        if is_healthy:
                            self.failure_counts[key] = 0
                            self._emit_health_update(key, HealthStatus.HEALTHY)
                        else:
                            self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
                            self._emit_health_update(key, HealthStatus.STOPPED)
                    except Exception:
                        self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
                        self._emit_health_update(key, HealthStatus.STOPPED)
                    continue

                # Special case: worker (Redis health check)
                if definition.key == 'worker':
                    redis_url = os.getenv('ARQ_REDIS_URL') or os.getenv('REDIS_URL') or 'redis://localhost:6380/0'
                    is_healthy = self._check_redis_health(redis_url)

                    if is_healthy:
                        self.failure_counts[key] = 0
                        self._emit_health_update(key, HealthStatus.HEALTHY)
                    else:
                        self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
                        if self.failure_counts[key] < definition.health_grace_attempts:
                            if state.status.value in ('running', 'starting'):
                                self._emit_health_update(key, HealthStatus.STARTING)
                            else:
                                self._emit_health_update(key, HealthStatus.STOPPED)
                        else:
                            self._emit_health_update(key, HealthStatus.UNHEALTHY)
                    continue

                # Standard HTTP health check
                if definition.health_url:
                    is_healthy = self._check_http_health(definition.health_url)

                    if is_healthy:
                        self.failure_counts[key] = 0
                        self._emit_health_update(key, HealthStatus.HEALTHY)
                    else:
                        self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
                        grace = definition.health_grace_attempts
                        current_status = state.health

                        # In grace period, keep showing STARTING
                        if current_status in (HealthStatus.STARTING, HealthStatus.UNKNOWN) and self.failure_counts[key] < grace:
                            if state.status.value in ('running', 'starting'):
                                self._emit_health_update(key, HealthStatus.STARTING)
                            else:
                                self._emit_health_update(key, HealthStatus.STOPPED)
                        # Was healthy, now unhealthy
                        elif current_status == HealthStatus.HEALTHY or (state.status.value == 'running' and current_status == HealthStatus.STARTING):
                            self._emit_health_update(key, HealthStatus.UNHEALTHY)
                        # Just stopped
                        else:
                            self._emit_health_update(key, HealthStatus.STOPPED)
                else:
                    # No health URL, assume healthy if running
                    if state.status.value in ('running', 'starting'):
                        self.failure_counts[key] = 0
                        self._emit_health_update(key, HealthStatus.HEALTHY)
                    else:
                        self._emit_health_update(key, HealthStatus.STOPPED)

            # Sleep for remaining interval time
            elapsed = time.time() - start_time
            remaining = self.interval - elapsed
            if remaining > 0:
                self._stop_event.wait(timeout=remaining)
