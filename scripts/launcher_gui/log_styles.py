"""
CSS styles and color schemes for log viewer.
"""

# Log row hover and interaction styles
LOG_ROW_STYLES = '''
<style>
    .log-row {
        padding: 4px 8px;
        margin: 1px 0;
        border-radius: 3px;
        cursor: default;
        position: relative;
        font-family: 'Consolas', 'Courier New', monospace;
        font-size: 9pt;
        user-select: text;
    }
    .log-row:hover {
        background-color: rgba(255, 255, 255, 0.08);
        outline: 1px solid rgba(100, 181, 246, 0.3);
    }
    .log-row.selected {
        background-color: rgba(100, 181, 246, 0.15);
        outline: 1px solid rgba(100, 181, 246, 0.5);
    }
    .clickable-id {
        cursor: pointer;
        text-decoration: underline dotted;
    }
    .clickable-id:hover {
        text-decoration: underline solid;
        opacity: 0.8;
    }
</style>
'''

# Log level colors
LEVEL_COLORS = {
    'DEBUG': '#888888',
    'INFO': '#4FC3F7',
    'WARNING': '#FFB74D',
    'ERROR': '#EF5350',
    'CRITICAL': '#FF1744'
}

# Service colors
SERVICE_COLORS = {
    'api': '#81C784',
    'worker': '#64B5F6',
    'launcher': '#FFD54F',
    'game': '#BA68C8'
}

# Default fallback colors
DEFAULT_LEVEL_COLOR = '#d4d4d4'
DEFAULT_SERVICE_COLOR = '#B0BEC5'

# HTTP status code colors
def get_status_color(status_code):
    """Get color for HTTP status code."""
    if 200 <= status_code < 300:
        return '#4CAF50'  # Green
    elif 400 <= status_code < 500:
        return '#FF9800'  # Orange
    elif status_code >= 500:
        return '#F44336'  # Red
    else:
        return '#9E9E9E'  # Gray

# Component-specific colors
COMPONENT_COLORS = {
    'service_key': '#FFAB91',
    'pid': '#FFE082',
    'port': '#A5D6A7',
    'method': '#90CAF9',
    'path': '#CE93D8',
    'duration': '#B39DDB',
    'error': '#EF5350',
    'job_id': '#FFA726',
    'request_id': '#AB47BC',
    'user_id': '#66BB6A',
    'timestamp': '#999',
    'message': '#E0E0E0'
}
