"""Log reading and consumption utilities.

Provides a shared data model and parsing for any log consumer — launcher
GUI, frontend dev panels, CLI tools, scripts.  All structured log output
produced by ``configure_logging()`` can be consumed through this module.

Usage::

    from pixsim_logging.reader import parse_line, tail_file, field_registry

    # Parse a single JSON log line
    record = parse_line('{"level":"info","service":"api","event":"started"}')
    print(record.level, record.service)

    # Tail a log file and get structured records
    for record in tail_file("/var/log/pixsim/api.log", follow=True):
        if record.level == "error":
            print(record)
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field as dc_field
from typing import Generator, Optional


# ── LogRecord ────────────────────────────────────────────────────────

@dataclass(slots=True, eq=False)
class LogRecord:
    """A structured log entry.

    Wraps the raw log line with pre-parsed fields so consumers can query
    fields directly instead of regex-matching rendered text.  Non-JSON
    lines (tracebacks, plain stderr) have ``fields`` empty.
    """
    raw: str
    """Original line as emitted (may contain ANSI codes)."""
    fields: dict = dc_field(default_factory=dict)
    """Parsed structlog fields (empty for non-JSON lines)."""

    # ── Convenience accessors for common filter dimensions ──

    @property
    def level(self) -> str | None:
        return self.fields.get("level")

    @property
    def domain(self) -> str | None:
        return self.fields.get("domain")

    @property
    def service(self) -> str | None:
        return self.fields.get("service")

    @property
    def channel(self) -> str | None:
        return self.fields.get("channel")

    @property
    def event(self) -> str | None:
        return self.fields.get("event")

    @property
    def timestamp(self) -> str | None:
        return self.fields.get("timestamp")

    @property
    def error(self) -> str | None:
        return self.fields.get("error")

    @property
    def error_type(self) -> str | None:
        return self.fields.get("error_type")

    def get(self, key: str, default=None):
        """Get a field value by key."""
        return self.fields.get(key, default)

    def __str__(self) -> str:
        return self.raw

    def __len__(self) -> int:
        return len(self.raw)

    def __hash__(self) -> int:
        return hash(self.raw)

    def __eq__(self, other) -> bool:
        if isinstance(other, LogRecord):
            return self.raw == other.raw
        return NotImplemented


# ── Parsing ──────────────────────────────────────────────────────────

def parse_line(line: str) -> LogRecord:
    """Parse a raw log line into a LogRecord.

    Attempts JSON parsing first (structlog default output).
    Falls back to a plain record for non-JSON lines.
    """
    stripped = line.strip()
    if stripped.startswith("{"):
        try:
            fields = json.loads(stripped)
            if isinstance(fields, dict):
                return LogRecord(raw=line, fields=fields)
        except (json.JSONDecodeError, ValueError):
            pass
    return LogRecord(raw=line)


def parse_lines(lines: list[str]) -> list[LogRecord]:
    """Parse multiple log lines into LogRecords."""
    return [parse_line(line) for line in lines]


# ── Field Registry ───────────────────────────────────────────────────

@dataclass
class FieldDefinition:
    """Metadata about a structured log field.

    Used by UI consumers (launcher GUI, frontend log panel) to render
    fields with appropriate styling and interactivity.
    """
    name: str
    color: str = "#4DD0E1"
    clickable: bool = False
    description: str = ""


class FieldRegistry:
    """Canonical registry of structured log fields and their UI metadata.

    Single source of truth — both the backend API and launcher GUI
    import from here instead of maintaining parallel definitions.
    """

    def __init__(self):
        self._fields: dict[str, FieldDefinition] = {}
        self._register_defaults()

    def _register_defaults(self):
        defaults = [
            FieldDefinition("request_id", "#FFB74D", True, "API request correlation ID"),
            FieldDefinition("job_id", "#4DD0E1", True, "Background job identifier"),
            FieldDefinition("submission_id", "#FFB74D", True, "Provider submission identifier"),
            FieldDefinition("generation_id", "#FFB74D", True, "Asset generation identifier"),
            FieldDefinition("provider_id", "#4DD0E1", True, "AI provider identifier"),
            FieldDefinition("provider_job_id", "#4DD0E1", True, "Provider-side job identifier"),
            FieldDefinition("error_type", "#EF5350", False, "Error classification"),
            FieldDefinition("domain", "#81C784", False, "Business domain"),
            FieldDefinition("channel", "#81C784", False, "Activity channel"),
            FieldDefinition("stage", "#CE93D8", False, "Pipeline stage"),
            FieldDefinition("duration_ms", "#FFB74D", False, "Duration in milliseconds"),
            FieldDefinition("user_id", "#FFB74D", True, "User identifier"),
        ]
        for f in defaults:
            self._fields[f.name] = f

    def register(self, field: FieldDefinition):
        """Register or replace a field definition."""
        self._fields[field.name] = field

    def get(self, name: str) -> FieldDefinition | None:
        return self._fields.get(name)

    def get_all(self) -> list[FieldDefinition]:
        return list(self._fields.values())

    def get_clickable(self) -> list[FieldDefinition]:
        return [f for f in self._fields.values() if f.clickable]

    def as_dicts(self) -> list[dict]:
        """Serialize all fields for API responses."""
        return [
            {
                "name": f.name,
                "color": f.color,
                "clickable": f.clickable,
                "pattern": rf"\b{f.name}=(\S+)",
                "description": f.description,
            }
            for f in self._fields.values()
        ]


# Singleton instance — importable by all consumers.
field_registry = FieldRegistry()


# ── File tail ────────────────────────────────────────────────────────

def tail_file(
    path: str,
    *,
    follow: bool = False,
    last_n: int = 100,
    poll_interval: float = 0.5,
) -> Generator[LogRecord, None, None]:
    """Read log records from a file, optionally following for new lines.

    Args:
        path: Path to the log file.
        follow: If True, keep watching for new lines (like ``tail -f``).
        last_n: Number of lines to read from the end on initial open.
                 Set to 0 to start from the current end (follow-only).
        poll_interval: Seconds between polls when following.

    Yields:
        LogRecord for each line.
    """
    if not os.path.isfile(path):
        return

    with open(path, "r", encoding="utf-8", errors="replace") as f:
        # Seek to approximate position for last_n lines
        if last_n > 0:
            try:
                f.seek(0, 2)  # end
                size = f.tell()
                # Rough estimate: 200 bytes per line
                seek_pos = max(0, size - last_n * 200)
                f.seek(seek_pos)
                if seek_pos > 0:
                    f.readline()  # skip partial line
                lines = f.readlines()
                # Take only last_n
                for line in lines[-last_n:]:
                    stripped = line.rstrip("\n\r")
                    if stripped:
                        yield parse_line(stripped)
            except OSError:
                # Fallback: read from start
                f.seek(0)
                for line in f:
                    stripped = line.rstrip("\n\r")
                    if stripped:
                        yield parse_line(stripped)
        else:
            f.seek(0, 2)  # start at end

        if not follow:
            return

        # Follow mode
        while True:
            line = f.readline()
            if line:
                stripped = line.rstrip("\n\r")
                if stripped:
                    yield parse_line(stripped)
            else:
                time.sleep(poll_interval)


# ── Sanitization ─────────────────────────────────────────────────────

DEFAULT_MAX_LINE_CHARS = 8000


def sanitize_line(line: str, max_chars: int = DEFAULT_MAX_LINE_CHARS) -> str:
    """Clamp extremely long log lines.

    Keeps the *tail* of the line (most informative part) and prepends
    a truncation marker.
    """
    if line and len(line) > max_chars:
        trimmed = line[-max_chars:]
        omitted = len(line) - max_chars
        return f"... truncated {omitted} chars ... {trimmed}"
    return line


# ── LogWriter ────────────────────────────────────────────────────────

class LogWriter:
    """Writes log lines to a file with rotation.

    Pairs with ``LogRecord`` / ``parse_line`` — handles the write side
    so consumers don't reimplement rotation + sanitization.

    Usage::

        from pixsim_logging.reader import LogWriter

        writer = LogWriter("/var/log/pixsim/worker.log")
        writer.write("some log line")
        writer.write(record)  # accepts LogRecord too
    """

    def __init__(
        self,
        path: str,
        *,
        max_bytes: int = 10 * 1024 * 1024,  # 10 MB
        backups: int = 1,
        max_line_chars: int = DEFAULT_MAX_LINE_CHARS,
    ):
        self.path = path
        self.max_bytes = max_bytes
        self.backups = backups
        self.max_line_chars = max_line_chars

    def write(self, line, *, already_sanitized: bool = False) -> None:
        """Write a line to the log file (with rotation).

        Args:
            line: A string or ``LogRecord``.
            already_sanitized: Skip line-length clamping if True.
        """
        from .file_rotation import rotate_file, append_line

        text = str(line)
        if not already_sanitized:
            text = sanitize_line(text, self.max_line_chars)
        try:
            rotate_file(self.path, self.max_bytes, self.backups)
            append_line(self.path, text + "\n")
        except Exception:
            pass  # never interrupt the caller
