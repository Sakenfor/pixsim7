"""Console log formatting utilities for the launcher."""
import re
from html import escape

# Reuse shared header formatting where helpful to keep styles consistent
try:
    from .log_formatter import build_log_header_html
except ImportError:  # pragma: no cover - fallback for direct execution
    from log_formatter import build_log_header_html

# Level detection patterns
CONSOLE_LEVEL_PATTERNS = {
    "ERROR": re.compile(r"(?:\[(?:ERR|ERROR)\])|\b(?:ERR|ERROR)\b", re.IGNORECASE),
    "WARNING": re.compile(r"(?:\[(?:WARN|WARNING)\])|\b(?:WARN|WARNING)\b", re.IGNORECASE),
    "DEBUG": re.compile(r"(?:\[(?:DEBUG)\])|\bDEBUG\b", re.IGNORECASE),
    "INFO": re.compile(r"(?:\[(?:INFO)\])|\bINFO\b", re.IGNORECASE),
    "CRITICAL": re.compile(r"(?:\[(?:CRITICAL)\])|\bCRITICAL\b", re.IGNORECASE),
}

CONSOLE_LEVEL_STYLES = {
    "DEBUG": {"accent": "#64B5F6", "bg": "rgba(100,181,246,0.08)"},
    "INFO": {"accent": "#81C784", "bg": "rgba(129,199,132,0.08)"},
    "WARNING": {"accent": "#FFB74D", "bg": "rgba(255,183,77,0.12)"},
    "ERROR": {"accent": "#EF5350", "bg": "rgba(239,83,80,0.12)"},
    "CRITICAL": {"accent": "#FF1744", "bg": "rgba(255,23,68,0.18)"},
}

# Parsing regexes
CONSOLE_TIMESTAMP_REGEX = re.compile(r'\[(\d{2}:\d{2}:\d{2})\] \[(OUT|ERR)\] (.+)')
ISO_TIMESTAMP_REGEX = re.compile(r'(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\.?\d*(Z|[+-]\d{2}:\d{2})?\s*(.*)')
LEVEL_PREFIX_REGEX = re.compile(r'(DEBUG|INFO|WARNING|ERROR|CRITICAL):\s*(.*)', re.IGNORECASE)
# Match structured log format: timestamp [level] message
STRUCTURED_LOG_REGEX = re.compile(r'^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})[^\[]*\[(\w+)\s*\]\s*(.*)$')
# Match clean log format: [HH:MM:SS] LEVEL [optional spaces] content
# Level can be: DEBUG, INFO, WARN, ERROR, CRIT, WARNING, CRITICAL
# This handles both our custom format and standard structlog format with variable spacing
CLEAN_LOG_REGEX = re.compile(r'^\[(\d{2}:\d{2}:\d{2})\]\s+(DEBUG|INFO|WARN(?:ING)?|ERROR|CRIT(?:ICAL)?)\s+(.+)$', re.IGNORECASE)
# Match ARQ worker format: HH:MM:SS: message (no brackets, colon after time)
ARQ_TIMESTAMP_REGEX = re.compile(r'^(\d{2}:\d{2}:\d{2}):\s+(.+)$')


def convert_utc_to_local_time(timestamp_str: str) -> str | None:
    """
    Convert UTC timestamp to local time.

    Args:
        timestamp_str: ISO timestamp string (e.g., "2025-11-20T11:31:22.200605Z")

    Returns:
        Local time string in HH:MM:SS format, or None if parsing fails
    """
    from datetime import datetime

    try:
        # Parse ISO timestamp (handles both with and without 'Z')
        if timestamp_str.endswith('Z'):
            dt_utc = datetime.fromisoformat(timestamp_str[:-1])
        else:
            dt_utc = datetime.fromisoformat(timestamp_str)

        # Assume it's UTC, convert to local time
        from datetime import timezone
        dt_utc = dt_utc.replace(tzinfo=timezone.utc)
        dt_local = dt_utc.astimezone()

        return dt_local.strftime('%H:%M:%S')
    except Exception:
        return None

# Decoration regexes
URL_LINK_REGEX = re.compile(r'(https?://[^\s]+)')
READY_REGEX = re.compile(r'\b(VITE|ready|Local|Network|running|started|listening)\b')
ERROR_REGEX = re.compile(r'\b(ERROR|error|failed|Error|FAILED)\b')
WARN_REGEX = re.compile(r'\b(WARNING|warning|WARN|warn)\b')

