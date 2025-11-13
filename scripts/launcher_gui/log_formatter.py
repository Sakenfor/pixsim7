"""
Log formatting utilities for database log viewer.
Handles HTML generation, tooltips, clickable elements, and copy functionality.
"""
from datetime import datetime
import re

try:
    from .log_styles import (
        LEVEL_COLORS, SERVICE_COLORS, DEFAULT_LEVEL_COLOR,
        DEFAULT_SERVICE_COLOR, get_status_color, COMPONENT_COLORS
    )
except ImportError:
    from log_styles import (
        LEVEL_COLORS, SERVICE_COLORS, DEFAULT_LEVEL_COLOR,
        DEFAULT_SERVICE_COLOR, get_status_color, COMPONENT_COLORS
    )


def escape_html(text):
    """Escape HTML special characters."""
    if not text:
        return ''
    return (str(text)
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('"', '&quot;')
            .replace("'", '&#39;'))


def format_relative_time(timestamp):
    """Convert timestamp to relative time string (e.g., '5m ago')."""
    try:
        if isinstance(timestamp, str):
            ts = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        else:
            ts = timestamp

        now = datetime.now(ts.tzinfo) if ts.tzinfo else datetime.now()
        delta = now - ts

        if delta.days > 0:
            return f"{delta.days}d ago"
        elif delta.seconds >= 3600:
            return f"{delta.seconds // 3600}h ago"
        elif delta.seconds >= 60:
            return f"{delta.seconds // 60}m ago"
        else:
            return f"{delta.seconds}s ago"
    except Exception:
        return ''


def format_timestamp(ts_str):
    """Format timestamp for display with tooltip."""
    if not ts_str:
        return '<span style="color: #999;">[???]</span>', ''

    try:
        if isinstance(ts_str, str):
            ts = datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
        else:
            ts = ts_str
        ts_display = ts.strftime('%Y-%m-%d %H:%M:%S')
        ts_relative = format_relative_time(ts)
        ts_tooltip = f' title="{ts_relative}"' if ts_relative else ''
        return f'<span style="color: {COMPONENT_COLORS["timestamp"]};"{ts_tooltip}>[{ts_display}]</span>', ts_relative
    except Exception:
        ts_display = str(ts_str)[:19]
        return f'<span style="color: {COMPONENT_COLORS["timestamp"]};">[{ts_display}]</span>', ''


def format_level(level):
    """Format log level with color."""
    level_str = level.upper() if level else 'INFO'
    color = LEVEL_COLORS.get(level_str, DEFAULT_LEVEL_COLOR)
    return f'<span style="color: {color}; font-weight: bold;">{level_str:8s}</span>'


def format_service(service):
    """Format service name with clickable link and color."""
    color = SERVICE_COLORS.get(service, DEFAULT_SERVICE_COLOR)
    return f'<a href="service://{service}" style="color: {color}; text-decoration: none;">{service:10s}</a>'


def format_message(msg):
    """Format message with truncation and tooltip."""
    if not msg:
        return ''

    msg_display = msg if len(msg) <= 100 else msg[:97] + '...'
    msg_tooltip = f' title="{escape_html(msg)}"' if len(msg) > 100 else ''
    return f' | <span style="color: {COMPONENT_COLORS["message"]};"{msg_tooltip}>{escape_html(msg_display)}</span>'


def format_http_request(method, path, status_code=None):
    """Format HTTP request details."""
    parts = []

    # Method
    parts.append(f'<span style="color: {COMPONENT_COLORS["method"]};">{method}</span>')

    # Path with truncation
    path_display = path if len(path) <= 50 else path[:47] + '...'
    path_tooltip = f' title="{escape_html(path)}"' if len(path) > 50 else ''
    parts.append(f'<span style="color: {COMPONENT_COLORS["path"]};"{path_tooltip}>{escape_html(path_display)}</span>')

    # Status code
    if status_code:
        status_color = get_status_color(status_code)
        parts.append(f'<span style="color: {status_color};">→ {status_code}</span>')

    return ' | ' + ' '.join(parts)


