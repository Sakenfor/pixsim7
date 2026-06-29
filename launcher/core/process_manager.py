"""
Process Manager - Pure Python service process management.

Manages service lifecycle (start/stop/restart) without UI dependencies.
Can be used from Qt, web, CLI, or test environments.
"""

import os
import re
import signal
import subprocess
import time
import logging
from typing import Dict, Optional, Callable, List, Any
from pathlib import Path

from .types import (
    ServiceDefinition,
    ServiceState,
    ServiceStatus,
    HealthStatus,
    ProcessEvent
)
from .paths import CONSOLE_LOG_DIR
from .worker_detection import scan_pids

# Import Windows Job Objects for robust process tree management
try:
    from . import windows_job
    WINDOWS_JOB_AVAILABLE = windows_job.is_available()
except ImportError:
    WINDOWS_JOB_AVAILABLE = False


logger = logging.getLogger("launcher.core.process")


_RELOAD_FLAGS_WITH_VALUES = {
    "--reload-dir",
    "--reload-include",
    "--reload-exclude",
    "--reload-delay",
}


def _remove_reload_args(args: List[str]) -> List[str]:
    """Remove uvicorn reload flags as a group when the service disables reload."""
    cleaned: List[str] = []
    skip_next = False
    for arg in args:
        if skip_next:
            skip_next = False
            continue
        if arg == "--reload":
            continue
        if arg in _RELOAD_FLAGS_WITH_VALUES:
            skip_next = True
            continue
        cleaned.append(arg)
    return cleaned


