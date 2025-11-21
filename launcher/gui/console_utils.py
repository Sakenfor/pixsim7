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
ISO_TIMESTAMP_REGEX = re.compile(r'(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(.*)')
LEVEL_PREFIX_REGEX = re.compile(r'(DEBUG|INFO|WARNING|ERROR|CRITICAL):\s*(.*)', re.IGNORECASE)

# Decoration regexes
URL_LINK_REGEX = re.compile(r'(https?://[^\s]+)')
READY_REGEX = re.compile(r'\b(VITE|ready|Local|Network|running|started|listening)\b')
ERROR_REGEX = re.compile(r'\b(ERROR|error|failed|Error|FAILED)\b')
WARN_REGEX = re.compile(r'\b(WARNING|warning|WARN|warn)\b')


def detect_console_level(line: str) -> str | None:
    """Detect log level from a line."""
    for level in ("ERROR", "CRITICAL", "WARNING", "DEBUG", "INFO"):
        if CONSOLE_LEVEL_PATTERNS[level].search(line):
            return level
    return None


def decorate_console_message(content: str) -> str:
    """Escape and highlight console content."""
    text = escape(content)
    text = URL_LINK_REGEX.sub(
        r'<a href="\1" style="color: #64B5F6; text-decoration: underline;">\1</a>',
        text
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

    for raw_line in log_lines:
        line = str(raw_line)
        line_level = detect_console_level(line)
        style_def = CONSOLE_LEVEL_STYLES.get(line_level, {})
        border_color = style_def.get("accent", "#555")
        bg_color = style_def.get("bg", "")
        wrapper_style = (
            f"border-left: 3px solid {border_color}; padding: 4px 8px;"
            "margin: 0 0 4px; border-radius: 4px;"
        )
        if bg_color:
            wrapper_style += f" background-color: {bg_color};"

        timestamp_match = CONSOLE_TIMESTAMP_REGEX.match(line)
        if timestamp_match:
            time, tag, content = timestamp_match.groups()
        else:
            iso_match = ISO_TIMESTAMP_REGEX.match(line)
            if iso_match:
                time = iso_match.group(2)
                tag = None
                remainder = iso_match.group(3).strip()
                content = remainder or line[iso_match.start(3):].strip() or line
            else:
                prefix_match = LEVEL_PREFIX_REGEX.match(line)
                if prefix_match:
                    possible_level = prefix_match.group(1).upper()
                    if not line_level:
                        line_level = "WARNING" if possible_level == "WARN" else possible_level
                    time = None
                    tag = None
                    content = prefix_match.group(2) or line
                else:
                    time, tag, content = None, None, line

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

    html_lines.append('</div>')
    return '\n'.join(html_lines)


def format_console_log_html(log_lines, enhanced: bool = True) -> str:
    """Format console logs for display."""
    if enhanced:
        return format_console_log_html_enhanced(log_lines)
    return format_console_log_html_classic(log_lines)
