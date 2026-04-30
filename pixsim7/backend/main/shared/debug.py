"""
Debug logging utilities

Thin wrapper over ``pixsim_logging`` domain config. A category is "enabled"
iff its domain is configured at DEBUG (or absent and global level is DEBUG).
There is no per-user state — log gating is global, set via the system
``LoggingSettings`` config (admin endpoint) or the ``PIXSIM_LOG_DOMAINS`` /
``PIXSIM_WORKER_DEBUG`` env vars at boot.
"""
import os
from typing import Dict, Optional

from pixsim_logging import get_logger
from pixsim_logging.domains import update_domain_config, get_domain_config_display

logger = get_logger()


class DebugLogger:
    """Conditional debug logger keyed by domain category.

    Enabled iff the domain is explicitly set to DEBUG in the global logging
    config. (Unconfigured domains are *not* treated as enabled — that mirrors
    the frontend ``debugFlags`` semantics and prevents accidental log floods
    when the global level is DEBUG.)

    Usage:
        debug = DebugLogger()
        debug.log('generation', 'Dedup hash:', hash_value)
    """

    def is_enabled(self, category: str) -> bool:
        levels = get_domain_config_display()
        return levels.get(category, "").upper() == "DEBUG"

    def log(self, category: str, *args, **kwargs):
        if self.is_enabled(category):
            message = " ".join(str(arg) for arg in args)
            logger.debug(
                f"debug:{category}",
                msg=message,
                category=category,
                **kwargs,
            )

    def generation(self, *args, **kwargs):
        self.log("generation", *args, **kwargs)

    def provider(self, *args, **kwargs):
        self.log("provider", *args, **kwargs)

    def worker(self, *args, **kwargs):
        self.log("worker", *args, **kwargs)


_SHARED = DebugLogger()


def get_global_debug_logger() -> DebugLogger:
    """Return the shared debug logger (singleton)."""
    return _SHARED


def debug_log(category: str, *args, **kwargs) -> None:
    """Convenience function for debug logging."""
    _SHARED.log(category, *args, **kwargs)


def load_global_debug_from_env(env_value: Optional[str] = None) -> Dict[str, bool]:
    """Merge ``PIXSIM_WORKER_DEBUG`` categories into the domain config.

    Format (comma-separated):
        PIXSIM_WORKER_DEBUG=generation,provider,worker

    Each listed category is set to DEBUG level in the in-memory domain config
    if not already configured. Returns the parsed flags dict for callers that
    want to log what was set.
    """
    value = env_value if env_value is not None else os.getenv("PIXSIM_WORKER_DEBUG", "")
    flags: Dict[str, bool] = {}

    if value:
        for part in value.split(","):
            key = part.strip().lower()
            if key:
                flags[key] = True

    if flags:
        current = get_domain_config_display()
        merged = {**current}
        for category in flags:
            if category not in merged:
                merged[category] = "DEBUG"
        update_domain_config(merged)

    return flags
