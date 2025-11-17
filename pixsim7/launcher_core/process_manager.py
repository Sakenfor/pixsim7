"""
Process Manager - Pure Python service process management.

Manages service lifecycle (start/stop/restart) without UI dependencies.
Can be used from Qt, web, CLI, or test environments.
"""

import os
import signal
import subprocess
import time
from typing import Dict, Optional, Callable, List, Any
from pathlib import Path

from .types import (
    ServiceDefinition,
    ServiceState,
    ServiceStatus,
    HealthStatus,
    ProcessEvent
)

# Import Windows Job Objects for robust process tree management
try:
    from . import windows_job
    WINDOWS_JOB_AVAILABLE = windows_job.is_available()
except ImportError:
    WINDOWS_JOB_AVAILABLE = False


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
            log_dir: Directory for console logs (default: data/logs/console)
            event_callback: Optional callback for process events
        """
        self.services: Dict[str, ServiceDefinition] = {s.key: s for s in services}
        self.states: Dict[str, ServiceState] = {}
        self.processes: Dict[str, Optional[subprocess.Popen]] = {}
        self.job_objects: Dict[str, Any] = {}  # Windows Job Objects for process tree management
        self.event_callback = event_callback

        # Set up log directory
        if log_dir is None:
            # Default to data/logs/console relative to project root
            # Assume we're in pixsim7/launcher_core, so go up to root
            root = Path(__file__).parent.parent.parent
            log_dir = root / 'data' / 'logs' / 'console'

        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)

        # Initialize states for all services
        for service in services:
            self.states[service.key] = ServiceState(definition=service)

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

        # Don't start if already running
        if state.status in (ServiceStatus.RUNNING, ServiceStatus.STARTING):
            return True

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

        definition = state.definition

        # Use custom start function if provided
        if definition.custom_start:
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

        # Standard subprocess start
        try:
            # Prepare environment
            env = os.environ.copy()
            if definition.env_overrides:
                env.update(definition.env_overrides)

            # Build command
            cmd = [definition.program] + definition.args

            # Open log file for output
            log_file_path = self.log_dir / f"{service_key}.log"
            log_file = open(log_file_path, 'a', encoding='utf-8', buffering=1)

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
            # Already stopped
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

    def _kill_process_tree(self, pid: int, force: bool = False):
        """
        Kill a process and all its children.

        Args:
            pid: Process ID to kill
            force: If True, use SIGKILL (immediate). If False, use SIGTERM (graceful).
        """
        if os.name == 'nt':
            # Windows: use taskkill with /T for tree
            flag = "/F" if force else ""
            cmd = ["taskkill", "/PID", str(pid), "/T"]
            if flag:
                cmd.append(flag)

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
