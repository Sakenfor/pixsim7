"""
Log Manager - Pure Python service log management.

Manages service console logs with persistence and filtering,
without UI dependencies.
"""

import os
import re
import threading
from pathlib import Path
from typing import Dict, List, Optional, Callable
from datetime import datetime
from .types import ServiceState


class LogManager:
    """
    Manages console logs for services.

    Pure Python implementation with no Qt or UI dependencies.
    Features:
    - Persistent log files on disk
    - In-memory log buffers (limited size)
    - Log level filtering
    - Real-time log streaming
    - ANSI color code stripping
    """

    # Log level patterns
    LEVEL_PATTERNS = {
        "ERROR": re.compile(r"(?:\[(?:ERR|ERROR)\])|\b(?:ERR|ERROR)\b", re.IGNORECASE),
        "WARNING": re.compile(r"(?:\[(?:WARN|WARNING)\])|\b(?:WARN|WARNING)\b", re.IGNORECASE),
        "DEBUG": re.compile(r"(?:\[(?:DEBUG)\])|\bDEBUG\b", re.IGNORECASE),
        "INFO": re.compile(r"(?:\[(?:INFO)\])|\bINFO\b", re.IGNORECASE),
        "CRITICAL": re.compile(r"(?:\[(?:CRITICAL)\])|\bCRITICAL\b", re.IGNORECASE),
    }

    def __init__(
        self,
        states: Dict[str, ServiceState],
        log_dir: Optional[Path] = None,
        max_log_lines: int = 5000,
        monitor_interval: float = 0.5,
        log_callback: Optional[Callable[[str, str], None]] = None
    ):
        """
        Initialize the log manager.

        Args:
            states: Dictionary of service states
            log_dir: Directory for log files (default: data/logs/console)
            max_log_lines: Maximum lines to keep in memory per service
            monitor_interval: How often to check log files for new content (seconds)
            log_callback: Optional callback for new log lines (service_key, line)
        """
        self.states = states
        self.max_log_lines = max_log_lines
        self.monitor_interval = monitor_interval
        self.log_callback = log_callback

        # Set up log directory
        if log_dir is None:
            root = Path(__file__).parent.parent.parent
            log_dir = root / 'data' / 'logs' / 'console'

        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)

        # Track log file positions for monitoring
        self._file_positions: Dict[str, int] = {}
        self._monitor_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._running = False

        # Load existing logs
        self._load_persisted_logs()

    def _load_persisted_logs(self):
        """Load previously saved console logs on startup."""
        for key, state in self.states.items():
            log_file = self.log_dir / f"{key}.log"
            if log_file.exists():
                try:
                    with open(log_file, 'r', encoding='utf-8', errors='replace') as f:
                        lines = f.readlines()
                        # Load last N lines to respect max_log_lines
                        cleaned: list[str] = []
                        for line in lines[-self.max_log_lines:]:
                            raw = line.rstrip()
                            if not raw:
                                continue
                            clean = self._strip_ansi_codes(raw)
                            clean = self._strip_ansi_artifacts(clean)
                            if clean:
                                cleaned.append(clean)
                        state.log_buffer = cleaned
                        # Track file position
                        self._file_positions[key] = log_file.stat().st_size
                except Exception:
                    state.log_buffer = []
                    self._file_positions[key] = 0
            else:
                state.log_buffer = []
                self._file_positions[key] = 0

    def start_monitoring(self):
        """Start monitoring log files for new content."""
        if self._running:
            return

        self._stop_event.clear()
        self._running = True
        self._monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._monitor_thread.start()

    def stop_monitoring(self, timeout: float = 5.0):
        """
        Stop monitoring log files.

        Args:
            timeout: Maximum time to wait for thread to stop (seconds)
        """
        if not self._running:
            return

        self._stop_event.set()
        if self._monitor_thread:
            self._monitor_thread.join(timeout=timeout)
        self._running = False

    def is_monitoring(self) -> bool:
        """Check if log monitoring is active."""
        return self._running

    def append_log(self, service_key: str, line: str, stream: str = "OUT"):
        """
        Append a log line to a service's logs.

        Args:
            service_key: Service key
            line: Log line content
            stream: Stream name ("OUT" or "ERR")
        """
        state = self.states.get(service_key)
        if not state:
            return

        # Strip ANSI color codes and common leftover artifacts (e.g. "[2m" without ESC)
        clean_line = self._strip_ansi_codes(line.strip())
        clean_line = self._strip_ansi_artifacts(clean_line)

        if not clean_line:
            return

        # Format with timestamp
        timestamp = datetime.now().strftime('%H:%M:%S')
        formatted = f"[{timestamp}] [{stream}] {clean_line}"

        # Add to in-memory buffer
        state.log_buffer.append(formatted)

        # Trim buffer if too large
        if len(state.log_buffer) > self.max_log_lines:
            state.log_buffer = state.log_buffer[-self.max_log_lines:]

        # Persist to file
        self._persist_log_line(service_key, formatted)

        # Track errors
        if stream == "ERR" or self._detect_error(clean_line):
            state.last_error = clean_line

        # Callback
        if self.log_callback:
            try:
                self.log_callback(service_key, formatted)
            except Exception:
                pass

    def get_logs(
        self,
        service_key: str,
        filter_text: Optional[str] = None,
        filter_level: Optional[str] = None,
        max_lines: Optional[int] = None
    ) -> List[str]:
        """
        Get log lines for a service with optional filtering.

        Args:
            service_key: Service key
            filter_text: Optional text to filter lines (case-insensitive)
            filter_level: Optional log level filter (ERROR, WARNING, INFO, DEBUG)
            max_lines: Maximum number of lines to return (default: all)

        Returns:
            List of log lines
        """
        state = self.states.get(service_key)
        if not state:
            return []

        logs = state.log_buffer.copy()

        # Apply text filter
        if filter_text:
            filter_lower = filter_text.lower()
            logs = [line for line in logs if filter_lower in line.lower()]

        # Apply level filter
        if filter_level and filter_level.upper() in self.LEVEL_PATTERNS:
            pattern = self.LEVEL_PATTERNS[filter_level.upper()]
            logs = [line for line in logs if pattern.search(line)]

        # Apply max lines limit
        if max_lines and max_lines > 0:
            logs = logs[-max_lines:]

        return logs

    def clear_logs(self, service_key: str):
        """Clear both in-memory and persisted logs for a service."""
        state = self.states.get(service_key)
        if not state:
            return

        state.log_buffer.clear()
        self._file_positions[service_key] = 0

        # Truncate log file
        log_file = self.log_dir / f"{service_key}.log"
        try:
            with open(log_file, 'w', encoding='utf-8') as f:
                pass
        except Exception:
            pass

    def clear_all_logs(self):
        """Clear logs for all services."""
        for key in self.states.keys():
            self.clear_logs(key)

    def _persist_log_line(self, service_key: str, line: str):
        """Append a log line to the persistent file."""
        log_file = self.log_dir / f"{service_key}.log"
        try:
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(line + '\n')
        except Exception:
            pass

    def _read_new_log_lines(self, service_key: str):
        """Read new lines from log file since last check."""
        state = self.states.get(service_key)
        if not state:
            return

        log_file = self.log_dir / f"{service_key}.log"
        if not log_file.exists():
            return

        try:
            current_pos = self._file_positions.get(service_key, 0)

            with open(log_file, 'r', encoding='utf-8', errors='replace') as f:
                f.seek(current_pos)
                new_lines = f.readlines()
                self._file_positions[service_key] = f.tell()

                        for line in new_lines:
                            raw = line.rstrip()
                            if not raw:
                                continue
                            clean = self._strip_ansi_codes(raw)
                            clean = self._strip_ansi_artifacts(clean)
                            if not clean:
                                continue

                            state.log_buffer.append(clean)

                            # Check for errors
                            if '[ERR]' in clean or '[ERROR]' in clean:
                                parts = clean.split('] ', 2)
                                if len(parts) >= 3:
                                    state.last_error = parts[2]

                            # Callback
                            if self.log_callback:
                                try:
                                    self.log_callback(service_key, clean)
                                except Exception:
                                    pass

                # Trim buffer if too large
                if len(state.log_buffer) > self.max_log_lines:
                    state.log_buffer = state.log_buffer[-self.max_log_lines:]

        except Exception:
            pass

    def _monitor_loop(self):
        """Monitor log files for new content (runs in thread)."""
        while not self._stop_event.is_set():
            for key in self.states.keys():
                if self._stop_event.is_set():
                    break
                self._read_new_log_lines(key)

            self._stop_event.wait(timeout=self.monitor_interval)

    @staticmethod
    def _strip_ansi_codes(text: str) -> str:
        """Remove ANSI escape sequences (color codes) from text."""
        ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
        return ansi_escape.sub('', text)

    @staticmethod
    def _strip_ansi_artifacts(text: str) -> str:
        """
        Remove common SGR-like artifacts that may appear without the ESC prefix,
        such as "[2m", "[36m", "[1m", "[22m", etc.
        """
        ansi_fragment = re.compile(r'\[[0-9;]{1,5}m')
        return ansi_fragment.sub('', text)

    @staticmethod
    def _detect_error(line: str) -> bool:
        """Detect if a log line is an error."""
        pattern = LogManager.LEVEL_PATTERNS["ERROR"]
        return pattern.search(line) is not None

    def get_log_file_path(self, service_key: str) -> Optional[Path]:
        """Get the path to a service's log file."""
        if service_key not in self.states:
            return None
        return self.log_dir / f"{service_key}.log"
