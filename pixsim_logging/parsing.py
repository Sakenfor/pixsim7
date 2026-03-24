"""Log line parsing patterns — shared format detection for all consumers.

Defines the regex patterns and format detection logic used to parse
log lines from various sources (structlog, uvicorn, ARQ, Python logging).

The parsers here match the output of ``CleanConsoleRenderer`` exactly::

    [HH:MM:SS] LEVEL service event_name                 key1=val1 key2=val2

Usage::

    from pixsim_logging.parsing import detect_level, detect_timestamp, parse_structured_line

    parsed = parse_structured_line("[14:23:45] INFO  api http_request method=GET path=/health")
    # → StructuredLine(timestamp="14:23:45", level="INFO", service="api",
    #                   event="http_request", fields={"method": "GET", "path": "/health"})
"""
from __future__ import annotations

import re
from typing import Optional, NamedTuple


# ── Log level detection ──────────────────────────────────────────────

LEVEL_NAMES = ("CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG")

# Ordered by severity (highest first) so first match wins
LEVEL_PATTERNS = [
    ("CRITICAL", re.compile(r"\bCRIT(?:ICAL)?\b", re.IGNORECASE)),
    ("ERROR",    re.compile(r"\bERR(?:OR)?\b", re.IGNORECASE)),
    ("WARNING",  re.compile(r"\bWARN(?:ING)?\b", re.IGNORECASE)),
    ("INFO",     re.compile(r"\bINFO\b", re.IGNORECASE)),
    ("DEBUG",    re.compile(r"\bDEBUG\b", re.IGNORECASE)),
]

# Normalized aliases
LEVEL_ALIASES = {
    "WARN": "WARNING",
    "ERR": "ERROR",
    "CRIT": "CRITICAL",
}


def detect_level(line: str) -> Optional[str]:
    """Detect log level from a raw line. Returns normalized level name or None."""
    for level, pattern in LEVEL_PATTERNS:
        if pattern.search(line):
            return level
    return None


# ── Timestamp detection ──────────────────────────────────────────────

class TimestampMatch(NamedTuple):
    """Result of timestamp extraction."""
    time: str           # Extracted time string (HH:MM:SS or full ISO)
    end_pos: int        # Position after the timestamp in the original line
    format: str         # "bracket", "iso", "bare", or "none"


# [HH:MM:SS] — structlog human format
_TS_BRACKET = re.compile(r"^\[(\d{2}:\d{2}:\d{2})\]\s*")

# 2026-03-24T14:30:45Z — ISO 8601
_TS_ISO = re.compile(r"^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})[^\s]*\s*")

# HH:MM:SS: — ARQ worker format (trailing colon)
_TS_BARE = re.compile(r"^(\d{2}:\d{2}:\d{2}):?\s+")


def detect_timestamp(line: str) -> TimestampMatch:
    """Extract timestamp from the beginning of a log line.

    Tries formats in specificity order: bracket → ISO → bare.
    Returns a TimestampMatch with the extracted time and parse position.
    """
    m = _TS_BRACKET.match(line)
    if m:
        return TimestampMatch(m.group(1), m.end(), "bracket")

    m = _TS_ISO.match(line)
    if m:
        full = m.group(1)
        t_idx = full.find("T")
        time_part = full[t_idx + 1:] if t_idx >= 0 else full[11:]
        return TimestampMatch(time_part, m.end(), "iso")

    m = _TS_BARE.match(line)
    if m:
        return TimestampMatch(m.group(1), m.end(), "bare")

    return TimestampMatch("", 0, "none")


# ── Format detection ─────────────────────────────────────────────────

class LogFormat:
    """Known log line formats."""
    STRUCTLOG_JSON = "structlog_json"      # {"level":"info","event":"..."}
    STRUCTLOG_HUMAN = "structlog_human"    # [HH:MM:SS] LEVEL service event key=val
    UVICORN_ACCESS = "uvicorn_access"      # INFO:     IP - "METHOD /path HTTP/x" STATUS
    ARQ_WORKER = "arq_worker"              # HH:MM:SS:  duration ← task
    PYTHON_LOGGING = "python_logging"      # LEVEL:   message
    PLAIN = "plain"                        # Unrecognized format


