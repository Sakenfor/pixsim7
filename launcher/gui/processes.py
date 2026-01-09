import os
import signal
import subprocess
import threading
from typing import Optional, Union
from PySide6.QtCore import QProcess, QTimer
from pixsim_logging.file_rotation import rotate_file, append_line

try:
    from .services import ServiceDef
    from .config import service_env, ROOT, check_tool_available
    from .logger import launcher_logger as _launcher_logger
    from .status import HealthStatus
    from .docker_utils import compose_up_detached, compose_down, compose_logs
    from . import pid_store
except ImportError:
    from services import ServiceDef
    from config import service_env, ROOT, check_tool_available
    from logger import launcher_logger as _launcher_logger
    from status import HealthStatus
    from docker_utils import compose_up_detached, compose_down, compose_logs
    import pid_store


try:
    from .constants import (
        MAX_LOG_LINES,
        CONSOLE_MAX_LINE_CHARS,
        CONSOLE_MAX_BUFFER_CHARS,
        LOG_FILE_MAX_BYTES,
        LOG_FILE_BACKUP_COUNT,
    )
except ImportError:
    from constants import (
        MAX_LOG_LINES,
        CONSOLE_MAX_LINE_CHARS,
        CONSOLE_MAX_BUFFER_CHARS,
        LOG_FILE_MAX_BYTES,
        LOG_FILE_BACKUP_COUNT,
    )


def _log(event: str, level: str = "info", **kwargs):
    """Helper to log with launcher_logger, silently failing if unavailable."""
    if not _launcher_logger:
        return
    try:
        getattr(_launcher_logger, level)(event, **kwargs)
    except Exception:
        pass


# Lazy imports for process_utils to avoid circular imports
_process_utils = None