class ProcessManager:
    """
    Manages the lifecycle of service processes.

    Pure Python implementation with no Qt or UI dependencies.
    """

    def __init__(
        self,
        services: List[ServiceDefinition],
        log_dir: Optional[Path] = None,
        event_callback: Optional[Callable[[ProcessEvent], None]] = None
    ):
        """
        Initialize the process manager.

        Args:
            services: List of service definitions to manage
            log_dir: Directory for console logs (default: launcher canonical console log dir)
            event_callback: Optional callback for process events
        """
        self.services: Dict[str, ServiceDefinition] = {s.key: s for s in services}
        self.states: Dict[str, ServiceState] = {}
        self.processes: Dict[str, Optional[subprocess.Popen]] = {}
        self.job_objects: Dict[str, Any] = {}  # Windows Job Objects for process tree management
        self.event_callback = event_callback

        # Set up log directory
        if log_dir is None:
            log_dir = CONSOLE_LOG_DIR

        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)

        # Initialize states for all services
        for service in services:
            self.states[service.key] = ServiceState(definition=service)

        # Cached global exports (computed once, invalidated on settings change)
        self._global_exports_cache: Optional[Dict[str, str]] = None

    def invalidate_exports_cache(self) -> None:
        """Clear the cached global exports so the next start() recomputes them."""
        self._global_exports_cache = None

    def _emit_event(self, event: ProcessEvent):
        """Emit a process event to the callback if registered."""
        if self.event_callback:
            try:
                self.event_callback(event)
            except Exception:
                pass  # Don't let callback errors break the manager

    def check_tool_availability(self, service_key: str) -> bool:
        """
        Check if required tools are available for a service.

        Returns:
            True if tools are available or not required
        """
        state = self.states.get(service_key)
        if not state:
            return False

        definition = state.definition
        if not definition.required_tool:
            state.tool_available = True
            state.tool_check_message = ''
            return True

        # Check if tool exists in PATH
        required = definition.required_tool
        # Support OR syntax: "docker|docker-compose"
        tools = required.split('|')

        for tool in tools:
            tool = tool.strip()
            # Use 'where' on Windows, 'which' on Unix
            check_cmd = 'where' if os.name == 'nt' else 'which'
            try:
                result = subprocess.run(
                    [check_cmd, tool],
                    capture_output=True,
                    text=True,
                    timeout=2
                )
                if result.returncode == 0:
                    state.tool_available = True
                    state.tool_check_message = ''
                    return True
            except Exception:
                continue

        # None of the tools found
        state.tool_available = False
        state.tool_check_message = f"Missing tool: {required}"
        return False

    def start(self, service_key: str) -> bool:
        """
        Start a service.

        Args:
            service_key: Key of the service to start

        Returns:
            True if started successfully
        """
        state = self.states.get(service_key)
        if not state:
            return False

        # Don't start if already running (affirm user's intent)
        if state.status in (ServiceStatus.RUNNING, ServiceStatus.STARTING):
            state.requested_running = True
            return True

        definition = state.definition

        # Config-only services (e.g. _platform) have no process to start
        if not definition.program:
            state.requested_running = True
            state.status = ServiceStatus.RUNNING
            state.health = HealthStatus.HEALTHY
            self._emit_event(ProcessEvent(
                service_key=service_key,
                event_type="started",
                data={"config_only": True}
            ))
            return True

        # NOTE: state.requested_running stays at its prior value (False after
        # a stop) through pre-flight checks below. This prevents the health
        # manager's headless cmdline scan (health_manager.py: requested_running
        # is not False) from re-adopting a still-exiting old process during
        # the start window. The flip to True happens just before the actual
        # spawn, below. See plan launcher-health-probe-stability /
        # mcp-service-restart-no-effect.

        # Enforce dependencies (if defined)
        if definition.depends_on:
            missing: list[str] = []
            for dep_key in definition.depends_on:
                dep_state = self.states.get(dep_key)
                if not dep_state or dep_state.status not in (ServiceStatus.RUNNING, ServiceStatus.STARTING):
                    missing.append(dep_key)
            if missing:
                msg = f"Cannot start '{service_key}': required services not running: {', '.join(missing)}"
                state.status = ServiceStatus.FAILED
                state.last_error = msg
                self._emit_event(ProcessEvent(
                    service_key=service_key,
                    event_type="failed",
                    data={"error": msg}
                ))
                return False

        # Kill any stale process before starting:
        #  - HTTP services: detect by port (existing behavior).
        #  - Headless services (workers, ai-client/MCP bridge): detect by
        #    cmdline pattern. Protects against orphans from crashed prior
        #    sessions, manual `python -m ...` debug runs, and any process
        #    that survived stop() (restart-race tail). Without this,
        #    health_manager's cmdline scan could re-adopt the orphan after
        #    spawn, making the user's start a no-op.
        if definition.health_url:
            port = self._extract_port_from_url(definition.health_url)
            if port:
                stale_pids = self._detect_all_pids_by_port(port)
                if stale_pids:
                    survivors = self._kill_pids_and_wait(
                        stale_pids, force=True, timeout=2.0,
                    )
                    self._emit_event(ProcessEvent(
                        service_key=service_key,
                        event_type="stale_cleared",
                        data={"port": port, "pids": stale_pids, "survivors": survivors}
                    ))
        else:
            try:
                stale_pids = self._detect_worker_pids(service_key)
                if stale_pids:
                    survivors = self._kill_pids_and_wait(
                        stale_pids, force=True, timeout=2.0,
                    )
                    self._emit_event(ProcessEvent(
                        service_key=service_key,
                        event_type="stale_cleared",
                        data={"cmdline_pids": stale_pids, "survivors": survivors}
                    ))
            except Exception as e:
                logger.debug(
                    "start_headless_stale_cleanup_failed service=%s error_type=%s error=%s",
                    service_key,
                    type(e).__name__,
                    str(e),
                )

        # Check tool availability
        if not self.check_tool_availability(service_key):
            state.status = ServiceStatus.FAILED
            state.last_error = state.tool_check_message
            self._emit_event(ProcessEvent(
                service_key=service_key,
                event_type="failed",
                data={"error": state.tool_check_message}
            ))
            return False

        # Use custom start function if provided
        if definition.custom_start:
            state.requested_running = True  # commit launch intent
            try:
                success = definition.custom_start(state)
                if success:
                    state.status = ServiceStatus.STARTING
                    state.health = HealthStatus.STARTING
                    state.last_error = ''
                    self._emit_event(ProcessEvent(
                        service_key=service_key,
                        event_type="started",
                        data={"custom": True}
                    ))
                else:
                    state.status = ServiceStatus.FAILED
                return success
            except Exception as e:
                state.status = ServiceStatus.FAILED
                state.last_error = f"Custom start failed: {str(e)}"
                self._emit_event(ProcessEvent(
                    service_key=service_key,
                    event_type="failed",
                    data={"error": str(e)}
                ))
                return False

        # Pre-start hook (e.g. frontend-preview build-before-start)
        if definition.pre_start_hook:
            try:
                proceed = definition.pre_start_hook(state)
            except Exception as e:
                state.status = ServiceStatus.FAILED
                state.health = HealthStatus.UNHEALTHY
                state.last_error = f"Pre-start hook failed: {e}"
                self._emit_event(ProcessEvent(
                    service_key=service_key,
                    event_type="failed",
                    data={"error": state.last_error},
                ))
                return False
            if not proceed:
                state.status = ServiceStatus.FAILED
                state.health = HealthStatus.UNHEALTHY
                if not state.last_error:
                    state.last_error = "Pre-start hook aborted"
                self._emit_event(ProcessEvent(
                    service_key=service_key,
                    event_type="failed",
                    data={"error": state.last_error},
                ))
                return False

        # Standard subprocess start
        state.requested_running = True  # commit launch intent (Option 2 — defer flip)
        try:
            # Prepare environment: os.environ + global exports + service overrides
            env = os.environ.copy()
            if self._global_exports_cache is None:
                from .service_settings import collect_global_exports
                all_defs = [s.definition for s in self.states.values()]
                self._global_exports_cache = collect_global_exports(all_defs)
            env.update(self._global_exports_cache)

            # Resolve $VAR_NAME placeholders in env_overrides using the
            # global exports as the authoritative namespace.
            if definition.env_overrides:
                from .services import substitute_env_vars
                resolved = substitute_env_vars(definition.env_overrides, env)
                env.update(resolved)

            # Build command — append per-service settings as CLI args
            extra_args: list[str] = []
            base_args = list(definition.args)
            if definition.settings_schema:
                from .service_settings import (
                    parse_schema, load_persisted, get_effective,
                    settings_to_args, settings_to_env, get_profile_overrides,
                )
                schema = parse_schema(definition.settings_schema)
                if schema:
                    persisted = load_persisted(service_key)
                    profile_ov = get_profile_overrides(service_key)
                    effective = get_effective(schema, persisted, profile_ov)
                    extra_args = settings_to_args(schema, effective)
                    env.update(settings_to_env(schema, effective))
                    # Patch base args from settings overrides
                    for field in schema:
                        key = field.get("key")
                        if key not in effective:
                            continue
                        # Port: update existing --port value and sync health URL
                        if key == "port" and "--port" in base_args:
                            new_port = str(effective["port"])
                            idx = base_args.index("--port")
                            if idx + 1 < len(base_args):
                                base_args[idx + 1] = new_port
                            # Keep health_url / url in sync so the health
                            # checker probes the port we actually start on.
                            from urllib.parse import urlparse, urlunparse
                            for attr in ("health_url", "url"):
                                old_url = getattr(definition, attr, None)
                                if old_url:
                                    parsed = urlparse(old_url)
                                    patched = parsed._replace(
                                        netloc=f"{parsed.hostname}:{new_port}"
                                    )
                                    setattr(definition, attr, urlunparse(patched))
                        # Reload toggle: remove uvicorn reload flags as a group.
                        if key == "reload" and not effective.get("reload"):
                            base_args = _remove_reload_args(base_args)
            cmd = [definition.program] + base_args + extra_args

            # Open log file for output (rotate if oversized)
            log_file_path = self.log_dir / f"{service_key}.log"
            from pixsim_logging.file_rotation import rotate_file
            rotate_file(str(log_file_path), max_bytes=50 * 1024 * 1024, backups=2)  # 50 MB, keep 2 old
            log_file = open(log_file_path, 'a', encoding='utf-8', buffering=1)

            try:
                # Platform-specific process group creation for detachment
                if os.name == 'nt':
                    # Windows: CREATE_NEW_PROCESS_GROUP for independence
                    creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP
                    try:
                        creation_flags |= subprocess.CREATE_BREAKAWAY_FROM_JOB
                    except AttributeError:
                        pass

                    # Add CREATE_NO_WINDOW to avoid console windows
                    if hasattr(subprocess, 'CREATE_NO_WINDOW'):
                        creation_flags |= subprocess.CREATE_NO_WINDOW

                    proc = subprocess.Popen(
                        cmd,
                        cwd=definition.cwd,
                        env=env,
                        stdout=log_file,
                        stderr=subprocess.STDOUT,
                        creationflags=creation_flags
                    )
                else:
                    # Unix: use start_new_session for process group
                    proc = subprocess.Popen(
                        cmd,
                        cwd=definition.cwd,
                        env=env,
                        stdout=log_file,
                        stderr=subprocess.STDOUT,
                        start_new_session=True
                    )
            finally:
                # Release the parent's handle; subprocess keeps its own inherited handle.
                # Without this the launcher pins the file until GC, blocking next rotation on Windows.
                try:
                    log_file.close()
                except Exception:
                    pass

            # Store process and update state
            self.processes[service_key] = proc
            state.pid = proc.pid
            state.status = ServiceStatus.STARTING
            state.health = HealthStatus.STARTING
            state.last_error = ''

            # On Windows, assign process to a Job Object for robust process tree management
            if WINDOWS_JOB_AVAILABLE:
                try:
                    job = windows_job.WindowsJobObject(name=f"PixSim7-{service_key}")
                    if job.assign_process(proc.pid):
                        self.job_objects[service_key] = job
                        # Job Object will automatically track all child processes
                        # and terminate them when the job is closed
                except Exception:
                    # Job Object creation failed, fall back to manual process tree management
                    pass

            self._emit_event(ProcessEvent(
                service_key=service_key,
                event_type="started",
                data={"pid": proc.pid}
            ))

            return True

        except Exception as e:
            state.status = ServiceStatus.FAILED
            state.health = HealthStatus.UNHEALTHY
            state.last_error = f"Failed to start: {str(e)}"

            self._emit_event(ProcessEvent(
                service_key=service_key,
                event_type="failed",
                data={"error": str(e)}
            ))

            return False

    def stop(self, service_key: str, graceful: bool = True) -> bool:
        """
        Stop a service.

        Args:
            service_key: Key of the service to stop
            graceful: If True, use SIGTERM first, then SIGKILL. If False, use SIGKILL immediately.

        Returns:
            True if stopped successfully
        """
        state = self.states.get(service_key)
        if not state:
            return False

        state.requested_running = False

        definition = state.definition

        # Use custom stop function if provided
        if definition.custom_stop:
            try:
                success = definition.custom_stop(state)
                if success:
                    state.status = ServiceStatus.STOPPED
                    state.health = HealthStatus.STOPPED
                    state.pid = None
                    state.detected_pid = None
                    self._emit_event(ProcessEvent(
                        service_key=service_key,
                        event_type="stopped",
                        data={"custom": True}
                    ))
                return success
            except Exception as e:
                state.last_error = f"Custom stop failed: {str(e)}"
                return False

        # Get the process
        proc = self.processes.get(service_key)
        target_pid = state.pid or state.detected_pid

        if not proc and not target_pid:
            # No PID available - try to detect by port and kill
            if definition.health_url:
                try:
                    port = self._extract_port_from_url(definition.health_url)
                    if port:
                        detected_pids = self._detect_all_pids_by_port(port)
                        if detected_pids:
                            force_kill = True if os.name == 'nt' else (not graceful)
                            survivors = self._kill_pids_and_wait(
                                detected_pids, force=force_kill, timeout=3.0,
                            )
                            state.status = ServiceStatus.STOPPED
                            state.health = HealthStatus.STOPPED
                            state.pid = None
                            state.detected_pid = None
                            self._emit_event(ProcessEvent(
                                service_key=service_key,
                                event_type="stopped",
                                data={"detected_pids": detected_pids, "survivors": survivors}
                            ))
                            return not survivors
                except Exception as e:
                    logger.debug(
                        "stop_detect_by_port_failed service=%s health_url=%s error_type=%s error=%s",
                        service_key,
                        definition.health_url,
                        type(e).__name__,
                        str(e),
                    )

            # Headless services (workers, bridges, etc.): detect by command line pattern
            try:
                worker_pids = self._detect_worker_pids(service_key)
                if worker_pids:
                    survivors = self._kill_pids_and_wait(
                        worker_pids, force=True, timeout=3.0,
                    )
                    state.status = ServiceStatus.STOPPED
                    state.health = HealthStatus.STOPPED
                    state.pid = None
                    state.detected_pid = None
                    self._emit_event(ProcessEvent(
                        service_key=service_key,
                        event_type="stopped",
                        data={"worker_pids": worker_pids, "survivors": survivors}
                    ))
                    return not survivors
            except Exception as e:
                logger.debug(
                    "stop_detect_headless_failed service=%s error_type=%s error=%s",
                    service_key,
                    type(e).__name__,
                    str(e),
                )

            # Already stopped or can't find process
            state.status = ServiceStatus.STOPPED
            state.health = HealthStatus.STOPPED
            return True

        # Kill the process - prefer Job Object if available
        try:
            # Check if we have a Job Object for this service
            job = self.job_objects.get(service_key)
            if job:
                # Use Job Object to terminate entire process tree
                # This is much more reliable than manual tree killing
                job.terminate(exit_code=0)
                job.close()
                self.job_objects.pop(service_key, None)
                # Defensive: also attempt to kill the process tree by PID in case
                # some children were created outside the Job (e.g., reloaders).
                if target_pid:
                    self._kill_process_tree(target_pid, force=not graceful)
            elif target_pid:
                # Fall back to manual process tree killing
                self._kill_process_tree(target_pid, force=not graceful)

            # Clean up
            if proc:
                try:
                    proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()

            self.processes[service_key] = None
            state.pid = None
            state.detected_pid = None
            state.status = ServiceStatus.STOPPED
            state.health = HealthStatus.STOPPED

            self._emit_event(ProcessEvent(
                service_key=service_key,
                event_type="stopped",
                data={}
            ))

            return True

        except Exception as e:
            state.last_error = f"Failed to stop: {str(e)}"
            # Clean up job object even on failure
            if service_key in self.job_objects:
                try:
                    self.job_objects[service_key].close()
                except Exception:
                    pass
                self.job_objects.pop(service_key, None)
            return False

    def restart(self, service_key: str) -> bool:
        """
        Restart a service.

        Args:
            service_key: Key of the service to restart

        Returns:
            True if restarted successfully
        """
        self.stop(service_key, graceful=True)
        time.sleep(0.5)  # Brief pause between stop and start
        return self.start(service_key)

    def recreate(self, service_key: str) -> bool:
        """
        Recreate a service in place via its custom_recreate handler.

        For docker-compose services this runs ``compose up -d`` (no preceding
        ``down``), so only containers whose definition changed are rebuilt and
        the rest keep running — applying a compose edit without the full-stack
        outage a stop→start would cause. Services without a custom_recreate
        handler fall back to a normal restart.

        Args:
            service_key: Key of the service to recreate

        Returns:
            True if recreated successfully
        """
        state = self.states.get(service_key)
        if not state:
            return False

        definition = state.definition
        if not definition.custom_recreate:
            # No in-place recreate for this service — fall back to restart.
            return self.restart(service_key)

        state.requested_running = True  # commit intent before the rebuild
        try:
            success = definition.custom_recreate(state)
            if success:
                state.status = ServiceStatus.STARTING
                state.health = HealthStatus.STARTING
                state.last_error = ''
                self._emit_event(ProcessEvent(
                    service_key=service_key,
                    event_type="started",
                    data={"recreate": True}
                ))
            else:
                state.status = ServiceStatus.FAILED
            return success
        except Exception as e:
            state.status = ServiceStatus.FAILED
            state.last_error = f"Recreate failed: {str(e)}"
            self._emit_event(ProcessEvent(
                service_key=service_key,
                event_type="failed",
                data={"error": str(e)}
            ))
            return False

    def get_state(self, service_key: str) -> Optional[ServiceState]:
        """Get the current state of a service."""
        return self.states.get(service_key)

    def get_all_states(self) -> Dict[str, ServiceState]:
        """Get states of all services."""
        return self.states.copy()

    def is_running(self, service_key: str) -> bool:
        """Check if a service is currently running."""
        state = self.states.get(service_key)
        if not state:
            return False
        return state.status in (ServiceStatus.RUNNING, ServiceStatus.STARTING)

    def _extract_port_from_url(self, url: str) -> Optional[int]:
        """Extract port number from URL."""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            return parsed.port
        except Exception:
            return None

    def _detect_pid_by_port(self, port: int) -> Optional[int]:
        """
        Detect PID of process listening on given port.

        Args:
            port: Port number to check

        Returns:
            First PID if found, None otherwise
        """
        pids = self._detect_all_pids_by_port(port)
        return pids[0] if pids else None

    def _detect_all_pids_by_port(self, port: int) -> List[int]:
        """
        Detect ALL PIDs of processes listening on given port.

        Important for uvicorn --reload which creates parent + child processes.

        Args:
            port: Port number to check

        Returns:
            List of PIDs (may be empty)
        """
        pids = []
        try:
            if os.name == 'nt':
                # Windows: use netstat
                result = subprocess.run(
                    ['netstat', '-ano'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    for line in result.stdout.split('\n'):
                        if f':{port}' in line and 'LISTENING' in line:
                            parts = line.split()
                            if len(parts) >= 5:
                                try:
                                    pid = int(parts[-1])
                                    if pid not in pids:
                                        pids.append(pid)
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
                        for pid_str in result.stdout.strip().split('\n'):
                            try:
                                pid = int(pid_str.strip())
                                if pid not in pids:
                                    pids.append(pid)
                            except ValueError:
                                pass
                except FileNotFoundError:
                    # lsof not available, try ss
                    import re
                    result = subprocess.run(
                        ['ss', '-lptn', f'sport = :{port}'],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    if result.returncode == 0:
                        # Extract all PIDs from ss output
                        for match in re.finditer(r'pid=(\d+)', result.stdout):
                            try:
                                pid = int(match.group(1))
                                if pid not in pids:
                                    pids.append(pid)
                            except ValueError:
                                pass
        except Exception as e:
            logger.debug(
                "detect_pids_by_port_failed port=%s error_type=%s error=%s",
                port,
                type(e).__name__,
                str(e),
            )
        return pids

    def _detect_worker_pids(self, service_key: str) -> List[int]:
        """Detect headless service PIDs by scanning process command lines.

        Delegates to the shared worker_detection scanner so the cmdline
        selectors stay identical to HealthManager's (a mismatch cross-matches
        worker processes — see launcher/core/worker_detection.py).
        """
        defn = self.services.get(service_key)
        definition_args = getattr(defn, "args", None) if defn else None
        return scan_pids(service_key, definition_args=definition_args)

    def _is_pid_alive(self, pid: Optional[int]) -> bool:
        """Cross-platform check whether a PID currently exists."""
        if not pid or pid <= 0:
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

    def _wait_for_pids_exit(self, pids: List[int], timeout: float = 3.0) -> List[int]:
        """Poll until all given PIDs have exited, or timeout. Returns survivors."""
        if not pids:
            return []
        deadline = time.time() + timeout
        survivors = list(pids)
        while survivors and time.time() < deadline:
            survivors = [p for p in survivors if self._is_pid_alive(p)]
            if not survivors:
                return []
            time.sleep(0.1)
        return survivors

    def _kill_pids_and_wait(
        self,
        pids: List[int],
        force: bool = True,
        timeout: float = 3.0,
    ) -> List[int]:
        """Kill PIDs and wait for them to exit; escalate to force on graceful timeout.

        Returns survivors that wouldn't die — empty list on full success.
        Without this wait, callers of stop() (notably restart()) can race the
        health_manager's headless cmdline scan, which re-adopts a still-exiting
        PID and silently makes a 'restart' a no-op. See plan
        launcher-health-probe-stability / mcp-service-restart-no-effect.
        """
        if not pids:
            return []
        for pid in pids:
            try:
                self._kill_process_tree(pid, force=force)
            except Exception as e:
                logger.debug(
                    "kill_process_tree_failed pid=%d error_type=%s error=%s",
                    pid, type(e).__name__, str(e),
                )
        survivors = self._wait_for_pids_exit(pids, timeout=timeout)
        if survivors and not force:
            # Graceful kill didn't take — escalate to force on the holdouts
            for pid in survivors:
                try:
                    self._kill_process_tree(pid, force=True)
                except Exception:
                    pass
            survivors = self._wait_for_pids_exit(survivors, timeout=1.5)
        if survivors:
            logger.warning(
                "pids_failed_to_exit pids=%s timeout=%.1fs",
                survivors, timeout,
            )
        return survivors

    def _kill_process_tree(self, pid: int, force: bool = False):
        """
        Kill a process and all its children.

        Args:
            pid: Process ID to kill
            force: If True, use SIGKILL/force (immediate). If False, use SIGTERM/gentle.
        """
        if os.name == 'nt':
            # Windows: use taskkill with /T for tree
            # Always use /F for now - graceful termination doesn't work well with uvicorn --reload
            cmd = ["taskkill", "/PID", str(pid), "/T", "/F"]
            subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        else:
            # Unix: kill process group
            try:
                pgid = os.getpgid(pid)
                sig = signal.SIGKILL if force else signal.SIGTERM
                os.killpg(pgid, sig)

                if not force:
                    # Wait briefly and force kill if still alive
                    time.sleep(0.5)
                    try:
                        os.killpg(pgid, 0)  # Check if still exists
                        os.killpg(pgid, signal.SIGKILL)  # Force kill
                    except ProcessLookupError:
                        pass  # Already dead

            except ProcessLookupError:
                # No process group, try single process
                try:
                    sig = signal.SIGKILL if force else signal.SIGTERM
                    os.kill(pid, sig)
                except ProcessLookupError:
                    pass  # Already dead

    def cleanup(self):
        """
        Clean up all processes managed by this manager.

        Should be called when shutting down.
        """
        for service_key in list(self.states.keys()):
            if self.is_running(service_key):
                self.stop(service_key, graceful=True)

        # Final cleanup: close any remaining job objects
        for service_key, job in list(self.job_objects.items()):
            try:
                job.close()
            except Exception:
                pass
        self.job_objects.clear()
