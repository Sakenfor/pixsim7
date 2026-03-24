"""Log filter definitions — shared filter options and presets for all UI consumers.

Defines what filters are available, their options, and built-in presets.
UI consumers fetch this via /logs/meta and render the controls.

Usage::

    from pixsim_logging.filters import get_filter_config, BUILTIN_PRESETS

    config = get_filter_config()
    # config["level_options"]  → ["", "DEBUG", "INFO", ...]
    # config["presets"]        → [{"id": "worker-errors", ...}, ...]
"""
from __future__ import annotations

from .spec import DOMAINS, CHANNELS, STAGES, SERVICES, PROVIDERS
from .parsing import LEVEL_NAMES


# ── Filter option lists ──────────────────────────────────────────────

LEVEL_OPTIONS = [""] + list(LEVEL_NAMES)  # "" = "All levels"

SERVICE_OPTIONS = [""] + sorted({
    s.replace(".*", "") for s in SERVICES
})

CHANNEL_OPTIONS = [""] + list(CHANNELS)

DOMAIN_OPTIONS = [""] + list(DOMAINS)

STAGE_OPTIONS = [""] + list(STAGES)

PROVIDER_OPTIONS = [""] + list(PROVIDERS)

# Time range presets (minutes, 0 = all)
TIME_RANGE_OPTIONS = [
    {"value": 5, "label": "5m"},
    {"value": 15, "label": "15m"},
    {"value": 60, "label": "1h"},
    {"value": 360, "label": "6h"},
    {"value": 1440, "label": "24h"},
    {"value": 0, "label": "All"},
]

LIMIT_OPTIONS = [100, 250, 500]

AUTO_REFRESH_OPTIONS = [
    {"value": 0, "label": "Off"},
    {"value": 2000, "label": "2s"},
    {"value": 5000, "label": "5s"},
    {"value": 10000, "label": "10s"},
]


# ── Filter presets ───────────────────────────────────────────────────

BUILTIN_PRESETS = [
    {
        "id": "missing-provider-job-id",
        "label": "Missing Provider Job ID",
        "description": "Debug PROCESSING generations stuck when provider_job_id is missing.",
        "api_filters": {"channel": "pipeline", "time_range": 60, "limit": 500},
        "include_patterns": [
            "generation_submission_missing_provider_job_id",
            "generation_failed_unsubmitted_submission_error",
            "generation_poll_using_previous_valid_submission",
            "missing_provider_job_id_waiting",
            "provider_submission_created",
            "provider_execute_started",
            "provider_execute_returned",
            "provider_submission_updated",
            "provider_execute_failed",
        ],
        "exclude_patterns": [],
        "highlight_patterns": [
            "generation_submission_missing_provider_job_id",
            "generation_failed_unsubmitted_submission_error",
        ],
    },
    {
        "id": "provider-concurrent-limit",
        "label": "Provider Concurrent Limit",
        "description": "Track queue capacity, concurrent slot exhaustion, and deferred jobs.",
        "api_filters": {"channel": "pipeline", "time_range": 15, "limit": 500},
        "include_patterns": [
            "concurrent", "capacity", "deferred", "queue_full",
            "slot_exhausted", "provider_execute_started",
            "provider_execute_returned", "provider_execute_failed",
        ],
        "exclude_patterns": [],
    },
    {
        "id": "content-filter-retry",
        "label": "Content Filter Retry",
        "description": "Find generations blocked by content filters and their retry attempts.",
        "api_filters": {"channel": "pipeline", "time_range": 360, "limit": 500},
        "include_patterns": [
            "content_filter", "content_moderation", "nsfw",
            "retry", "auto_retry", "generation_retry",
        ],
        "exclude_patterns": [],
    },
    {
        "id": "auth-session-failures",
        "label": "Auth / Session Failures",
        "description": "Track authentication errors, token rotation, and session issues.",
        "api_filters": {"level": "ERROR", "time_range": 60, "limit": 250},
        "include_patterns": [
            "auth", "token", "session", "unauthorized",
            "401", "credential", "login", "rotation",
        ],
        "exclude_patterns": [],
    },
    {
        "id": "worker-errors",
        "label": "Worker Errors",
        "description": "All worker-level errors for quick triage.",
        "api_filters": {"service": "worker", "level": "ERROR", "time_range": 60, "limit": 250},
        "include_patterns": [],
        "exclude_patterns": [],
    },
]


# ── API serialization ───────────────────────────────────────────────

_cache: dict | None = None


def get_filter_config() -> dict:
    """Return the full filter configuration for API responses.

    Includes all option lists, time range presets, and built-in filter presets.
    Cached after first call.
    """
    global _cache
    if _cache is not None:
        return _cache

    _cache = {
        "level_options": LEVEL_OPTIONS,
        "service_options": SERVICE_OPTIONS,
        "channel_options": CHANNEL_OPTIONS,
        "domain_options": DOMAIN_OPTIONS,
        "stage_options": STAGE_OPTIONS,
        "provider_options": PROVIDER_OPTIONS,
        "time_range_options": TIME_RANGE_OPTIONS,
        "limit_options": LIMIT_OPTIONS,
        "auto_refresh_options": AUTO_REFRESH_OPTIONS,
        "presets": BUILTIN_PRESETS,
    }
    return _cache