def _get_process_utils():
    global _process_utils
    if _process_utils is None:
        try:
            from . import process_utils as pu
        except ImportError:
            import process_utils as pu
        _process_utils = pu
    return _process_utils


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
        self.persisted_pid: Optional[int] = None  # PID loaded from persistent storage (survives launcher restart)
        self.requested_running = False  # User's intended state (start/stop button clicks)
        self.externally_managed = False  # True if service is running outside launcher control

        # Load persisted PID from disk (survives launcher restarts)
        self._load_persisted_pid()

        # Console log file persistence
        self.log_file_path = os.path.join(ROOT, 'data', 'logs', 'console', f'{defn.key}.log')
        self._ensure_log_dir()
        self._buffer_char_count = 0
        self._log_file_position = 0  # Track position in log file for incremental reading
        self._log_monitor_timer: Optional[QTimer] = None
        self._load_persisted_logs()

        # Log file monitoring for detached processes

    def _ensure_log_dir(self):
        """Ensure console log directory exists."""
        log_dir = os.path.dirname(self.log_file_path)
        try:
            os.makedirs(log_dir, exist_ok=True)
        except Exception:
            pass

    def _load_persisted_pid(self):
        """Load PID from persistent storage if the process is still running."""
        try:
            stored_pid = pid_store.get_pid(self.defn.key)
            if stored_pid and pid_store.is_pid_running(stored_pid):
                self.persisted_pid = stored_pid
                _log("loaded_persisted_pid", service_key=self.defn.key, pid=stored_pid)
            elif stored_pid:
                # PID was stored but process is gone - clean up
                pid_store.clear_pid(self.defn.key)
        except Exception:
            pass

    def _save_persisted_pid(self, pid: int):
        """Save PID to persistent storage."""
        if pid:
            try:
                pid_store.save_pid(self.defn.key, pid)
                self.persisted_pid = pid
            except Exception:
                pass

    def _clear_persisted_pid(self):
        """Clear PID from persistent storage."""
        try:
            pid_store.clear_pid(self.defn.key)
            self.persisted_pid = None
        except Exception:
            pass

    def get_effective_pid(self) -> Optional[int]:
        """Get the best known PID for this service (started > detected > persisted)."""
        return self.started_pid or self.detected_pid or self.persisted_pid

    def _get_port_from_health_url(self) -> Optional[int]:
        """Extract port from health_url if available."""
        if not getattr(self.defn, "health_url", None):
            return None
        try:
            from urllib.parse import urlparse
            return urlparse(self.defn.health_url).port
        except Exception:
            return None

    def _mark_stopped(self, status: HealthStatus = HealthStatus.STOPPED):
        """Common cleanup when service stops."""
        self._stop_log_monitor()
        self.proc = None
        self.started_pid = None
        self.detected_pid = None
        self.running = False
        self.health_status = status
        self._clear_persisted_pid()

    def _load_persisted_logs(self):
        """Load previously saved console logs on startup."""
        try:
            if os.path.exists(self.log_file_path):
                with open(self.log_file_path, 'r', encoding='utf-8', errors='replace') as f:
                    lines = f.readlines()
                    for line in lines[-self.max_log_lines:]:
                        clean = line.rstrip()
                        if clean:
                            self._append_log_buffer(clean)
                self._log_file_position = os.path.getsize(self.log_file_path)
        except Exception as e:
            _log("failed_to_load_console_log", "warning", service_key=self.defn.key, error=str(e))

    def _persist_log_line(self, line: str, *, sanitized: bool = False):
        """Append a log line to the persistent file."""
        try:
            if not sanitized:
                line = self._sanitize_log_line(line)
            rotated = rotate_file(self.log_file_path, LOG_FILE_MAX_BYTES, LOG_FILE_BACKUP_COUNT)
            if rotated:
                self._log_file_position = 0
            append_line(self.log_file_path, line + '\n')
        except Exception:
            # Silently fail - don't interrupt logging if file write fails
            pass

    def _append_log_buffer(self, line: str):
        """Append sanitized line to buffer enforcing char/line caps."""
        # Keep ANSI sequences in the stored line so the console
        # formatter can render colors/styles. Only clamp extremely
        # long lines for performance.
        sanitized = self._sanitize_log_line(line)
        self.log_buffer.append(sanitized)
        self._buffer_char_count += len(sanitized)
        while len(self.log_buffer) > self.max_log_lines or self._buffer_char_count > CONSOLE_MAX_BUFFER_CHARS:
            removed = self.log_buffer.pop(0)
            self._buffer_char_count -= len(removed)
        return sanitized

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
                        sanitized = self._append_log_buffer(line)
                        if '[ERR]' in sanitized or '[ERROR]' in sanitized:
                            parts = sanitized.split('] ', 2)
                            if len(parts) >= 3:
                                self.last_error_line = parts[2]

        except Exception as e:
            _log("log_read_failed", "warning", service_key=self.defn.key, error=str(e))

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

    def _fetch_docker_logs(self):
        """Fetch logs from Docker containers for db service."""
        if self.defn.key != 'db' or not self.running:
            return

        try:
            compose_file = os.path.join(ROOT, 'docker-compose.db-only.yml')
            ok, logs = compose_logs(compose_file, tail=50, since='30s')
            if ok and logs:
                # Parse docker-compose logs format: "container_name  | log line"
                from datetime import datetime
                timestamp = datetime.now().strftime('%H:%M:%S')

                for line in logs.strip().split('\n'):
                    if not line.strip():
                        continue
                    # Format: add timestamp prefix for consistency
                    formatted = f"[{timestamp}] [OUT] {line}"
                    # Only add if not already in buffer (avoid duplicates)
                    if formatted not in self.log_buffer[-20:]:
                        self._append_log_buffer(formatted)
                        self._persist_log_line(formatted, sanitized=True)
        except Exception as e:
            _log("docker_logs_fetch_failed", "warning", error=str(e))

    def _start_docker_log_monitor(self):
        """Start monitoring Docker container logs."""
        if self._log_monitor_timer:
            self._log_monitor_timer.stop()

        self._log_monitor_timer = QTimer()
        self._log_monitor_timer.timeout.connect(self._fetch_docker_logs)
        self._log_monitor_timer.start(5000)  # Fetch every 5 seconds
        # Fetch immediately
        self._fetch_docker_logs()

    def clear_logs(self):
        """Clear both in-memory buffer and persisted log file."""
        self.log_buffer.clear()
        self._log_file_position = 0  # Reset file position
        self._buffer_char_count = 0
        try:
            # Truncate the log file
            with open(self.log_file_path, 'w', encoding='utf-8') as f:
                pass  # Just open in write mode to truncate
        except Exception:
            pass

    def attach_logs(self):
        """
        Attach to this service's log file even if the process was
        started externally.

        This starts the incremental file monitor so new lines written
        to data/logs/console/{key}.log are reflected in the in-memory
        buffer and console tab.
        """
        try:
            if os.path.exists(self.log_file_path):
                # Start tailing from the end to avoid replaying old lines
                self._log_file_position = os.path.getsize(self.log_file_path)
            else:
                self._log_file_position = 0
        except Exception:
            self._log_file_position = 0

        # Mark as externally managed so the UI can indicate this state
        self.externally_managed = True

        # Begin monitoring the log file for new content
        self._start_log_monitor()

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
            _log("tool_missing", "warning", service_key=self.defn.key, tool=required)
        return available

    def start(self):
        if self.running:
            return
        if not self.check_tool_availability():
            return False

        # Mark that user requested the service to be running
        self.requested_running = True
        self.externally_managed = False

        # Special handling for DB: use compose up -d and do not keep a process open
        if self.defn.key == 'db':
            try:
                compose_file = os.path.join(ROOT, 'docker-compose.db-only.yml')
                ok, out = compose_up_detached(compose_file)
                _log("db_compose_up", service_key=self.defn.key, success=ok)
                if not ok:
                    self.last_error_line = out.strip() if out else 'compose up failed'
                    self.running = False
                    self.health_status = HealthStatus.UNHEALTHY
                    return False
                self.proc = None
                self.running = True
                self.health_status = HealthStatus.STARTING
                self.last_error_line = ''
                # Start monitoring Docker container logs
                self._start_docker_log_monitor()
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

        _log("service_start", service_key=self.defn.key, program=self.defn.program,
             args=self.defn.args, cwd=self.defn.cwd)

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

            # Persist PID so it survives launcher restarts
            self._save_persisted_pid(self.started_pid)

            # Initialize log file position to current end
            try:
                self._log_file_position = os.path.getsize(self.log_file_path)
            except Exception:
                self._log_file_position = 0

            # Start monitoring log file for updates
            self._start_log_monitor()
            _log("service_started_detached", service_key=self.defn.key, pid=self.started_pid)
            return True

        except Exception as e:
            self.last_error_line = f"Failed to start: {str(e)}"
            self.running = False
            self.health_status = HealthStatus.UNHEALTHY
            _log("service_start_failed", "error", service_key=self.defn.key, error=str(e))
            return False

    def stop(self, graceful=True):
        if not self.running:
            return

        # Mark that user requested the service to be stopped
        self.requested_running = False
        _log("service_stop", service_key=self.defn.key, graceful=graceful)

        # Best-effort PID detection even if health worker hasn't run yet.
        # Check persisted_pid first (survives launcher restart), then try port detection.
        if self.proc is None and not self.detected_pid and self.persisted_pid:
            self.detected_pid = self.persisted_pid
            _log("stop_using_persisted_pid", service_key=self.defn.key, pid=self.persisted_pid)

        if self.proc is None and not self.detected_pid:
            port = self._get_port_from_health_url()
            if port:
                try:
                    pu = _get_process_utils()
                    pid = pu.find_pid_by_port(port)
                    if pid:
                        self.detected_pid = pid
                        _log("stop_detected_pid_by_port", service_key=self.defn.key, port=port, pid=pid)
                except Exception:
                    pass

        if self.defn.key == 'db':
            try:
                compose_file = os.path.join(ROOT, 'docker-compose.db-only.yml')
                ok, _ = compose_down(compose_file)
                _log("db_compose_down", service_key=self.defn.key, success=ok)
                self._mark_stopped()
            except Exception:
                self._mark_stopped(HealthStatus.UNHEALTHY)
            return

        # Handle subprocess.Popen (detached process)
        if isinstance(self.proc, subprocess.Popen):
            target_pid = self.get_effective_pid()
            if target_pid:
                pu = _get_process_utils()
                force = not graceful
                success = pu.kill_process_by_pid(target_pid, force=force)
                _log("detached_process_kill", service_key=self.defn.key, pid=target_pid, force=force, success=success)
            self._mark_stopped()
            return

        # Handle detected process (not started by launcher)
        if self.proc is None and self.detected_pid:
            self._stop_detected_process(graceful)
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
            if self.proc:
                self.proc.waitForFinished(1000)
                self.proc = None
            self._mark_stopped()

    def _finish_stop(self):
        # Handle subprocess.Popen
        if isinstance(self.proc, subprocess.Popen):
            try:
                if self.proc.poll() is None:
                    _log("service_force_kill", "warning", service_key=self.defn.key)
                    self._kill_process_tree()
            except Exception:
                pass
            self._mark_stopped()
            return

        # Handle QProcess
        if self.proc and self.proc.state() == QProcess.Running:
            _log("service_force_kill", "warning", service_key=self.defn.key)
            self._kill_process_tree()
        if self.proc:
            exit_code = self.proc.exitCode()
            _log("service_exit", service_key=self.defn.key, exit_code=exit_code)
            self.proc.waitForFinished(1000)
            self.proc = None
        self._mark_stopped()

    def _stop_detected_process(self, graceful: bool):
        """Stop a process detected by port/PID but not started by this launcher."""
        import time
        pu = _get_process_utils()
        force = not graceful
        old_pid = self.detected_pid
        port = self._get_port_from_health_url()

        success = pu.kill_process_by_pid(self.detected_pid, force=force)
        _log("detected_process_kill", service_key=self.defn.key, pid=self.detected_pid, force=force, success=success)

        # Verify process is gone - Windows can report success but process may linger
        is_backend = self.defn.key.endswith("-api") or self.defn.key in ("backend", "main-api", "generation-api")

        if success:
            time.sleep(0.5)

        # Retry loop: keep killing any PID on the port until free or timeout
        for retry in range(8):
            current_pid = pu.find_pid_by_port(port) if port else None
            if not current_pid:
                break

            if current_pid != old_pid:
                _log("detected_new_pid_after_kill", "warning", service_key=self.defn.key,
                     old_pid=old_pid, new_pid=current_pid, port=port)

            pu.kill_process_by_pid(current_pid, force=True)
            time.sleep(0.8)

            # Windows-specific fallbacks for uvicorn reloader
            if os.name == 'nt' and is_backend:
                if retry == 2:
                    try:
                        subprocess.run(["taskkill", "/F", "/FI", "WINDOWTITLE eq PixSim7 Backend*"],
                                       capture_output=True, text=True, timeout=5)
                        _log("taskkill_window_title_attempt", service_key=self.defn.key)
                    except Exception:
                        pass
                elif retry == 3:
                    try:
                        root_pid = pu.find_uvicorn_root_pid_windows(current_pid)
                        if root_pid and root_pid != current_pid:
                            subprocess.run(["taskkill", "/PID", str(root_pid), "/T", "/F"],
                                           capture_output=True, text=True, timeout=6)
                            _log("killed_uvicorn_root", service_key=self.defn.key,
                                 root_pid=root_pid, child_pid=current_pid)
                    except Exception:
                        pass

        # Check final state
        current_pid = pu.find_pid_by_port(port) if port else None
        if not current_pid:
            self._mark_stopped()
        elif os.name == 'nt' and is_backend:
            # Final Windows fallback: kill by command line
            try:
                cand_pids = pu.find_backend_candidate_pids_windows(port)
                for cp in cand_pids or []:
                    subprocess.run(["taskkill", "/PID", str(cp), "/T", "/F"],
                                   capture_output=True, text=True, timeout=6)
                time.sleep(1.0)
                if not pu.find_pid_by_port(port):
                    _log("fallback_kill_by_commandline_succeeded", service_key=self.defn.key)
                    self._mark_stopped()
                    return
            except Exception:
                pass
            # Exhausted all options
            _log("fallback_exhausted_still_running", "warning", service_key=self.defn.key, port=port)
            self.running = False
            self.health_status = HealthStatus.UNHEALTHY
            self.externally_managed = True
        else:
            _log("detected_process_kill_failed", "warning", service_key=self.defn.key, pid=old_pid, port=port)
            self.health_status = HealthStatus.UNHEALTHY
            self.externally_managed = True

    def _strip_ansi_codes(self, text: str) -> str:
        """Remove ANSI escape sequences (color codes) from text."""
        import re
        # Pattern matches ANSI escape sequences starting with ESC
        ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
        return ansi_escape.sub('', text)

    def _strip_ansi_artifacts(self, text: str) -> str:
        """
        Remove common SGR-like artifacts that may appear without the ESC prefix,
        such as "[2m", "[36m", "[1m", "[22m", etc.
        """
        import re
        ansi_fragment = re.compile(r'\[[0-9;]{1,5}m')
        return ansi_fragment.sub('', text)

    def _sanitize_log_line(self, line: str) -> str:
        """Clamp extremely long log lines to keep GUI responsive."""
        if line and len(line) > CONSOLE_MAX_LINE_CHARS:
            trimmed = line[-CONSOLE_MAX_LINE_CHARS:]
            omitted = len(line) - CONSOLE_MAX_LINE_CHARS
            return f"... ⏬ truncated {omitted} chars ⏬ ... {trimmed}"
        return line

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
                sanitized = self._append_log_buffer(log_line)
                self._persist_log_line(sanitized, sanitized=True)

            if is_err and line.strip():
                self.last_error_line = self._strip_ansi_codes(line.strip())
            if line.strip():
                _log("service_output", "debug", service_key=self.defn.key,
                     stream="stderr" if is_err else "stdout", line=self._strip_ansi_codes(line.strip()))

    def _finished(self, exit_code, exit_status):
        from PySide6.QtCore import QProcess
        from datetime import datetime

        self.running = False
        self.health_status = HealthStatus.STOPPED

        status_name = {QProcess.NormalExit: "Normal", QProcess.CrashExit: "Crashed"}.get(exit_status, "Unknown")
        timestamp = datetime.now().strftime('%H:%M:%S')

        if exit_code != 0 or exit_status != QProcess.NormalExit:
            log_line = f"[{timestamp}] [ERROR] Service exited abnormally: exit_code={exit_code}, status={status_name}"
            sanitized = self._append_log_buffer(log_line)
            self._persist_log_line(sanitized, sanitized=True)
            if self.last_error_line:
                error_line = f"[{timestamp}] [ERROR] Last error: {self.last_error_line}"
                self._persist_log_line(self._append_log_buffer(error_line), sanitized=True)
        else:
            log_line = f"[{timestamp}] [INFO] Service stopped normally"
            self._persist_log_line(self._append_log_buffer(log_line), sanitized=True)
            self.requested_running = False

        _log("service_exit", service_key=self.defn.key, exit_code=exit_code, exit_status=status_name,
             last_error=self.last_error_line if self.last_error_line else None)

    def _error_occurred(self, error):
        """Handle QProcess errors during startup or runtime."""
        from PySide6.QtCore import QProcess
        from datetime import datetime

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
        timestamp = datetime.now().strftime('%H:%M:%S')

        for line in [
            f"[{timestamp}] [ERROR] {error_msg}",
            f"[{timestamp}] [ERROR] Command: {self.defn.program} {' '.join(self.defn.args)}",
            f"[{timestamp}] [ERROR] Working directory: {self.defn.cwd}",
        ]:
            self._persist_log_line(self._append_log_buffer(line), sanitized=True)

        _log("service_process_error", "error", service_key=self.defn.key,
             error_type=error_messages.get(error, "unknown"), program=self.defn.program,
             args=self.defn.args, cwd=self.defn.cwd)

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
                pid = int(self.proc.processId())
        except Exception as e:
            _log("process_tree_kill_no_pid", "warning", service_key=self.defn.key, error=str(e))
            try:
                self.proc.kill()
            except Exception as kill_err:
                _log("process_kill_failed", "error", service_key=self.defn.key, error=str(kill_err))
            return

        if not pid:
            return

        try:
            if os.name == 'nt':
                result = subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"],
                                        capture_output=True, text=True, timeout=10)
                if result.returncode != 0:
                    stderr = result.stderr.strip() if result.stderr else ""
                    if "not found" not in stderr.lower() and "no task" not in stderr.lower():
                        _log("taskkill_failed", "warning", service_key=self.defn.key,
                             pid=pid, returncode=result.returncode, stderr=stderr)
                else:
                    _log("process_tree_killed", service_key=self.defn.key, pid=pid, method="taskkill")
            else:
                # Unix: kill process group
                import time
                try:
                    pgid = os.getpgid(pid)
                    os.killpg(pgid, signal.SIGTERM)
                    _log("process_group_killed", service_key=self.defn.key, pid=pid, pgid=pgid, signal="SIGTERM")
                    time.sleep(0.5)
                    try:
                        os.killpg(pgid, 0)  # Check if still exists
                        os.killpg(pgid, signal.SIGKILL)
                        _log("process_group_force_killed", "warning", service_key=self.defn.key, pgid=pgid)
                    except ProcessLookupError:
                        pass
                except ProcessLookupError:
                    _log("process_no_group", service_key=self.defn.key, pid=pid)
                    try:
                        os.kill(pid, signal.SIGTERM)
                        _log("process_killed", service_key=self.defn.key, pid=pid, signal="SIGTERM")
                    except ProcessLookupError:
                        pass
                except Exception as e:
                    _log("process_kill_error", "error", service_key=self.defn.key, pid=pid, error=str(e))
                    try:
                        self.proc.kill()
                    except Exception:
                        pass
        except Exception as e:
            _log("process_tree_kill_failed", "error", service_key=self.defn.key, pid=pid, error=str(e))
            try:
                self.proc.kill()
            except Exception:
                pass