# Uvicorn access log: "IP:PORT - "METHOD /path HTTP/x.x" STATUS"
_UVICORN_ACCESS = re.compile(
    r'(\d+\.\d+\.\d+\.\d+):?\d*\s+-\s+"(\w+)\s+(\S+)\s+HTTP/[\d.]+"?\s+(\d+)'
)

# Python logging default: "LEVEL:   message"
_PYTHON_LOGGING = re.compile(
    r"^(DEBUG|INFO|WARNING|ERROR|CRITICAL):\s+", re.IGNORECASE
)


def detect_format(line: str) -> str:
    """Detect the format of a log line."""
    stripped = line.strip()

    if stripped.startswith("{"):
        try:
            import json
            json.loads(stripped)
            return LogFormat.STRUCTLOG_JSON
        except (ValueError, json.JSONDecodeError):
            pass

    if _TS_BRACKET.match(stripped):
        return LogFormat.STRUCTLOG_HUMAN

    if _TS_ISO.match(stripped):
        return LogFormat.STRUCTLOG_HUMAN

    if _UVICORN_ACCESS.search(stripped):
        return LogFormat.UVICORN_ACCESS

    if _TS_BARE.match(stripped):
        return LogFormat.ARQ_WORKER

    if _PYTHON_LOGGING.match(stripped):
        return LogFormat.PYTHON_LOGGING

    return LogFormat.PLAIN


# ── Domain / service detection ───────────────────────────────────────

_DOMAIN_REGEX = re.compile(
    r'(?:domain=(\S+)|"domain"\s*:\s*"([^"]+)")', re.IGNORECASE
)

_SERVICE_REGEX = re.compile(
    r'(?:service=(\S+)|"service"\s*:\s*"([^"]+)")', re.IGNORECASE
)

_CHANNEL_REGEX = re.compile(
    r'(?:channel=(\S+)|"channel"\s*:\s*"([^"]+)")', re.IGNORECASE
)


def detect_domain(line: str) -> Optional[str]:
    """Extract domain from a log line (key=value or JSON format)."""
    m = _DOMAIN_REGEX.search(line)
    if m:
        return (m.group(1) or m.group(2) or "").lower() or None
    return None


def detect_service(line: str) -> Optional[str]:
    """Extract service name from a log line."""
    m = _SERVICE_REGEX.search(line)
    if m:
        return (m.group(1) or m.group(2) or "").strip('"') or None
    return None


def detect_channel(line: str) -> Optional[str]:
    """Extract channel from a log line."""
    m = _CHANNEL_REGEX.search(line)
    if m:
        return (m.group(1) or m.group(2) or "").lower() or None
    return None


# ── Key=value field extraction ───────────────────────────────────────

_KV_PATTERN = re.compile(r"\b([a-z_]{2,20})=(\S+)")


def extract_fields(line: str) -> dict[str, str]:
    """Extract all key=value pairs from a log line."""
    return {m.group(1): m.group(2) for m in _KV_PATTERN.finditer(line)}


# ── Structured line parser (matches CleanConsoleRenderer output) ─────

# ANSI stripping
_ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


def strip_ansi(text: str) -> str:
    """Remove ANSI escape codes from text."""
    return _ANSI_RE.sub("", text) if "\x1b" in text else text


class StructuredLine(NamedTuple):
    """Fully parsed log line matching CleanConsoleRenderer format."""
    timestamp: str          # "HH:MM:SS" or ""
    level: str              # "INFO", "ERROR", etc.
    service: str            # "api", "worker", etc. or ""
    event: str              # Event name (e.g., "http_request")
    message: str            # Everything after the event (key=value pairs)
    fields: dict[str, str]  # Extracted key=value pairs
    format: str             # LogFormat constant
    raw: str                # Original line


# Matches: [HH:MM:SS] LEVEL  service    event_name   key=val key=val
_CLEAN_CONSOLE_RE = re.compile(
    r"^\[(\d{2}:\d{2}:\d{2})\]\s+"     # timestamp
    r"(\w{3,8})\s+"                      # level (3-8 chars: INFO, DEBUG, ERROR, WARN, CRIT)
    r"(\S+)\s+"                          # service
    r"(\S+)"                             # event name
    r"(?:\s+(.*))?$"                     # optional key=value remainder
)

