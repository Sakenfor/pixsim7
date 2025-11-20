"""
Event handlers for cross-cutting concerns

Auto-discovers and registers event handler plugins from event_handlers/ directory.

Handler plugins can subscribe to specific event types or all events ("*").
Examples: metrics tracking, webhooks, analytics, notifications, audit trail.

Note: This is separate from pixsim_logging which handles structured logging.
Event handlers are for reacting to domain events (metrics, webhooks, side effects).
"""
from typing import Dict
import os
import importlib

from pixsim7.backend.main.infrastructure.events.bus import event_bus, Event
from pixsim_logging import configure_logging

logger = configure_logging("events")


# ===== AUTO-DISCOVER EVENT HANDLERS =====

def discover_event_handlers(handlers_dir: str = "pixsim7/backend/main/event_handlers") -> list[str]:
    """
    Discover event handler plugins by scanning event_handlers directory

    Args:
        handlers_dir: Path to event handlers directory

    Returns:
        List of discovered handler IDs
    """
    discovered = []

    if not os.path.exists(handlers_dir):
        logger.warning(f"Event handlers directory not found: {handlers_dir}")
        return discovered

    # Scan for handler directories
    for item in os.listdir(handlers_dir):
        handler_path = os.path.join(handlers_dir, item)

        # Skip if not a directory
        if not os.path.isdir(handler_path):
            continue

        # Skip __pycache__ and hidden directories
        if item.startswith('_') or item.startswith('.'):
            continue

        # Check for manifest.py
        manifest_path = os.path.join(handler_path, "manifest.py")
        if not os.path.exists(manifest_path):
            logger.debug(f"Skipping {item} - no manifest.py found")
            continue

        discovered.append(item)

    logger.info(f"Discovered {len(discovered)} event handler plugins: {discovered}")
    return discovered


def load_event_handler_plugin(handler_name: str, handlers_dir: str = "pixsim7/backend/main/event_handlers") -> bool:
    """
    Load and register an event handler plugin

    Args:
        handler_name: Handler directory name
        handlers_dir: Path to handlers directory

    Returns:
        True if loaded successfully, False otherwise
    """
    try:
        # Build module path
        module_path = f"{handlers_dir.replace('/', '.')}.{handler_name}.manifest"

        # Import manifest module
        module = importlib.import_module(module_path)

        # Get handler function and manifest
        handle_event = getattr(module, 'handle_event', None)
        manifest = getattr(module, 'manifest', None)

        if not handle_event:
            logger.error(f"Event handler plugin {handler_name} has no 'handle_event' function")
            return False

        if not manifest:
            logger.warning(f"Event handler plugin {handler_name} has no manifest")

        # Check if enabled
        if manifest and hasattr(manifest, 'enabled') and not manifest.enabled:
            logger.info(f"Event handler plugin {handler_name} is disabled, skipping")
            return False

        # Get subscribe pattern (default to all events)
        subscribe_to = "*"
        if manifest and hasattr(manifest, 'subscribe_to'):
            subscribe_to = manifest.subscribe_to

        # Subscribe handler to events
        event_bus.subscribe(subscribe_to, handle_event)

        # Call on_register hook if exists
        on_register = getattr(module, 'on_register', None)
        if callable(on_register):
            on_register()

        logger.info(f"✅ Registered event handler: {handler_name} (subscribes to: {subscribe_to})")
        return True

    except Exception as e:
        logger.error(f"Failed to load event handler plugin {handler_name}: {e}", exc_info=True)
        return False


def register_handlers_from_plugins(handlers_dir: str = "pixsim7/backend/main/event_handlers") -> int:
    """
    Auto-discover and register all event handler plugins

    Args:
        handlers_dir: Path to event handlers directory

    Returns:
        Number of handlers registered
    """
    discovered = discover_event_handlers(handlers_dir)

    registered_count = 0
    for handler_name in discovered:
        if load_event_handler_plugin(handler_name, handlers_dir):
            registered_count += 1

    logger.info(f"✅ Registered {registered_count} event handler plugins")
    return registered_count


# ===== LEGACY HANDLER REGISTRATION (Deprecated) =====

def register_handlers() -> None:
    """
    Register all event handlers (DEPRECATED - use register_handlers_from_plugins)

    This function is kept for backward compatibility but now uses auto-discovery.
    Called during application startup (main.py lifespan).
    """
    logger.info("Registering event handlers...")

    # Use auto-discovery instead of manual registration
    register_handlers_from_plugins()

    logger.info(f"Event handlers registered: {len(event_bus._handlers)} event types")

    # Legacy code (commented out - now handled by plugin system):
    # event_bus.subscribe("*", _event_metrics.track_event)
    # event_bus.subscribe("*", dispatch_webhooks)


# ===== UTILITY FUNCTIONS =====

def get_handler_stats() -> Dict[str, any]:
    """
    Get statistics about registered handlers

    Useful for admin dashboard
    """
    # Try to get metrics from metrics plugin
    metrics_stats = {}
    try:
        from pixsim7.backend.main.event_handlers.metrics import get_metrics
        metrics_stats = get_metrics().get_stats()
    except Exception:
        pass

    return {
        "registered_event_types": len(event_bus._handlers),
        "wildcard_handlers": len(event_bus._wildcard_handlers),
        "event_metrics": metrics_stats,
    }


# ===== LEGACY COMPATIBILITY EXPORTS =====

def get_event_metrics():
    """
    Legacy compatibility function

    Use event_handlers.metrics.get_metrics() instead
    """
    try:
        from pixsim7.backend.main.event_handlers.metrics import get_metrics
        return get_metrics()
    except Exception:
        # Fallback if metrics plugin not loaded
        from collections import defaultdict
        from datetime import datetime

        class DummyMetrics:
            def __init__(self):
                self.counts = defaultdict(int)
                self.first_seen = {}
                self.last_seen = {}

            def get_stats(self):
                return {
                    "total_events": 0,
                    "by_type": {},
                    "unique_types": 0,
                }

        return DummyMetrics()
