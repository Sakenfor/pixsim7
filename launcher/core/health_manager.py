"""
Health Manager - Pure Python service health monitoring.

Monitors service health via HTTP endpoints or custom checks,
without UI dependencies. Uses threading instead of QThread.
"""

import os
import re
import time
import socket
import subprocess
import threading
import urllib.request
import logging
from typing import Dict, Optional, Callable
from .types import HealthStatus, HealthEvent, ServiceState, ServiceStatus

logger = logging.getLogger("launcher.core.health")

# Stop counting after this many consecutive failures.
MAX_FAILURE_COUNT = 50

# Service ids that run as `python -m arq <WorkerSettings>`. They share the
# Redis-backed health logic (PID liveness + Redis reachability), and need
# unique command-line selectors in _detect_headless_service so the broad
# `-m arq` fallback doesn't cross-match between them.
ARQ_WORKER_KEYS = frozenset({'worker', 'simulation-worker', 'automation-worker'})


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
        stable_interval: float = 5.0,
        http_timeout: float = 1.5,
    ):
        self.states = states
        self.event_callback = event_callback

        # Health check interval settings
        self.base_interval = interval_sec
        self.adaptive_enabled = adaptive_enabled
        self.startup_interval = startup_interval
        self.stable_interval = stable_interval
        self.interval = self.base_interval
        self.http_timeout = http_timeout

        # State tracking
        self.failure_counts: Dict[str, int] = {}
        self.service_healthy_since: Dict[str, Optional[float]] = {}
        self.last_startup_detected: Optional[float] = None
        self._prev_status: Dict[str, HealthStatus] = {}

        # Transport backoff (for transient WinNAT/TCP churn on Windows)
        self._transport_backoff_until: Dict[str, float] = {}
        self._transport_backoff_failures: Dict[str, int] = {}
        self._transport_backoff_last_failure: Dict[str, float] = {}

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

    # ── Transport backoff (Windows WinNAT / transient socket errors) ──

    @staticmethod
    def _is_transient_transport_error(error: Exception) -> bool:
        text = str(error).lower()
        return (
            "winerror 10048" in text
            or "only one usage of each socket address" in text
            or "wsaeaddrinuse" in text
            or "temporarily unavailable" in text
        )

    def _transport_backoff_remaining(self, key: str) -> float:
        until = self._transport_backoff_until.get(key, 0.0)
        remaining = until - time.monotonic()
        return remaining if remaining > 0 else 0.0

    def _record_transport_backoff(self, key: str) -> tuple:
        now = time.monotonic()
        last = self._transport_backoff_last_failure.get(key, 0.0)
        if last and (now - last) > 60.0:
            self._transport_backoff_failures[key] = 0
        failures = self._transport_backoff_failures.get(key, 0) + 1
        self._transport_backoff_failures[key] = failures
        self._transport_backoff_last_failure[key] = now
        steps = (2.0, 4.0, 8.0, 12.0, 20.0)
        delay = steps[min(failures - 1, len(steps) - 1)]
        self._transport_backoff_until[key] = now + delay
        return failures, delay

    def _clear_transport_backoff(self, key: str) -> None:
        self._transport_backoff_until.pop(key, None)
        self._transport_backoff_failures.pop(key, None)
        self._transport_backoff_last_failure.pop(key, None)

    # ── Helpers ──

    def _increment_failures(self, key: str) -> int:
        count = min(self.failure_counts.get(key, 0) + 1, MAX_FAILURE_COUNT)
        self.failure_counts[key] = count
        return count

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
        state = self.states.get(key)
        if state:
            state.health = status

        # Log transitions
        old = self._prev_status.get(key)
        if old is not None and old != status:
            logger.info("health_transition service=%s %s → %s failures=%d",
                        key, old.value, status.value, self.failure_counts.get(key, 0))
        self._prev_status[key] = status

        # Enrich details with state metadata
        merged = dict(details) if details else {}
        if state:
            merged.setdefault("externally_managed", state.externally_managed)
            if state.detected_pid:
                merged.setdefault("detected_pid", state.detected_pid)

        self._emit_event(HealthEvent(
            service_key=key,
            status=status,
            timestamp=time.time(),
            details=merged if merged else None,
        ))

        self._track_health_change(key, status)

    def _check_http_health(self, url: str, timeout: float = 0.8) -> bool:
        """
        Check health via HTTP endpoint.  Raises on error so callers
        can classify the failure (e.g. transient transport errors).

        Returns:
            True if endpoint returns 200 OK
        """
        req = urllib.request.Request(url, method='GET')
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status == 200

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
        """Check docker-compose service health via ``docker compose ps``."""
        base = ['-f', compose_file, 'ps']
        cmds = [
            ['docker', 'compose'] + base,
            ['docker-compose'] + base,
        ]
        kwargs: dict = dict(capture_output=True, text=True, timeout=5)
        if os.name == 'nt':
            kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
        for cmd in cmds:
            try:
                result = subprocess.run(cmd, **kwargs)
                if result.returncode == 0 and result.stdout:
                    out = result.stdout.lower()
                    return ' up ' in f" {out} " or 'running' in out
            except Exception:
                continue
        return False

    def _detect_pid_by_port(self, port: int) -> Optional[int]:
        """
        Detect PID of process listening on given port.

        Args:
            port: Port number to check

        Returns:
            PID if found, None otherwise
        """
        try:
            if os.name == 'nt':
                # Windows: use netstat
                result = subprocess.run(
                    ['netstat', '-ano'],
                    capture_output=True,
                    text=True,
                    timeout=5,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
                if result.returncode == 0:
                    for line in result.stdout.split('\n'):
                        if f':{port}' in line and 'LISTENING' in line:
                            parts = line.split()
                            if len(parts) >= 5:
                                try:
                                    return int(parts[-1])
                                except ValueError:
                                    pass
            else:
                # Unix: use lsof or ss
                try:
                    result = subprocess.run(
                        ['lsof', '-ti', f':{port}'],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    if result.returncode == 0 and result.stdout.strip():
                        return int(result.stdout.strip().split()[0])
                except FileNotFoundError:
                    # lsof not available, try ss
                    result = subprocess.run(
                        ['ss', '-lptn', f'sport = :{port}'],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    if result.returncode == 0:
                        # Extract PID from ss output
                        match = re.search(r'pid=(\d+)', result.stdout)
                        if match:
                            return int(match.group(1))
        except Exception:
            pass
        return None

    def _extract_port_from_url(self, url: str) -> Optional[int]:
        """Extract port number from URL."""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            return parsed.port
        except Exception:
            return None

    def _detect_headless_service(self, key: str, definition) -> Optional[int]:
        """Detect an externally-started headless service by scanning process command lines.

        Returns the PID if found, None otherwise. Uses the same pattern matching
        as ProcessManager._detect_worker_pids.
        """
        # Each arq worker needs a selector that uniquely identifies it among
        # peers — they all run `python -m arq ...`, so substrings like
        # `-m arq` or bare `arq_worker` would cross-match across workers.
        patterns = {
            'worker': ['arq_worker.WorkerSettings'],
            'simulation-worker': ['SimulationWorkerSettings'],
            'automation-worker': ['AutomationWorkerSettings'],
            'ai-client': ['pixsim7.client', '-m pixsim7.client'],
        }
        search_terms = patterns.get(key)
        if not search_terms:
            args = getattr(definition, 'args', []) or []
            if len(args) >= 2:
                search_terms = [' '.join(args[:2])]
            else:
                return None

        try:
            if os.name == 'nt':
                ps_cmd = (
                    "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" "
                    "| ForEach-Object { \"$($_.ProcessId)|$($_.CommandLine)\" }"
                )
                result = subprocess.run(
                    ['powershell', '-NoProfile', '-Command', ps_cmd],
                    capture_output=True, text=True, timeout=10,
                )
                if result.returncode == 0:
                    for line in result.stdout.splitlines():
                        line = line.strip()
                        if '|' not in line:
                            continue
                        pid_str, cmdline = line.split('|', 1)
                        if any(term in cmdline for term in search_terms):
                            try:
                                pid = int(pid_str.strip())
                                if pid != os.getpid():
                                    return pid
                            except ValueError:
                                pass
            else:
                result = subprocess.run(
                    ['ps', 'aux'], capture_output=True, text=True, timeout=5,
                )
                if result.returncode == 0:
                    for line in result.stdout.splitlines():
                        if any(term in line for term in search_terms):
                            parts = line.split()
                            if len(parts) >= 2:
                                try:
                                    pid = int(parts[1])
                                    if pid != os.getpid():
                                        return pid
                                except ValueError:
                                    pass
        except Exception:
            pass
        return None

    def _is_pid_alive(self, pid: Optional[int]) -> bool:
        """Check whether a PID currently exists."""
        if not pid:
            return False
        try:
            if os.name == 'nt':
                result = subprocess.run(
                    ['tasklist', '/FI', f'PID eq {pid}'],
                    capture_output=True,
                    text=True,
                    timeout=3,
                    shell=False,
                )
                if result.returncode != 0:
                    return False
                return re.search(rf"\b{pid}\b", result.stdout or "") is not None
            os.kill(pid, 0)
            return True
        except ProcessLookupError:
            return False
        except PermissionError:
            return True
        except Exception:
            return False

    def _check_service(self, key: str, state: ServiceState):
        """Check health for a single service."""
        definition = state.definition

        # Skip services the user never started, that aren't running, and
        # have no known PID (e.g. persisted from a previous session).
        # Avoids burning ~1.5s per service on Windows for unbound ports.
        # Never skip docker-compose/detached services — they can run
        # externally (Docker Desktop) without any PID in the launcher.
        # Never skip services with a health_url — they might be running
        # externally and should be discovered via HTTP probe.
        has_known_pid = state.pid or state.detected_pid
        is_detached = definition.is_detached or definition.key == 'db'
        has_health_url = bool(getattr(definition, 'health_url', None))
        is_worker = definition.key in ARQ_WORKER_KEYS  # arq workers use Redis probe

        # For headless services without a health_url (workers, bridges),
        # try to detect externally-started processes by command line scan.
        # Rate-limited: scan at most once per 10 health cycles (~20s) to
        # avoid PowerShell overhead on every tick.
        if (not has_known_pid and not has_health_url
                and not is_detached and not definition.custom_health_check):
            scan_key = f"_scan_{key}"
            scan_count = getattr(self, scan_key, 0)
            if scan_count <= 0:
                detected = self._detect_headless_service(key, definition)
                if detected:
                    state.detected_pid = detected
                    has_known_pid = True
                    state.status = ServiceStatus.RUNNING
                setattr(self, scan_key, 10)  # skip next 10 cycles
            else:
                setattr(self, scan_key, scan_count - 1)

        if (not state.requested_running and state.status.value == 'stopped'
                and not has_known_pid and not is_detached
                and not definition.custom_health_check
                and not has_health_url
                and not is_worker):
            if state.health != HealthStatus.STOPPED:
                self._emit_health_update(key, HealthStatus.STOPPED)
            return

        # ── Custom health check ──
        if definition.custom_health_check:
            try:
                is_healthy = definition.custom_health_check(state)
                if is_healthy:
                    self.failure_counts[key] = 0
                    self._handle_healthy(key, state)
                    self._emit_health_update(key, HealthStatus.HEALTHY)
                else:
                    self._increment_failures(key)
                    if self.failure_counts[key] < definition.health_grace_attempts:
                        self._emit_health_update(key, HealthStatus.STARTING)
                    else:
                        self._emit_health_update(key, HealthStatus.UNHEALTHY)
            except Exception:
                self._increment_failures(key)
                self._emit_health_update(key, HealthStatus.UNHEALTHY)
            return

        # ── Docker-compose ──
        if definition.key == 'db' or definition.is_detached:
            try:
                compose_file = os.path.join(definition.cwd, 'docker-compose.db-only.yml')
                is_healthy = os.path.exists(compose_file) and self._check_docker_compose_health(compose_file)
                if is_healthy:
                    self.failure_counts[key] = 0
                    self._handle_healthy(key, state)
                    self._emit_health_update(key, HealthStatus.HEALTHY)
                else:
                    self._increment_failures(key)
                    self._emit_health_update(key, HealthStatus.STOPPED)
            except Exception:
                self._increment_failures(key)
                self._emit_health_update(key, HealthStatus.STOPPED)
            return

        # ── Worker (Redis health check) ──
        # All arq-based workers (main, simulation, automation) require both a
        # live PID matching their specific WorkerSettings and a reachable Redis.
        # The PID match is what disambiguates between worker variants — see
        # _detect_headless_service patterns above.
        if definition.key in ARQ_WORKER_KEYS:
            # If user explicitly stopped, don't re-adopt just because Redis is up
            if state.requested_running is False and state.status.value == 'stopped':
                if state.health != HealthStatus.STOPPED:
                    self._emit_health_update(key, HealthStatus.STOPPED)
                return

            # Keep worker PID state honest: stale PIDs can otherwise keep
            # the card green even when the process is gone.
            if state.pid and not self._is_pid_alive(state.pid):
                state.pid = None
            if state.detected_pid and not self._is_pid_alive(state.detected_pid):
                state.detected_pid = None
            has_worker_pid = bool(state.pid or state.detected_pid)

            redis_url = os.getenv('ARQ_REDIS_URL') or os.getenv('REDIS_URL') or 'redis://127.0.0.1:6380/0'
            is_healthy = self._check_redis_health(redis_url)
            if is_healthy and has_worker_pid:
                self.failure_counts[key] = 0
                self._handle_healthy(key, state)
                self._emit_health_update(key, HealthStatus.HEALTHY)
            elif not has_worker_pid:
                self._increment_failures(key)
                # Without a live worker PID, the worker is not running even if
                # Redis is reachable. Mark stopped to avoid false-positive green.
                state.status = ServiceStatus.STOPPED
                state.externally_managed = False
                self._emit_health_update(key, HealthStatus.STOPPED)
            else:
                self._increment_failures(key)
                grace = definition.health_grace_attempts
                if self.failure_counts[key] < grace:
                    if state.status.value in ('running', 'starting'):
                        self._emit_health_update(key, HealthStatus.STARTING)
                    else:
                        self._emit_health_update(key, HealthStatus.STOPPED)
                else:
                    self._emit_health_update(key, HealthStatus.UNHEALTHY)
            return

        # ── Standard HTTP health check ──
        if definition.health_url:
            # Transport backoff for transient WinNAT / socket errors
            if self._transport_backoff_remaining(key) > 0 and state.status.value in ('running', 'starting'):
                return

            try:
                is_healthy = self._check_http_health(definition.health_url, timeout=self.http_timeout)
                if is_healthy:
                    self._clear_transport_backoff(key)
                    self.failure_counts[key] = 0
                    # Don't re-adopt if user explicitly stopped this service
                    if state.requested_running is False and state.status.value == 'stopped':
                        self._emit_health_update(key, HealthStatus.STOPPED)
                    else:
                        self._handle_healthy(key, state)
                        self._emit_health_update(key, HealthStatus.HEALTHY)
                else:
                    self._handle_http_failure(key, state, None)
            except Exception as e:
                self._handle_http_failure(key, state, e)
        else:
            # No health URL — use process status as proxy.
            # If the process is alive, treat as healthy and promote to RUNNING.
            if state.status.value in ('running', 'starting'):
                self.failure_counts[key] = 0
                if state.status == ServiceStatus.STARTING:
                    state.status = ServiceStatus.RUNNING
                self._emit_health_update(key, HealthStatus.HEALTHY)
            else:
                self._emit_health_update(key, HealthStatus.STOPPED)

    def _handle_healthy(self, key: str, state: ServiceState):
        """Common handling when a service is found healthy."""
        definition = state.definition
        if state.status.value == 'stopped':
            # Don't auto-adopt if user explicitly stopped this service.
            # ProcessManager.stop() sets requested_running = False.
            # Default (None) means unknown — allow adoption of external services.
            if state.requested_running is False:
                return
            state.status = ServiceStatus.RUNNING
            # Adopt: service found running externally — treat as wanted
            state.requested_running = True
            if not state.detected_pid and definition.health_url:
                port = self._extract_port_from_url(definition.health_url)
                if port:
                    state.detected_pid = self._detect_pid_by_port(port)
        state.externally_managed = not state.requested_running

    def _handle_http_failure(self, key: str, state: ServiceState, error: Optional[Exception]):
        """Handle HTTP health check failure with transport backoff and grace."""
        definition = state.definition
        self._increment_failures(key)
        fc = self.failure_counts[key]
        grace = definition.health_grace_attempts
        current_health = state.health

        transient = error is not None and self._is_transient_transport_error(error)
        if transient:
            self._record_transport_backoff(key)
        elif error is not None:
            self._clear_transport_backoff(key)

        # Tolerate short glitches while previously healthy
        if current_health == HealthStatus.HEALTHY and fc < grace and transient:
            self._emit_health_update(key, HealthStatus.HEALTHY)
            return

        # Grace period: keep STARTING
        if current_health in (HealthStatus.STARTING, HealthStatus.UNKNOWN) and fc < grace:
            if state.status.value in ('running', 'starting'):
                self._emit_health_update(key, HealthStatus.STARTING)
            else:
                self._emit_health_update(key, HealthStatus.STOPPED)
        # Was healthy, now failing
        elif current_health == HealthStatus.HEALTHY or (
            state.status.value == 'running' and current_health == HealthStatus.STARTING
        ):
            self._emit_health_update(key, HealthStatus.UNHEALTHY)
        # Fully stopped
        else:
            state.pid = None
            state.detected_pid = None
            state.status = ServiceStatus.STOPPED
            state.externally_managed = False
            self._emit_health_update(key, HealthStatus.STOPPED)

    def _run_loop(self):
        """Main health checking loop (runs in thread)."""
        while not self._stop_event.is_set():
          try:
            self._update_adaptive_interval()
            start_time = time.time()

            # Check fast services (HTTP/TCP) before slow ones (docker-compose)
            # so health cards update quickly at startup.
            fast = []
            slow = []
            for key, state in self.states.items():
                defn = state.definition
                if defn.is_detached or defn.key == 'db' or defn.custom_health_check:
                    slow.append((key, state))
                else:
                    fast.append((key, state))

            for key, state in (*fast, *slow):
                if self._stop_event.is_set():
                    break
                try:
                    self._check_service(key, state)
                except Exception as exc:
                    try:
                        self._increment_failures(key)
                        self._emit_health_update(key, HealthStatus.UNHEALTHY)
                    except Exception:
                        pass  # Never let emit errors kill the health loop

            elapsed = time.time() - start_time
            remaining = self.interval - elapsed
            if remaining > 0:
                self._stop_event.wait(timeout=remaining)
          except Exception:
            # Never let the health loop die — sleep and retry
            self._stop_event.wait(timeout=2.0)
