"""
Logging facade for backend modules, event handlers, and plugins.

Provides a stable interface for obtaining loggers, hiding underlying
changes to the pixsim_logging package structure.

Usage:
    from pixsim7.backend.main.shared.logging import get_backend_logger

    logger = get_backend_logger("events.auto_retry")
    logger.info("Event handled", event_type="job:failed")
"""
from typing import Any
from pixsim_logging import configure_logging, get_logger as _get_logger


def get_backend_logger(service_name: str = None) -> Any:
    """
    Get a logger for backend code, event handlers, or plugins.

    This is a thin facade over pixsim_logging that provides a stable
    interface. If the underlying logging implementation changes, only
    this facade needs to be updated, not all event handlers and plugins.

    Args:
        service_name: Optional service name for the logger.
                     If provided, configures a named logger.
                     If None, returns the default logger.

    Returns:
        Logger instance with standard logging methods (info, error, etc.)

    Examples:
        # For event handlers
        logger = get_backend_logger("events.auto_retry")

        # For plugins
        logger = get_backend_logger("plugin.game-dialogue")

        # For services (though services should use pixsim_logging directly)
        logger = get_backend_logger("service.asset")

        # Default logger (not recommended, prefer named loggers)
        logger = get_backend_logger()
    """
    if service_name:
        return configure_logging(service_name)
    else:
        return _get_logger()


def get_event_logger(handler_name: str) -> Any:
    """
    Get a logger for an event handler.

    Convenience wrapper around get_backend_logger that uses a
    consistent naming convention for event handlers.

    Args:
        handler_name: Event handler name (e.g., "auto_retry", "webhooks")

    Returns:
        Logger instance

    Example:
        logger = get_event_logger("auto_retry")
        logger.info("Retrying job", job_id=123)
    """
    return get_backend_logger(f"events.{handler_name}")


def get_plugin_logger(plugin_id: str) -> Any:
    """
    Get a logger for a plugin.

    Convenience wrapper around get_backend_logger that uses a
    consistent naming convention for plugins.

    Args:
        plugin_id: Plugin ID (e.g., "game-dialogue", "game-npcs")

    Returns:
        Logger instance

    Example:
        logger = get_plugin_logger("game-dialogue")
        logger.info("Plugin initialized")
    """
    return get_backend_logger(f"plugin.{plugin_id}")


__all__ = [
    "get_backend_logger",
    "get_event_logger",
    "get_plugin_logger",
]
