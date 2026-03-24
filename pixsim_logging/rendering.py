"""Log rendering metadata — single source of truth for all UI consumers.

Colors, styles, and field display metadata used by:
- React log viewers (launcher dashboard, embedded console, DB logs, dev tools)
- PySide6 GUI (console_utils, log_formatter)
- API endpoints (/logs/meta)

Usage::

    from pixsim_logging.rendering import get_rendering_metadata

    meta = get_rendering_metadata()
    # meta["level_colors"]["ERROR"]["color"]  → "#EF5350"
    # meta["fields"]  → [{"name": "request_id", ...}, ...]
"""
from __future__ import annotations

from .reader import field_registry
from .filters import get_filter_config
from .parsing import get_format_spec


# ── Level colors ─────────────────────────────────────────────────────

LEVEL_COLORS = {
    "DEBUG":    {"color": "#888888", "bg": "rgba(136,136,136,0.08)"},
    "INFO":     {"color": "#4FC3F7", "bg": "rgba(79,195,247,0.08)"},
    "WARNING":  {"color": "#FFB74D", "bg": "rgba(255,183,77,0.12)"},
    "ERROR":    {"color": "#EF5350", "bg": "rgba(239,83,80,0.12)"},
    "CRITICAL": {"color": "#FF1744", "bg": "rgba(255,23,68,0.18)"},
}

DEFAULT_LEVEL_COLOR = "#d4d4d4"


# ── Service colors ───────────────────────────────────────────────────

SERVICE_COLORS = {
    "api":       "#81C784",
    "worker":    "#64B5F6",
    "launcher":  "#FFD54F",
    "game":      "#BA68C8",
}

DEFAULT_SERVICE_COLOR = "#B0BEC5"


# ── HTTP status colors ──────────────────────────────────────────────

HTTP_STATUS_COLORS = {
    "2xx": "#4CAF50",
    "4xx": "#FF9800",
    "5xx": "#F44336",
    "other": "#9E9E9E",
}


def http_status_color(code: int) -> str:
    """Return hex color for an HTTP status code."""
    if 200 <= code < 300:
        return HTTP_STATUS_COLORS["2xx"]
    if 400 <= code < 500:
        return HTTP_STATUS_COLORS["4xx"]
    if code >= 500:
        return HTTP_STATUS_COLORS["5xx"]
    return HTTP_STATUS_COLORS["other"]


# ── Component colors (for structured log fields in detail views) ────

COMPONENT_COLORS = {
    "method":      "#90CAF9",
    "path":        "#CE93D8",
    "duration":    "#B39DDB",
    "error":       "#EF5350",
    "job_id":      "#FFA726",
    "request_id":  "#AB47BC",
    "user_id":     "#66BB6A",
    "timestamp":   "#999999",
    "message":     "#E0E0E0",
    "provider":    "#4DD0E1",
    "stage":       "#9FA8DA",
    "pid":         "#FFE082",
    "port":        "#A5D6A7",
    "service_key": "#FFAB91",
}


# ── Clickable field metadata ────────────────────────────────────────
# Extends the FieldRegistry with display hints for UI consumers.

CLICKABLE_FIELD_META: dict[str, dict] = {
    "request_id":      {"prefix": "req",      "truncate": 8,  "color": "#FFB74D"},
    "job_id":          {"prefix": "job",      "truncate": 0,  "color": "#4DD0E1"},
    "user_id":         {"prefix": "user",     "truncate": 0,  "color": "#CE93D8"},
    "provider_id":     {"prefix": "provider", "truncate": 0,  "color": "#81C784"},
    "account_id":      {"prefix": "acct",     "truncate": 0,  "color": "#90CAF9"},
    "asset_id":        {"prefix": "asset",    "truncate": 0,  "color": "#FFCC80"},
    "generation_id":   {"prefix": "gen",      "truncate": 0,  "color": "#B39DDB"},
    "provider_job_id": {"prefix": "pjob",     "truncate": 12, "color": "#A5D6A7"},
    "error_type":      {"prefix": "err",      "truncate": 0,  "color": "#EF9A9A"},
    "submission_id":   {"prefix": "sub",      "truncate": 8,  "color": "#FFB74D"},
}


# ── API serialization ───────────────────────────────────────────────

_cache: dict | None = None


def get_rendering_metadata() -> dict:
    """Return the full rendering metadata dict for API responses.

    Cached after first call.  All UI consumers should use this as
    the single source of truth for log rendering styles.
    """
    global _cache
    if _cache is not None:
        return _cache

    _cache = {
        "level_colors": LEVEL_COLORS,
        "service_colors": SERVICE_COLORS,
        "http_status_colors": HTTP_STATUS_COLORS,
        "component_colors": COMPONENT_COLORS,
        "fields": field_registry.as_dicts(),
        "clickable_fields": CLICKABLE_FIELD_META,
        "filters": get_filter_config(),
        "formats": get_format_spec(),
    }
    return _cache