# Low-signal patterns to dim (health checks, routine pings, etc.)
LOW_SIGNAL_PATTERNS = [
    re.compile(r'/health\b', re.IGNORECASE),
    re.compile(r'/ping\b', re.IGNORECASE),
    re.compile(r'/ready\b', re.IGNORECASE),
    re.compile(r'/live\b', re.IGNORECASE),
    re.compile(r'\bhealth.?check\b', re.IGNORECASE),
    re.compile(r'\bstatus.?poll\b', re.IGNORECASE),
    re.compile(r'"GET /api/v1/health"', re.IGNORECASE),
]


def is_low_signal_line(line: str) -> bool:
    """Check if a line is low-signal (routine health checks, pings, etc.)."""
    for pattern in LOW_SIGNAL_PATTERNS:
        if pattern.search(line):
            return True
    return False

# Structured key=value highlights (best-effort for important fields)
STRUCT_FIELD_REGEX = re.compile(
    r'\b(provider_id|job_id|submission_id|generation_id|request_id|error_type)=(\S+)',
)
STRUCT_FIELD_COLORS = {
    "provider_id": "#4DD0E1",
    "job_id": "#FFB74D",
    "submission_id": "#FFB74D",
    "generation_id": "#FFB74D",
    "request_id": "#FFB74D",
    "error_type": "#EF5350",
}

# ANSI / SGR detection and stripping
ANSI_SGR_REGEX = re.compile(r'(\x1b\[|\[)([0-9;]{1,5})m')
ANSI_ESCAPE_RE = re.compile(r'\x1B\[[0-?]*[ -/]*[@-~]')


def strip_ansi(text: str) -> str:
    """Strip ANSI color codes from text."""
    if not text:
        return text
    return ANSI_ESCAPE_RE.sub('', text)


def detect_console_level(line: str) -> str | None:
    """Detect log level from a line."""
    for level in ("ERROR", "CRITICAL", "WARNING", "DEBUG", "INFO"):
        if CONSOLE_LEVEL_PATTERNS[level].search(line):
            return level
    return None


def _apply_inline_highlighting(escaped_text: str) -> str:
    """
    Apply URL + keyword highlighting to already-escaped text.

    This keeps HTML-safe content while decorating known patterns.
    """
    text = URL_LINK_REGEX.sub(
        r'<a href="\1" style="color: #64B5F6; text-decoration: underline;">\1</a>',
        escaped_text
    )
    text = READY_REGEX.sub(
        r'<span style="color: #81C784; font-weight: bold;">\1</span>', text
    )
    text = ERROR_REGEX.sub(
        r'<span style="color: #EF5350; font-weight: bold;">\1</span>', text
    )
    text = WARN_REGEX.sub(
        r'<span style="color: #FFB74D; font-weight: bold;">\1</span>', text
    )

    # Highlight structured key=value fields (provider_id, job_id, etc.)
    def _struct_repl(match: re.Match) -> str:
        key, raw_value = match.group(1), match.group(2)
        value = raw_value  # already HTML-escaped as part of escaped_text
        color = STRUCT_FIELD_COLORS.get(key, "#4DD0E1")
        # Make IDs clickable into DB log viewer via the launcher (dbfilter:// scheme)
        if key in {"provider_id", "job_id", "submission_id", "generation_id", "request_id"}:
            href = f'dbfilter://{key}/{raw_value}'
            value_html = (
                f'<a href="{href}" '
                f'style="color: {color}; font-weight: bold; text-decoration: underline;">{value}</a>'
            )
        else:
            value_html = f'<span style="color: {color}; font-weight: bold;">{value}</span>'

        return f'<span style="color: #888;">{key}=</span>{value_html}'

    text = STRUCT_FIELD_REGEX.sub(_struct_repl, text)

    return text


def _build_style_from_sgr(state: dict) -> str:
    """Convert a simple SGR style state into an inline CSS style string."""
    styles: list[str] = []
    color = state.get("color")
    if color:
        styles.append(f"color: {color}")
    if state.get("bold"):
        styles.append("font-weight: bold")
    if state.get("dim"):
        styles.append("opacity: 0.75")
    return "; ".join(styles)


