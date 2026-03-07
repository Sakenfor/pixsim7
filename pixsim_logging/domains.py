"""Per-domain log level/enable configuration.

Allows selective log filtering by business domain via the PIXSIM_LOG_DOMAINS
environment variable or runtime updates via ``update_domain_config()``.

Format (env var):
    PIXSIM_LOG_DOMAINS=generation:INFO,account:DEBUG,cron:OFF

Format (runtime dict):
    update_domain_config({"generation": "INFO", "cron": "OFF"})

Missing domains inherit the global PIXSIM_LOG_LEVEL. ``OFF`` disables the
domain entirely.  No env var = all domains enabled (backward compatible).
"""
from __future__ import annotations

import logging
import os
from typing import Dict, Optional

import structlog

KNOWN_DOMAINS = frozenset({"generation", "account", "provider", "cron", "system"})

_LEVEL_OFF = -1  # Sentinel: domain disabled


def parse_domain_config(raw: str) -> Dict[str, int]:
    """Parse ``PIXSIM_LOG_DOMAINS`` env var into ``{domain: numeric_level}``."""
    config: Dict[str, int] = {}
    for part in raw.split(","):
        part = part.strip()
        if not part or ":" not in part:
            continue
        domain, level_str = part.split(":", 1)
        domain = domain.strip().lower()
        level_str = level_str.strip().upper()
        if level_str == "OFF":
            config[domain] = _LEVEL_OFF
        else:
            numeric = getattr(logging, level_str, None)
            if isinstance(numeric, int):
                config[domain] = numeric
    return config


def _parse_dict_config(levels: Dict[str, str]) -> Dict[str, int]:
    """Convert ``{"domain": "LEVEL"}`` dict to ``{domain: numeric_level}``."""
    config: Dict[str, int] = {}
    for domain, level_str in levels.items():
        domain = domain.strip().lower()
        level_str = level_str.strip().upper()
        if level_str == "OFF":
            config[domain] = _LEVEL_OFF
        else:
            numeric = getattr(logging, level_str, None)
            if isinstance(numeric, int):
                config[domain] = numeric
    return config


def _get_global_level() -> int:
    name = os.getenv("PIXSIM_LOG_LEVEL", "INFO").upper()
    return getattr(logging, name, logging.INFO)


# Parse once at import time.
_raw = os.getenv("PIXSIM_LOG_DOMAINS", "")
_DOMAIN_CONFIG: Dict[str, int] = parse_domain_config(_raw) if _raw else {}


def update_domain_config(levels: Dict[str, str]) -> None:
    """Replace domain config at runtime (called by system_config applier).

    Pass an empty dict to clear all domain overrides.
    """
    global _DOMAIN_CONFIG
    _DOMAIN_CONFIG = _parse_dict_config(levels) if levels else {}


def get_domain_config_display() -> Dict[str, str]:
    """Return current config as ``{domain: level_name}`` for API responses."""
    result: Dict[str, str] = {}
    for domain, numeric in _DOMAIN_CONFIG.items():
        if numeric == _LEVEL_OFF:
            result[domain] = "OFF"
        else:
            result[domain] = logging.getLevelName(numeric)
    return result


def _domain_filter_processor(
    logger, method_name: str, event_dict: dict
):
    """Structlog processor that drops events based on domain config."""
    if not _DOMAIN_CONFIG:
        return event_dict

    domain: Optional[str] = event_dict.get("domain")
    if domain is None:
        return event_dict

    threshold = _DOMAIN_CONFIG.get(domain)
    if threshold is None:
        # Domain not mentioned in config — inherit global level.
        return event_dict

    if threshold == _LEVEL_OFF:
        raise structlog.DropEvent

    # Compare event level against domain threshold.
    level_name = event_dict.get("level", "info")
    if isinstance(level_name, str):
        event_level = getattr(logging, level_name.upper(), logging.INFO)
    else:
        event_level = logging.INFO

    if event_level < threshold:
        raise structlog.DropEvent

    return event_dict
