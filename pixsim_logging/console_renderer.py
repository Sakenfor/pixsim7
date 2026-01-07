"""Custom console renderer for cleaner, more readable log output."""
from __future__ import annotations
import json
from datetime import datetime
from typing import Any
from structlog.typing import EventDict, WrappedLogger
from structlog.dev import _pad


LEVEL_COLORS = {
    "debug": "\x1b[36m",      # cyan
    "info": "\x1b[32m",       # green
    "warning": "\x1b[33m",    # yellow
    "error": "\x1b[31m",      # red
    "critical": "\x1b[35m",   # magenta
}
RESET = "\x1b[0m"
DIM = "\x1b[2m"
BOLD = "\x1b[1m"
CYAN = "\x1b[36m"
BLUE = "\x1b[34m"
GRAY = "\x1b[90m"


class CleanConsoleRenderer:
    """Clean, readable console renderer for structured logs.

    Format: [HH:MM:SS] LEVEL service event_name key1=val1 key2=val2
    Example: [14:23:45] INFO  launcher cron:poll_job_statuses checked=0 completed=0 failed=0
    """

    def __init__(self, colors: bool = True, pad_event: int = 30):
        self.colors = colors
        self.pad_event = pad_event

    def __call__(
        self, logger: WrappedLogger, name: str, event_dict: EventDict
    ) -> str:
        """Render a log event as a clean colored string."""
        # Extract standard fields
        timestamp = event_dict.pop("timestamp", "")
        level = event_dict.pop("level", "info")
        event = event_dict.pop("event", "")
        service = event_dict.pop("service", "")

        # Format timestamp (extract just HH:MM:SS)
        if timestamp:
            try:
                # Handle ISO format: 2024-01-15T14:23:45.123456Z
                time_part = timestamp.split("T")[1] if "T" in timestamp else timestamp
                time_part = time_part.split(".")[0]  # Remove microseconds
                time_str = time_part[:8]  # HH:MM:SS
            except Exception:
                time_str = timestamp[:8]
        else:
            # Fallback for logs that didn't go through TimeStamper (e.g., plain stdlib logs)
            time_str = datetime.utcnow().strftime("%H:%M:%S")

        # Build line
        parts = []

        # Timestamp
        if self.colors:
            parts.append(f"{GRAY}[{time_str}]{RESET}")
        else:
            parts.append(f"[{time_str}]")

        # Level (abbreviated to 5 chars: INFO, DEBUG, ERROR, WARN, CRIT)
        level_upper = level.upper()
        level_abbrev = {
            "WARNING": "WARN",
            "CRITICAL": "CRIT",
        }.get(level_upper, level_upper)
        level_str = level_abbrev[:5].ljust(5)
        if self.colors:
            color = LEVEL_COLORS.get(level.lower(), "")
            parts.append(f"{color}{level_str}{RESET}")
        else:
            parts.append(level_str)

        # Service (padded to 10 chars)
        service_str = service[:10].ljust(10) if service else " " * 10
        if self.colors:
            parts.append(f"{CYAN}{service_str}{RESET}")
        else:
            parts.append(service_str)

        # Event name (padded for alignment, but never truncated)
        event_str = event.ljust(self.pad_event) if event else ""
        if self.colors:
            parts.append(f"{BOLD}{event_str}{RESET}")
        else:
            parts.append(event_str)

        # Join main parts
        line = " ".join(parts)

        # Add remaining key-value pairs
        kvs = []
        for key, value in event_dict.items():
            # Skip internal fields
            if key in {"env", "exception"}:
                continue

            # Format value
            if isinstance(value, (dict, list)):
                val_str = json.dumps(value, separators=(',', ':'), ensure_ascii=False)
            elif isinstance(value, bool):
                val_str = "true" if value else "false"
            elif value is None:
                val_str = "null"
            else:
                val_str = str(value)

            # Colorize
            if self.colors:
                kvs.append(f"{DIM}{key}={RESET}{val_str}")
            else:
                kvs.append(f"{key}={val_str}")

        if kvs:
            line += " " + " ".join(kvs)

        # Handle exception info
        if "exception" in event_dict:
            line += f"\n{event_dict['exception']}"

        return line