def _convert_ansi_to_html(content: str) -> str:
    """
    Convert ANSI/SGR sequences (including bare '[36m' style fragments)
    into HTML spans with inline styles.
    """
    # Basic color map for common SGR foreground codes
    color_map = {
        "30": "#000000",
        "31": "#f44336",
        "32": "#4CAF50",
        "33": "#FFEB3B",
        "34": "#2196F3",
        "35": "#E91E63",
        "36": "#00BCD4",
        "37": "#FFFFFF",
        "90": "#9E9E9E",
        "91": "#FF5252",
        "92": "#69F0AE",
        "93": "#FFE57F",
        "94": "#82B1FF",
        "95": "#FF80AB",
        "96": "#84FFFF",
        "97": "#FFFFFF",
    }

    html_parts: list[str] = []
    idx = 0
    state = {"bold": False, "dim": False, "color": None}

    for match in ANSI_SGR_REGEX.finditer(content):
        start, end = match.span()
        # Text before this sequence
        chunk = content[idx:start]
        if chunk:
            escaped = escape(chunk)
            escaped = _apply_inline_highlighting(escaped)
            style_str = _build_style_from_sgr(state)
            if style_str:
                html_parts.append(f'<span style="{style_str}">{escaped}</span>')
            else:
                html_parts.append(escaped)

        codes = (match.group(2) or "").split(";")
        if not codes:
            codes = ["0"]

        for code in codes:
            if not code:
                continue
            if code == "0":
                # Reset all
                state["bold"] = False
                state["dim"] = False
                state["color"] = None
            elif code == "1":
                state["bold"] = True
            elif code == "2":
                state["dim"] = True
            elif code == "22":
                # Normal intensity (clear bold/dim)
                state["bold"] = False
                state["dim"] = False
            elif code in color_map:
                state["color"] = color_map[code]
            elif code == "39":
                # Default foreground
                state["color"] = None

        idx = end

    # Tail after last sequence
    tail = content[idx:]
    if tail:
        escaped = escape(tail)
        escaped = _apply_inline_highlighting(escaped)
        style_str = _build_style_from_sgr(state)
        if style_str:
            html_parts.append(f'<span style="{style_str}">{escaped}</span>')
        else:
            html_parts.append(escaped)

    return "".join(html_parts)


def decorate_console_message(content: str) -> str:
    """
    Escape and highlight console content.

    If ANSI/SGR sequences are present (e.g. Vite / pnpm dev output),
    convert them into styled HTML spans; otherwise, apply simple highlighting.
    """
    if "\x1b[" in content or ANSI_SGR_REGEX.search(content):
        return _convert_ansi_to_html(content)

    escaped = escape(content)
    return _apply_inline_highlighting(escaped)


def format_console_log_html_classic(log_lines) -> str:
    """Format console logs with classic styling."""
    html_lines = ['<div style="margin:0; padding:0; line-height:1.4; font-family: \'Consolas\', \'Courier New\', monospace; font-size:9pt;">']
    for raw_line in log_lines:
        line = str(raw_line)
        timestamp_match = CONSOLE_TIMESTAMP_REGEX.match(line)
        if timestamp_match:
            time, tag, content = timestamp_match.groups()
            tag_color = '#f44336' if tag == 'ERR' else '#4CAF50'
            content_html = decorate_console_message(content)
            formatted = (
                f'<span style="color:#666;">[{time}]</span> '
                f'<span style="color:{tag_color}; font-weight:bold;">[{tag}]</span> '
                f'{content_html}'
            )
            html_lines.append(f'<div style="margin-bottom:2px;">{formatted}</div>')
        else:
            html_lines.append(f'<div style="margin-bottom:2px;">{decorate_console_message(line)}</div>')
    html_lines.append('</div>')
    return '\n'.join(html_lines)


