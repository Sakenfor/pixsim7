import os
import signal
import subprocess
import threading
from typing import Optional, Union
from PySide6.QtCore import QProcess, QTimer

try:
    from .services import ServiceDef
    from .config import service_env, ROOT, check_tool_available
    from .logger import launcher_logger as _launcher_logger
    from .status import HealthStatus
    from .docker_utils import compose_up_detached, compose_down
except ImportError:
    from services import ServiceDef
    from config import service_env, ROOT, check_tool_available
    from logger import launcher_logger as _launcher_logger
    from status import HealthStatus
    from docker_utils import compose_up_detached, compose_down


try:
    from .constants import MAX_LOG_LINES
except ImportError:
    from constants import MAX_LOG_LINES


class ServiceProcess:
    def __init__(self, defn: ServiceDef):
        self.defn = defn
        self.proc: Optional[Union[QProcess, subprocess.Popen]] = None
        self.running = False
        self.health_status = HealthStatus.STOPPED
        self.tool_available = True
        self.tool_check_message = ''
        self.last_error_line: str = ''
        self.log_buffer: list[str] = []  # In-memory log buffer
        self.max_log_lines = MAX_LOG_LINES
        self.detected_pid: Optional[int] = None  # PID of externally running process
        self.started_pid: Optional[int] = None  # PID of process we started (for detached processes)

        # Console log file persistence
        self.log_file_path = os.path.join(ROOT, 'data', 'logs', 'console', f'{defn.key}.log')
        self._ensure_log_dir()
        self._load_persisted_logs()

        # Log file monitoring for detached processes
        self._log_file_position = 0  # Track position in log file for incremental reading
        self._log_monitor_timer: Optional[QTimer] = None

    def _ensure_log_dir(self):
        """Ensure console log directory exists."""
        log_dir = os.path.dirname(self.log_file_path)
        try:
            os.makedirs(log_dir, exist_ok=True)
        except Exception:
            pass

    def _load_persisted_logs(self):
        """Load previously saved console logs on startup."""
        try:
            if os.path.exists(self.log_file_path):
                with open(self.log_file_path, 'r', encoding='utf-8', errors='replace') as f:
                    # Load last N lines to respect max_log_lines
                    lines = f.readlines()
                    self.log_buffer = [line.rstrip() for line in lines[-self.max_log_lines:]]
        except Exception as e:
            if _launcher_logger:
                try:
                    _launcher_logger.warning(
                        "failed_to_load_console_log",
                        service_key=self.defn.key,
                        error=str(e)
                    )
                except Exception:
                    pass

    def _persist_log_line(self, line: str):
        """Append a log line to the persistent file."""
        try:
            with open(self.log_file_path, 'a', encoding='utf-8') as f:
                f.write(line + '\n')
        except Exception:
            # Silently fail - don't interrupt logging if file write fails
            pass

    def _read_new_log_lines(self):
        """Read new lines from log file (for detached processes)."""
        try:
            if not os.path.exists(self.log_file_path):
                return

            with open(self.log_file_path, 'r', encoding='utf-8', errors='replace') as f:
                # Seek to last known position
                f.seek(self._log_file_position)
                new_lines = f.readlines()
                self._log_file_position = f.tell()

                # Add new lines to buffer
                for line in new_lines:
                    line = line.rstrip()
                    if line:
                        self.log_buffer.append(line)
                        # Check for errors
                        if '[ERR]' in line or '[ERROR]' in line:
                            # Extract the actual error message
                            parts = line.split('] ', 2)
                            if len(parts) >= 3:
                                self.last_error_line = parts[2]

                # Trim buffer if too large
                if len(self.log_buffer) > self.max_log_lines:
                    self.log_buffer = self.log_buffer[-self.max_log_lines:]

        except Exception as e:
            if _launcher_logger:
                try:
                    _launcher_logger.warning(
                        "log_read_failed",
                        service_key=self.defn.key,
                        error=str(e)
                    )
                except Exception:
                    pass

    def _start_log_monitor(self):
        """Start monitoring log file for detached processes."""
        if self._log_monitor_timer:
            self._log_monitor_timer.stop()

        self._log_monitor_timer = QTimer()
        self._log_monitor_timer.timeout.connect(self._read_new_log_lines)
        self._log_monitor_timer.start(500)  # Check every 500ms

    def _stop_log_monitor(self):
        """Stop monitoring log file."""
        if self._log_monitor_timer:
            self._log_monitor_timer.stop()
            self._log_monitor_timer = None

    def clear_logs(self):
        """Clear both in-memory buffer and persisted log file."""
        self.log_buffer.clear()
        self._log_file_position = 0  # Reset file position
        try:
            # Truncate the log file
            with open(self.log_file_path, 'w', encoding='utf-8') as f:
                pass  # Just open in write mode to truncate
        except Exception:
            pass

    def check_tool_availability(self) -> bool:
        if not self.defn.required_tool:
            self.tool_available = True
            self.tool_check_message = ''
            return True
        required = self.defn.required_tool
        available = check_tool_available(required)
        self.tool_available = available
        if not available:
            self.tool_check_message = f"Missing tool: {required}"
            if _launcher_logger:
                try:
                    _launcher_logger.warning("tool_missing", service_key=self.defn.key, tool=required)
                except Exception:
                    pass
        return available

    def start(self):
        if self.running:
            return
        if not self.check_tool_availability():
            return False

        # Special handling for DB: use compose up -d and do not keep a process open
        if self.defn.key == 'db':
            try:
                compose_file = os.path.join(ROOT, 'docker-compose.db-only.yml')
                ok, out = compose_up_detached(compose_file)
                if _launcher_logger:
                    try:
                        _launcher_logger.info("db_compose_up", success=ok)
                    except Exception:
                        pass
                if not ok:
                    self.last_error_line = out.strip() if out else 'compose up failed'
                    self.running = False
                    self.health_status = HealthStatus.UNHEALTHY
                    return False
                self.proc = None
                self.running = True
                self.health_status = HealthStatus.STARTING
                self.last_error_line = ''
                return True
            except Exception as e:
                self.last_error_line = str(e)
                self.running = False
                self.health_status = HealthStatus.UNHEALTHY
                return False

        # Use subprocess with process group detachment for true independence
        env = service_env()
        if self.defn.env_overrides:
            env.update(self.defn.env_overrides)

        if _launcher_logger:
            try:
                _launcher_logger.info(
                    "service_start",
                    service_key=self.defn.key,
                    program=self.defn.program,
                    args=self.defn.args,
                    cwd=self.defn.cwd,
                )
            except Exception:
                pass

        try:
            # Open log file for writing (append mode)
            log_file = open(self.log_file_path, 'a', encoding='utf-8', buffering=1)  # Line buffered

            # Prepare subprocess arguments
            cmd = [self.defn.program] + self.defn.args

            # Platform-specific process group creation
            if os.name == 'nt':
                # Windows: CREATE_NEW_PROCESS_GROUP | CREATE_BREAKAWAY_FROM_JOB
                # These flags make the process independent of the parent
                creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP
                try:
                    creation_flags |= subprocess.CREATE_BREAKAWAY_FROM_JOB
                except AttributeError:
                    # CREATE_BREAKAWAY_FROM_JOB not available in all Python versions
                    pass

                # Add CREATE_NO_WINDOW to avoid console windows
                if hasattr(subprocess, 'CREATE_NO_WINDOW'):
                    creation_flags |= subprocess.CREATE_NO_WINDOW

                self.proc = subprocess.Popen(
                    cmd,
                    cwd=self.defn.cwd,
                    env=env,
                    stdout=log_file,
                    stderr=subprocess.STDOUT,  # Merge stderr into stdout
                    creationflags=creation_flags
                )
            else:
                # Unix: use start_new_session to create new process group
                self.proc = subprocess.Popen(
                    cmd,
                    cwd=self.defn.cwd,
                    env=env,
                    stdout=log_file,
                    stderr=subprocess.STDOUT,
                    start_new_session=True  # Creates new process group on Unix
                )

            # Store PID and track process
            self.started_pid = self.proc.pid
            self.running = True
            self.health_status = HealthStatus.STARTING
            self.last_error_line = ''
            self.detected_pid = None  # Clear any detected PID since we're starting fresh

            # Initialize log file position to current end
            try:
                self._log_file_position = os.path.getsize(self.log_file_path)
            except Exception:
                self._log_file_position = 0

            # Start monitoring log file for updates
            self._start_log_monitor()

            if _launcher_logger:
                try:
                    _launcher_logger.info(
                        "service_started_detached",
                        service_key=self.defn.key,
                        pid=self.started_pid
                    )
                except Exception:
                    pass

            return True

        except Exception as e:
            self.last_error_line = f"Failed to start: {str(e)}"
            self.running = False
            self.health_status = HealthStatus.UNHEALTHY
            if _launcher_logger:
                try:
                    _launcher_logger.error(
                        "service_start_failed",
                        service_key=self.defn.key,
                        error=str(e)
                    )
                except Exception:
                    pass
            return False

    def stop(self, graceful=True):
        if not self.running:
            return
        if _launcher_logger:
            try:
                _launcher_logger.info("service_stop", service_key=self.defn.key, graceful=graceful)
            except Exception:
                pass

        if self.defn.key == 'db':
            try:
                compose_file = os.path.join(ROOT, 'docker-compose.db-only.yml')
                ok, _ = compose_down(compose_file)
                if _launcher_logger:
                    try:
                        _launcher_logger.info("db_compose_down", success=ok)
                    except Exception:
                        pass
                self.proc = None
                self.running = False
                self.health_status = HealthStatus.STOPPED
                return
            except Exception:
                self.proc = None
                self.running = False
                self.health_status = HealthStatus.UNHEALTHY
                return

        # Handle subprocess.Popen (detached process)
        if isinstance(self.proc, subprocess.Popen):
            self._stop_log_monitor()

            # Use started_pid (our process) or detected_pid (external process)
            target_pid = self.started_pid or self.detected_pid

            if target_pid:
                try:
                    from .process_utils import kill_process_by_pid
                except ImportError:
                    from process_utils import kill_process_by_pid

                force = not graceful
                success = kill_process_by_pid(target_pid, force=force)

                if _launcher_logger:
                    try:
                        _launcher_logger.info(
                            "detached_process_kill",
                            service_key=self.defn.key,
                            pid=target_pid,
                            force=force,
                            success=success
                        )
                    except Exception:
                        pass

            self.proc = None
            self.started_pid = None
            self.running = False
            self.health_status = HealthStatus.STOPPED
            return

        # Handle detected process (not started by launcher)
        if self.proc is None and self.detected_pid:
            try:
                from .process_utils import kill_process_by_pid
            except ImportError:
                from process_utils import kill_process_by_pid

            force = not graceful
            old_pid = self.detected_pid
            success = kill_process_by_pid(self.detected_pid, force=force)
            if _launcher_logger:
                try:
                    _launcher_logger.info(
                        "detected_process_kill",
                        service_key=self.defn.key,
                        pid=self.detected_pid,
                        force=force,
                        success=success
                    )
                except Exception:
                    pass

            # Verify process is actually gone (even if kill reported success)
            # Windows can report success but process may linger or be restarted
            try:
                from .process_utils import find_pid_by_port
            except ImportError:
                from process_utils import find_pid_by_port

            # Get port for verification
            port = None
            if self.defn.health_url:
                try:
                    from urllib.parse import urlparse
                    parsed = urlparse(self.defn.health_url)
                    port = parsed.port
                except Exception:
                    pass

            # Aggressive retry loop: keep killing any PID on the port until free or timeout
            import time, os as _os, subprocess as _sp
            retries = 0
            current_pid = None
            if success:
                time.sleep(0.5)  # initial settle
            while True:
                current_pid = find_pid_by_port(port) if port else None
                if not current_pid:
                    break

                # If PID changed (reloader respawn), target the new one
                if current_pid != old_pid and _launcher_logger:
                    try:
                        _launcher_logger.warning(
                            "detected_new_pid_after_kill",
                            service_key=self.defn.key,
                            old_pid=old_pid,
                            new_pid=current_pid,
                            port=port
                        )
                    except Exception:
                        pass

                # Try force kill for the PID still listening
                kill_process_by_pid(current_pid, force=True)
                time.sleep(0.8)
                retries += 1

                # Fallback: on Windows and backend, also try killing by window title
                if (_os.name == 'nt') and (self.defn.key == 'backend') and (retries == 2):
                    try:
                        _sp.run([
                            "taskkill", "/F", "/FI", "WINDOWTITLE eq PixSim7 Backend*"
                        ], capture_output=True, text=True, timeout=5)
                        if _launcher_logger:
                            try:
                                _launcher_logger.info(
                                    "taskkill_window_title_attempt",
                                    service_key=self.defn.key
                                )
                            except Exception:
                                pass
                    except Exception:
                        pass

                # On Windows with backend, attempt to find uvicorn root and kill the tree
                if (_os.name == 'nt') and (self.defn.key == 'backend') and retries == 3:
                    try:
                        from .process_utils import find_uvicorn_root_pid_windows
                    except ImportError:
                        from process_utils import find_uvicorn_root_pid_windows
                    try:
                        root_pid = find_uvicorn_root_pid_windows(current_pid)
                    except Exception:
                        root_pid = None
                    if root_pid and root_pid != current_pid:
                        try:
                            _sp.run(["taskkill", "/PID", str(root_pid), "/T", "/F"], capture_output=True, text=True, timeout=6)
                            if _launcher_logger:
                                try:
                                    _launcher_logger.info(
                                        "killed_uvicorn_root",
                                        service_key=self.defn.key,
                                        root_pid=root_pid,
                                        child_pid=current_pid
                                    )
                                except Exception:
                                    pass
                        except Exception:
                            pass

                if retries >= 8:  # ~6-7 seconds total
                    break

            if not current_pid:
                # Process is gone (or different PID) - success!
                self.detected_pid = None
                self.running = False
                self.health_status = HealthStatus.STOPPED
                if _launcher_logger and False:
                    try:
                        _launcher_logger.info(
                            "detected_process_killed_verified",
                            service_key=self.defn.key,
                            old_pid=old_pid
                        )
                    except Exception:
                        pass
            elif success and current_pid:
                # Kill reported success but process still there - this is suspicious
                # Process may be hung or immediately restarted
                if _launcher_logger:
                    try:
                        _launcher_logger.warning(
                            "detected_process_kill_success_but_still_running",
                            service_key=self.defn.key,
                            pid=old_pid,
                            current_pid=current_pid,
                            port=port,
                            msg="Process survived kill attempt - may be hung or auto-restarting"
                        )
                    except Exception:
                        pass
                # Keep detected_pid so user can try force kill
                self.health_status = HealthStatus.UNHEALTHY
            else:
                # Kill failed entirely
                if _launcher_logger:
                    try:
                        _launcher_logger.warning(
                            "detected_process_kill_failed_still_running",
                            service_key=self.defn.key,
                            pid=old_pid,
                            current_pid=current_pid,
                            port=port
                        )
                    except Exception:
                        pass
                # Keep detected_pid for retry
                # Final fallback: scan for backend candidates by command line and kill their trees (Windows)
                try:
                    if _os.name == 'nt' and self.defn.key == 'backend':
                        try:
                            from .process_utils import find_backend_candidate_pids_windows
                        except ImportError:
                            from process_utils import find_backend_candidate_pids_windows
                        cand_pids = find_backend_candidate_pids_windows(port)
                        if cand_pids:
                            for cp in cand_pids:
                                try:
                                    _sp.run(["taskkill", "/PID", str(cp), "/T", "/F"], capture_output=True, text=True, timeout=6)
                                except Exception:
                                    pass
                            # Give a moment and re-check port
                            time.sleep(1.0)
                            current_pid2 = find_pid_by_port(port) if port else None
                            if not current_pid2:
                                self.detected_pid = None
                                self.running = False
                                self.health_status = HealthStatus.STOPPED
                                if _launcher_logger:
                                    try:
                                        _launcher_logger.info("fallback_kill_by_commandline_succeeded", service_key=self.defn.key)
                                    except Exception:
                                        pass
                                return
                except Exception:
                    pass
            return

        if graceful and self.defn.key == 'backend':
            if self.proc:
                self.proc.terminate()
                try:
                    from .constants import THREAD_SHUTDOWN_TIMEOUT_MS
                except ImportError:
                    from constants import THREAD_SHUTDOWN_TIMEOUT_MS
                QTimer.singleShot(THREAD_SHUTDOWN_TIMEOUT_MS, lambda: self._finish_stop())
        else:
            self._kill_process_tree()
            # Give QProcess time to clean up before destroying it
            if self.proc:
                self.proc.waitForFinished(1000)  # Wait up to 1 second
                self.proc = None
            self.running = False
            self.health_status = HealthStatus.STOPPED

    def _finish_stop(self):
        # Handle subprocess.Popen
        if isinstance(self.proc, subprocess.Popen):
            try:
                # Check if still running
                if self.proc.poll() is None:
                    if _launcher_logger:
                        try:
                            _launcher_logger.warning("service_force_kill", service_key=self.defn.key)
                        except Exception:
                            pass
                    self._kill_process_tree()
            except Exception:
                pass
            self._stop_log_monitor()
            self.proc = None
            self.started_pid = None
            self.running = False
            self.health_status = HealthStatus.STOPPED
            return

        # Handle QProcess
        if self.proc and self.proc.state() == QProcess.Running:
            if _launcher_logger:
                try:
                    _launcher_logger.warning("service_force_kill", service_key=self.defn.key)
                except Exception:
                    pass
            self._kill_process_tree()
        if self.proc:
            exit_code = self.proc.exitCode()
            if _launcher_logger:
                try:
                    _launcher_logger.info("service_exit", service_key=self.defn.key, exit_code=exit_code)
                except Exception:
                    pass
            # Give QProcess time to clean up before destroying it
            self.proc.waitForFinished(1000)  # Wait up to 1 second
            self.proc = None
        self.running = False
        self.health_status = HealthStatus.STOPPED

    def _strip_ansi_codes(self, text: str) -> str:
        """Remove ANSI escape sequences (color codes) from text."""
        import re
        # Pattern matches ANSI escape sequences
        ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
        return ansi_escape.sub('', text)

    def _capture(self, is_err: bool):
        if not self.proc:
            return
        data = self.proc.readAllStandardError() if is_err else self.proc.readAllStandardOutput()
        text = bytes(data).decode('utf-8', errors='replace')  # Show � for invalid chars instead of dropping them
        for line in text.splitlines():
            if line.strip():
                # Strip ANSI color codes for cleaner console display
                clean_line = self._strip_ansi_codes(line.strip())

                # Add to in-memory buffer
                from datetime import datetime
                timestamp = datetime.now().strftime('%H:%M:%S')
                stream_tag = 'ERR' if is_err else 'OUT'
                log_line = f"[{timestamp}] [{stream_tag}] {clean_line}"
                self.log_buffer.append(log_line)
                # Persist to file
                self._persist_log_line(log_line)
                # Trim buffer if too large
                if len(self.log_buffer) > self.max_log_lines:
                    self.log_buffer = self.log_buffer[-self.max_log_lines:]

            if is_err and line.strip():
                self.last_error_line = self._strip_ansi_codes(line.strip())
            if _launcher_logger and line.strip():
                try:
                    _launcher_logger.debug(
                        "service_output",
                        service_key=self.defn.key,
                        stream="stderr" if is_err else "stdout",
                        line=self._strip_ansi_codes(line.strip()),
                    )
                except Exception:
                    pass

    def _finished(self, exit_code, exit_status):
        from PySide6.QtCore import QProcess

        self.running = False
        self.health_status = HealthStatus.STOPPED

        # Map exit status to readable messages
        status_name = "Unknown"
        if exit_status == QProcess.NormalExit:
            status_name = "Normal"
        elif exit_status == QProcess.CrashExit:
            status_name = "Crashed"

        # Add exit info to log buffer for user visibility
        from datetime import datetime
        timestamp = datetime.now().strftime('%H:%M:%S')

        if exit_code != 0 or exit_status != QProcess.NormalExit:
            # Abnormal exit - show as error
            log_line = f"[{timestamp}] [ERROR] Service exited abnormally: exit_code={exit_code}, status={status_name}"
            self.log_buffer.append(log_line)
            self._persist_log_line(log_line)

            if self.last_error_line:
                error_line = f"[{timestamp}] [ERROR] Last error: {self.last_error_line}"
                self.log_buffer.append(error_line)
                self._persist_log_line(error_line)
        else:
            # Normal exit
            log_line = f"[{timestamp}] [INFO] Service stopped normally"
            self.log_buffer.append(log_line)
            self._persist_log_line(log_line)

        if _launcher_logger:
            try:
                _launcher_logger.info(
                    "service_exit",
                    service_key=self.defn.key,
                    exit_code=exit_code,
                    exit_status=status_name,
                    last_error=self.last_error_line if self.last_error_line else None
                )
            except Exception:
                pass

    def _error_occurred(self, error):
        """Handle QProcess errors during startup or runtime."""
        from PySide6.QtCore import QProcess

        # Map error codes to readable messages
        error_messages = {
            QProcess.FailedToStart: "Failed to start - program not found or insufficient permissions",
            QProcess.Crashed: "Process crashed",
            QProcess.Timedout: "Operation timed out",
            QProcess.WriteError: "Error writing to process",
            QProcess.ReadError: "Error reading from process",
            QProcess.UnknownError: "Unknown error occurred"
        }

        error_msg = error_messages.get(error, f"Unknown error code: {error}")
        self.last_error_line = error_msg

        # Add error to log buffer so it's visible in the console
        from datetime import datetime
        timestamp = datetime.now().strftime('%H:%M:%S')
        log_line = f"[{timestamp}] [ERROR] {error_msg}"
        self.log_buffer.append(log_line)
        self._persist_log_line(log_line)

        # Add details about the command that failed
        details_line = f"[{timestamp}] [ERROR] Command: {self.defn.program} {' '.join(self.defn.args)}"
        self.log_buffer.append(details_line)
        self._persist_log_line(details_line)

        # Add working directory info
        cwd_line = f"[{timestamp}] [ERROR] Working directory: {self.defn.cwd}"
        self.log_buffer.append(cwd_line)
        self._persist_log_line(cwd_line)

        if _launcher_logger:
            try:
                _launcher_logger.error(
                    "service_process_error",
                    service_key=self.defn.key,
                    error_type=error_messages.get(error, "unknown"),
                    program=self.defn.program,
                    args=self.defn.args,
                    cwd=self.defn.cwd
                )
            except Exception:
                pass

        # Mark service as unhealthy
        self.running = False
        self.health_status = HealthStatus.UNHEALTHY

    def _kill_process_tree(self):
        """Kill process tree with proper error handling and verification."""
        if not self.proc:
            return

        # Get PID (handle both QProcess and subprocess.Popen)
        pid = None
        try:
            if isinstance(self.proc, subprocess.Popen):
                pid = self.proc.pid or self.started_pid
            else:
                # QProcess
                pid = int(self.proc.processId())  # type: ignore[attr-defined]
        except Exception as e:
            if _launcher_logger:
                try:
                    _launcher_logger.warning(
                        "process_tree_kill_no_pid",
                        service_key=self.defn.key,
                        error=str(e)
                    )
                except Exception:
                    pass
            # Fallback: try kill() method
            try:
                if isinstance(self.proc, subprocess.Popen):
                    self.proc.kill()
                else:
                    self.proc.kill()  # QProcess
            except Exception as kill_err:
                if _launcher_logger:
                    try:
                        _launcher_logger.error(
                            "process_kill_failed",
                            service_key=self.defn.key,
                            error=str(kill_err)
                        )
                    except Exception:
                        pass
            return

        if not pid:
            return

        # Kill process tree
        try:
            if os.name == 'nt':
                import subprocess as _sp
                result = _sp.run(
                    ["taskkill", "/PID", str(pid), "/T", "/F"],
                    capture_output=True,
                    text=True,
                    timeout=10
                )

                # Check if taskkill succeeded
                if result.returncode != 0:
                    stderr = result.stderr.strip() if result.stderr else ""
                    # ERROR: The process "xxxx" not found is ok - process already gone
                    if "not found" not in stderr.lower() and "no task" not in stderr.lower():
                        if _launcher_logger:
                            try:
                                _launcher_logger.warning(
                                    "taskkill_failed",
                                    service_key=self.defn.key,
                                    pid=pid,
                                    returncode=result.returncode,
                                    stderr=stderr
                                )
                            except Exception:
                                pass
                else:
                    if _launcher_logger:
                        try:
                            _launcher_logger.info(
                                "process_tree_killed",
                                service_key=self.defn.key,
                                pid=pid,
                                method="taskkill"
                            )
                        except Exception:
                            pass
            else:
                # Unix: try to kill process group first (SIGTERM for graceful, then SIGKILL if needed)
                try:
                    pgid = os.getpgid(pid)
                    os.killpg(pgid, signal.SIGTERM)

                    if _launcher_logger:
                        try:
                            _launcher_logger.info(
                                "process_group_killed",
                                service_key=self.defn.key,
                                pid=pid,
                                pgid=pgid,
                                signal="SIGTERM"
                            )
                        except Exception:
                            pass

                    # Wait briefly and force kill if still alive
                    import time
                    time.sleep(0.5)
                    try:
                        # Check if process group still exists
                        os.killpg(pgid, 0)  # Signal 0 just checks existence
                        # Still exists, force kill
                        os.killpg(pgid, signal.SIGKILL)
                        if _launcher_logger:
                            try:
                                _launcher_logger.warning(
                                    "process_group_force_killed",
                                    service_key=self.defn.key,
                                    pgid=pgid,
                                    signal="SIGKILL"
                                )
                            except Exception:
                                pass
                    except ProcessLookupError:
                        # Process group is gone, success
                        pass

                except ProcessLookupError:
                    # Process group doesn't exist, try single process
                    if _launcher_logger:
                        try:
                            _launcher_logger.info(
                                "process_no_group",
                                service_key=self.defn.key,
                                pid=pid
                            )
                        except Exception:
                            pass
                    try:
                        os.kill(pid, signal.SIGTERM)
                        if _launcher_logger:
                            try:
                                _launcher_logger.info(
                                    "process_killed",
                                    service_key=self.defn.key,
                                    pid=pid,
                                    signal="SIGTERM"
                                )
                            except Exception:
                                pass
                    except ProcessLookupError:
                        # Process already gone
                        pass
                except Exception as e:
                    if _launcher_logger:
                        try:
                            _launcher_logger.error(
                                "process_kill_error",
                                service_key=self.defn.key,
                                pid=pid,
                                error=str(e)
                            )
                        except Exception:
                            pass
                    # Fallback to QProcess.kill()
                    try:
                        self.proc.kill()
                    except Exception:
                        pass

        except Exception as e:
            if _launcher_logger:
                try:
                    _launcher_logger.error(
                        "process_tree_kill_failed",
                        service_key=self.defn.key,
                        pid=pid,
                        error=str(e)
                    )
                except Exception:
                    pass
            # Final fallback: QProcess.kill()
            try:
                self.proc.kill()
            except Exception:
                pass
