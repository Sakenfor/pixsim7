"""
Debug logging utilities

Provides conditional debug logging based on user preferences.
Debug flags are stored in user.preferences['debug'] dict.

Uses pixsim_logging for consistent log formatting.
"""
from typing import Optional, Any

from pixsim_logging import get_logger

logger = get_logger("debug")


class DebugLogger:
    """
    Conditional debug logger that checks user preferences.

    Usage:
        debug = DebugLogger(user)
        debug.log('generation', 'Dedup hash:', hash_value)
        debug.log('provider', 'API response:', response)
    """

    def __init__(self, user: Optional[Any] = None, preferences: Optional[dict] = None):
        """
        Initialize with user or preferences dict.

        Args:
            user: User object with preferences attribute
            preferences: Direct preferences dict (alternative to user)
        """
        self._debug_flags: dict = {}

        if preferences:
            self._debug_flags = preferences.get('debug', {})
        elif user and hasattr(user, 'preferences'):
            prefs = user.preferences or {}
            self._debug_flags = prefs.get('debug', {})

    def is_enabled(self, category: str) -> bool:
        """Check if debug is enabled for a category."""
        return bool(self._debug_flags.get(category, False))

    def log(self, category: str, *args, **kwargs):
        """Log if category is enabled."""
        if self.is_enabled(category):
            message = ' '.join(str(arg) for arg in args)
            # Use pixsim_logging with structured fields
            logger.debug(
                f"debug:{category}",
                msg=message,
                category=category,
                **kwargs
            )

    def generation(self, *args, **kwargs):
        """Shortcut for generation debug logs."""
        self.log('generation', *args, **kwargs)

    def provider(self, *args, **kwargs):
        """Shortcut for provider debug logs."""
        self.log('provider', *args, **kwargs)

    def worker(self, *args, **kwargs):
        """Shortcut for worker debug logs."""
        self.log('worker', *args, **kwargs)


# Global debug logger for cases where user context isn't available
# Can be updated via set_global_debug_flags()
_global_debug_flags: dict = {}


def set_global_debug_flags(flags: dict):
    """Set global debug flags (for worker processes without user context)."""
    global _global_debug_flags
    _global_debug_flags = flags


def get_global_debug_logger() -> DebugLogger:
    """Get a debug logger using global flags."""
    return DebugLogger(preferences={'debug': _global_debug_flags})


def debug_log(category: str, *args, user: Optional[Any] = None, **kwargs):
    """
    Convenience function for debug logging.

    Uses user preferences if provided, otherwise falls back to global flags.

    Args:
        category: Debug category ('generation', 'provider', 'worker')
        *args: Message parts
        user: Optional user object for per-user debug settings
        **kwargs: Additional key-value pairs to log
    """
    if user:
        debug = DebugLogger(user)
    else:
        debug = get_global_debug_logger()

    debug.log(category, *args, **kwargs)