def format_console_log_html_enhanced(log_lines) -> str:
    """Format console logs with enhanced styling."""
    html_lines = ['<div style="margin: 0; padding: 0; line-height: 1.5; font-family: \'Consolas\', \'Courier New\', monospace; font-size: 9pt;">']

    in_traceback = False
    for raw_line in log_lines:
        line = str(raw_line)
        # Strip ANSI codes for regex matching (but keep original for display)
        line_clean = strip_ansi(line)

        # Check if this is a low-signal line (health checks, pings)
        is_dimmed = is_low_signal_line(line_clean)

        # Detect traceback lines for better visual grouping
        is_traceback_line = line.strip().startswith(('File "', 'Traceback', '  File', 'at ')) or 'Traceback (most recent call last)' in line
        is_exception_line = any(x in line for x in ('Error:', 'Exception:', 'Warning:'))

        # Start traceback block
        if not in_traceback and (is_traceback_line or is_exception_line):
            in_traceback = True
            html_lines.append('<div style="background-color: rgba(239,83,80,0.08); border-left: 4px solid #EF5350; margin: 8px 0; padding: 8px; border-radius: 4px;">')
        elif in_traceback and not is_traceback_line and not is_exception_line and line.strip() and not line.startswith(' '):
            # End traceback block
            html_lines.append('</div>')
            in_traceback = False

        # Initial level and style
        line_level = detect_console_level(line_clean)
        style_def = CONSOLE_LEVEL_STYLES.get(line_level, {})
        border_color = style_def.get("accent", "#555")
        bg_color = style_def.get("bg", "")

        # Apply dimming for low-signal lines
        if is_dimmed:
            wrapper_style = (
                f"border-left: 2px solid #444; padding: 3px 8px;"
                "margin: 0 0 2px; border-radius: 3px; opacity: 0.55;"
            )
        else:
            wrapper_style = (
                f"border-left: 3px solid {border_color}; padding: 4px 8px;"
                "margin: 0 0 4px; border-radius: 4px;"
            )
            if bg_color:
                wrapper_style += f" background-color: {bg_color};"

        # Parse time/tag/content
        time = None
        tag = None
        content = line_clean

        # Try structured log format first (most specific)
        structured_match = STRUCTURED_LOG_REGEX.match(line_clean)
        if structured_match:
            timestamp_str, level, content = structured_match.groups()
            # Convert UTC to local time if it's a full ISO timestamp
            time = convert_utc_to_local_time(timestamp_str)
            if not time:
                # Fallback: Extract just HH:MM:SS from timestamp
                time_match = re.search(r'(\d{2}:\d{2}:\d{2})', timestamp_str)
                time = time_match.group(1) if time_match else None
            tag = None
            if level.upper() in CONSOLE_LEVEL_STYLES:
                line_level = level.upper()
        else:
            # Try clean log format: [HH:MM:SS] LEVEL service event ...
            clean_match = CLEAN_LOG_REGEX.match(line_clean)
            if clean_match:
                time, level, content = clean_match.groups()
                tag = None
                # Normalize levels to standard forms
                level_upper = level.upper()
                level_normalized = {
                    "WARN": "WARNING",
                    "CRIT": "CRITICAL",
                }.get(level_upper, level_upper)
                if level_normalized in CONSOLE_LEVEL_STYLES:
                    line_level = level_normalized
            else:
                # Try launcher timestamp format
                timestamp_match = CONSOLE_TIMESTAMP_REGEX.match(line_clean)
                if timestamp_match:
                    time, tag, content = timestamp_match.groups()
                else:
                    # Try ISO timestamp format
                    iso_match = ISO_TIMESTAMP_REGEX.match(line_clean)
                    if iso_match:
                        full_timestamp = f"{iso_match.group(1)}T{iso_match.group(2)}"
                        if iso_match.group(3):  # Has timezone indicator
                            full_timestamp += iso_match.group(3)
                        time = convert_utc_to_local_time(full_timestamp) or iso_match.group(2)
                        tag = None
                        content = iso_match.group(4).strip() or line_clean
                    else:
                        # Try ARQ worker format: HH:MM:SS: message
                        arq_match = ARQ_TIMESTAMP_REGEX.match(line_clean)
                        if arq_match:
                            time = arq_match.group(1)
                            tag = None
                            content = arq_match.group(2)
                        else:
                            # Try level prefix format
                            prefix_match = LEVEL_PREFIX_REGEX.match(line_clean)
                            if prefix_match:
                                possible_level = prefix_match.group(1).upper()
                                if not line_level:
                                    line_level = "WARNING" if possible_level == "WARN" else possible_level
                                time = None
                                tag = None
                                content = prefix_match.group(2) or line_clean
                            else:
                                time, tag, content = None, None, line_clean

        time_display = time or '--:--:--'

        # Extract an optional "service" token from the beginning of the content
        service_label = ""
        content_text = content or ""
        if content_text:
            parts = content_text.split(None, 1)
            # Handle whitespace-only content (split returns empty list)
            if parts:
                first = parts[0]
                # Heuristic: treat first token as service/logger name if it's a short identifier
                if re.match(r"^[A-Za-z][A-Za-z0-9_.:-]{0,15}$", first):
                    service_label = first
                    content_body = parts[1] if len(parts) > 1 else ""
                else:
                    content_body = content_text
            else:
                content_body = ""
        else:
            content_body = ""

        content_html = decorate_console_message(content_body or "")

        # Build unified header using shared helper (timestamp + tag + level + service)
        tag_display = tag or 'LOG'
        header_html = build_log_header_html(time_display, level=line_level, service=service_label, tag=tag_display)

        text_html = (
            f'<span style="color: #dcdcdc; white-space: pre-wrap;">{content_html}</span>'
        )

        html_lines.append(
            f'<div style="{wrapper_style}">{header_html}&nbsp;{text_html}</div>'
        )

    # Close traceback block if still open
    if in_traceback:
        html_lines.append('</div>')

    html_lines.append('</div>')
    return '\n'.join(html_lines)


def format_console_log_html(log_lines, enhanced: bool = True) -> str:
    """Format console logs for display."""
    if enhanced:
        return format_console_log_html_enhanced(log_lines)
    return format_console_log_html_classic(log_lines)