# Matches uvicorn: IP - "METHOD /path HTTP/x" STATUS
_UVICORN_RE = re.compile(
    r'(\d+\.\d+\.\d+\.\d+):?\d*\s+-\s+"(\w+)\s+(\S+)\s+HTTP/[\d.]+"?\s+(\d+)'
)


def parse_structured_line(raw: str) -> StructuredLine:
    """Parse a log line into structured components.

    Handles:
    - CleanConsoleRenderer format: [HH:MM:SS] LEVEL service event key=val
    - ISO timestamp format: 2026-03-24T14:30:45Z [LEVEL] message
    - ARQ worker format: HH:MM:SS: message
    - Uvicorn access log: INFO: IP - "METHOD /path HTTP/x" STATUS
    - Plain text fallback
    """
    clean = strip_ansi(raw)

    # 1. CleanConsoleRenderer format (most common for our services)
    m = _CLEAN_CONSOLE_RE.match(clean)
    if m:
        ts, lvl, svc, event, remainder = m.groups()
        lvl = LEVEL_ALIASES.get(lvl.upper(), lvl.upper())
        fields = extract_fields(remainder or "")
        return StructuredLine(ts, lvl, svc, event, remainder or "", fields, LogFormat.STRUCTLOG_HUMAN, raw)

    # 2. Detect timestamp
    ts_match = detect_timestamp(clean)
    rest = clean[ts_match.end_pos:]

    # 3. Detect level
    level = "INFO"
    level_m = re.match(r"^\[?(\w+)\]?[:\s]\s*", rest)
    if level_m:
        candidate = level_m.group(1).upper()
        if candidate in {"DEBUG", "INFO", "WARNING", "WARN", "ERROR", "ERR", "CRITICAL", "CRIT"}:
            level = LEVEL_ALIASES.get(candidate, candidate)
            rest = rest[level_m.end():]

    # 4. Uvicorn access log
    uvi = _UVICORN_RE.search(rest)
    if uvi:
        method, path, status = uvi.group(2), uvi.group(3), uvi.group(4)
        fields = {"method": method, "path": path, "status_code": status}
        return StructuredLine(
            ts_match.time, level, "", "http_request",
            f"method={method} path={path} status_code={status}",
            fields, LogFormat.UVICORN_ACCESS, raw,
        )

    # 5. Try to extract service (first word if short identifier)
    service = ""
    svc_m = re.match(r"^([a-zA-Z][a-zA-Z0-9_.:-]{0,15})\s+", rest)
    if svc_m:
        service = svc_m.group(1)
        rest = rest[svc_m.end():]

    # 6. Extract event (first word of remainder)
    event = ""
    ev_m = re.match(r"^(\S+)\s*", rest)
    if ev_m:
        event = ev_m.group(1)
        rest = rest[ev_m.end():]

    fields = extract_fields(clean)
    fmt = detect_format(clean)
    return StructuredLine(ts_match.time, level, service, event, rest, fields, fmt, raw)


# ── Format spec for JS consumers ────────────────────────────────────

def get_format_spec() -> dict:
    """Return parsing format spec for JS consumers.

    Describes the CleanConsoleRenderer's output format so React parsers
    can match it precisely without guessing.
    """
    return {
        "clean_console": {
            "description": "CleanConsoleRenderer output",
            "pattern": r"^\[(\d{2}:\d{2}:\d{2})\]\s+(\w{3,8})\s+(\S+)\s+(\S+)(?:\s+(.*))?$",
            "groups": ["timestamp", "level", "service", "event", "kv_remainder"],
            "timestamp_format": "HH:MM:SS",
            "level_width": 5,
            "service_width": 10,
            "event_width": 30,
            "level_abbreviations": {"WARNING": "WARN", "CRITICAL": "CRIT"},
            "skip_fields": ["env", "exception"],
        },
        "arq_worker": {
            "description": "ARQ worker output",
            "pattern": r"^(\d{2}:\d{2}:\d{2}):?\s+(.+)$",
            "groups": ["timestamp", "message"],
        },
        "uvicorn_access": {
            "description": "Uvicorn access log",
            "pattern": r'(\d+\.\d+\.\d+\.\d+):?\d*\s+-\s+"(\w+)\s+(\S+)\s+HTTP/[\d.]+"?\s+(\d+)',
            "groups": ["ip", "method", "path", "status_code"],
        },
    }