def format_clickable_id(field_name, value, label=None):
    """Format a clickable ID field for filtering."""
    if not value:
        return ''

    colors = {
        'job_id': COMPONENT_COLORS['job_id'],
        'request_id': COMPONENT_COLORS['request_id'],
        'user_id': COMPONENT_COLORS['user_id']
    }

    color = colors.get(field_name, '#FFB74D')
    display_label = label or f"{field_name.replace('_id', '')}:{value}"

    # Shorten long IDs
    if field_name == 'request_id' and len(str(value)) > 8:
        display_value = str(value)[:8]
        tooltip = f' title="Click to filter by {field_name} ({value})"'
    else:
        display_value = value
        tooltip = f' title="Click to filter by {field_name}"'

    display_text = display_label.replace(str(value), str(display_value))

    return f' | <a href="filter://{field_name}/{value}" class="clickable-id" style="color: {color};"{tooltip}>{display_text}</a>'


def format_error(error_msg):
    """Format error message with truncation and tooltip."""
    if not error_msg:
        return ''

    error_display = error_msg[:100] if len(error_msg) > 100 else error_msg
    error_tooltip = f' title="{escape_html(error_msg)}"' if len(error_msg) > 100 else ''
    return f'<br/><span style="color: {COMPONENT_COLORS["error"]}; margin-left: 20px;"{error_tooltip}>ERROR: {escape_html(error_display)}</span>'


def format_log_line_html(log, idx=0):
    """
    Format a single log entry as colored HTML with hover, tooltips, and copy functionality.

    Args:
        log: Log dictionary from API
        idx: Row index for unique ID

    Returns:
        HTML string for the log row
    """
    # Timestamp
    ts_html, _ = format_timestamp(log.get('timestamp', ''))

    # Level
    level_html = format_level(log.get('level', 'INFO'))

    # Service
    service_html = format_service(log.get('service', '?'))

    # Build line content
    line_content = f'{ts_html} {level_html} {service_html}'

    # Message
    msg = log.get('msg') or log.get('event') or ''
    extra = log.get('extra', {})
    if not msg and isinstance(extra, dict):
        msg = extra.get('event', '')

    line_content += format_message(msg)

    # Extract IDs
    job_id = log.get('job_id') or (extra.get('job_id') if isinstance(extra, dict) else None)
    request_id = log.get('request_id') or (extra.get('request_id') if isinstance(extra, dict) else None)
    user_id = log.get('user_id') or (extra.get('user_id') if isinstance(extra, dict) else None)

    # HTTP request details
    if isinstance(extra, dict) and extra.get('method'):
        line_content += format_http_request(
            extra['method'],
            extra.get('path', '?'),
            extra.get('status_code')
        )

        # Service/operation details
        if extra.get('service_key'):
            line_content += f' | <span style="color: {COMPONENT_COLORS["service_key"]};">svc:{extra["service_key"]}</span>'
        if extra.get('pid'):
            line_content += f' | <span style="color: {COMPONENT_COLORS["pid"]};">pid:{extra["pid"]}</span>'
        if extra.get('port'):
            line_content += f' | <span style="color: {COMPONENT_COLORS["port"]};">port:{extra["port"]}</span>'

    # Clickable IDs
    if job_id:
        line_content += format_clickable_id('job_id', job_id, f'job:{job_id}')
    if request_id:
        req_short = str(request_id)[:8] if len(str(request_id)) > 8 else request_id
        line_content += format_clickable_id('request_id', request_id, f'req:{req_short}')
    if user_id:
        line_content += format_clickable_id('user_id', user_id, f'user:{user_id}')

    # Duration
    duration_ms = log.get('duration_ms') or (extra.get('duration_ms') if isinstance(extra, dict) else None)
    if duration_ms:
        line_content += f' <span style="color: {COMPONENT_COLORS["duration"]};">({duration_ms}ms)</span>'

    # Error
    error_extra = format_error(log.get('error'))

    # Build full log row (store data for context menu access)
    plain_text = re.sub('<[^<]+?>', '', line_content + error_extra)
    plain_text = (plain_text
                  .replace('&nbsp;', ' ')
                  .replace('&lt;', '<')
                  .replace('&gt;', '>')
                  .replace('&amp;', '&')
                  .replace('&quot;', '"')
                  .replace('&#39;', "'"))

    # Store field values as data attributes for context menu
    data_attrs = f'data-text="{escape_html(plain_text)}"'
    if job_id:
        data_attrs += f' data-job-id="{job_id}"'
    if request_id:
        data_attrs += f' data-request-id="{request_id}"'
    if user_id:
        data_attrs += f' data-user-id="{user_id}"'

    row = f'<div class="log-row" id="log-{idx}" {data_attrs}>\n    {line_content}{error_extra}\n</div>'

    return row
