"""Console log formatting utilities for the launcher."""
import re
from html import escape

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
    html_lines = ['<div style="margin: 0; padding: 0; line-height: 1.45; font-family: \'Consolas\', \'Courier New\', monospace; font-size: 9pt;">']

    in_traceback = False
    for raw_line in log_lines:
        line = str(raw_line)
        # Strip ANSI codes for regex matching (but keep original for display)
        line_clean = strip_ansi(line)

        # Detect traceback lines for better visual grouping
        is_traceback_line = line.strip().startswith(('File "', 'Traceback', '  File', 'at ')) or 'File "' in line
        is_exception_line = any(x in line for x in ('Error:', 'Exception:', 'Warning:'))

        # Start traceback block
        if not in_traceback and (is_traceback_line or (is_exception_line and 'Traceback' in '\n'.join(str(l) for l in log_lines[max(0, log_lines.index(raw_line)-5):log_lines.index(raw_line)]))):
            in_traceback = True
            html_lines.append('<div style="background-color: rgba(239,83,80,0.08); border-left: 4px solid #EF5350; margin: 8px 0; padding: 8px; border-radius: 4px;">')
        elif in_traceback and not is_traceback_line and not is_exception_line and line.strip() and not line.startswith(' '):
            # End traceback block
            html_lines.append('</div>')
            in_traceback = False

        line_level = detect_console_level(line_clean)
        style_def = CONSOLE_LEVEL_STYLES.get(line_level, {})
        border_color = style_def.get("accent", "#555")
        bg_color = style_def.get("bg", "")
        wrapper_style = (
            f"border-left: 3px solid {border_color}; padding: 4px 8px;"
            "margin: 0 0 4px; border-radius: 4px;"
        )
        if bg_color:
            wrapper_style += f" background-color: {bg_color};"

        # Try structured log format first (most specific)
        # Use line_clean (ANSI-stripped) for regex matching
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
            line_level = level.upper() if level.upper() in CONSOLE_LEVEL_STYLES else line_level
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
                # Ensure the level is recognized
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
                        # Convert UTC to local time
                        time = convert_utc_to_local_time(full_timestamp)
                        if not time:
                            # Fallback: Just use HH:MM:SS part
                            time = iso_match.group(2)
                        tag = None
                        content = iso_match.group(4).strip() or line_clean
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

        tag_color = '#f44336' if (tag or '').upper() == 'ERR' else '#4CAF50'
        time_display = time or '--:--:--'
        tag_display = tag or 'LOG'

        content_html = decorate_console_message(content or "")

        level_badge = ""
        if line_level:
            badge_color = style_def.get("accent", "#888")
            level_badge = (
                f'<span style="color: {badge_color}; border: 1px solid {badge_color};'
                'border-radius: 4px; padding: 0 6px; font-size: 8pt; font-weight: bold;'
                'min-width: 58px; text-align: center;">'
                f'{line_level}'
                '</span>'
            )
        level_html = level_badge or '<span style="display:inline-block; width: 60px;"></span>'

        time_html = (
            f'<span style="color: #888; display: inline-block; width: 80px;">[{time_display}]</span>'
        )
        tag_html = (
            f'<span style="color: {tag_color}; font-weight: bold; display: inline-block; width: 60px; text-align: center;">'
            f'[{tag_display}]'
            '</span>'
        )
        text_html = (
            f'<span style="color: #dcdcdc; white-space: pre-wrap;">{content_html}</span>'
        )

        html_lines.append(
            f'<div style="{wrapper_style}">{time_html}&nbsp;'
            f'{tag_html}&nbsp;'
            f'{level_html}&nbsp;'
            f'{text_html}</div>'
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
