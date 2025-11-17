"""
Event Bus - Pub/sub event system for decoupled communication.

Provides a central event bus that managers can publish to and
UIs can subscribe to, completely decoupling managers from UI code.
"""

import threading
from typing import Dict, List, Callable, Optional, Any
from dataclasses import dataclass
from datetime import datetime


@dataclass
class Event:
    """
    Base event class.

    All events published to the bus should inherit from or use this.
    """
    event_type: str  # Type of event (e.g., "process.started", "health.update")
    source: str  # Source of event (e.g., "ProcessManager", "HealthManager")
    timestamp: float  # Unix timestamp when event was created
    data: Any  # Event-specific data

    @classmethod
    def create(cls, event_type: str, source: str, data: Any = None) -> 'Event':
        """Factory method to create event with current timestamp."""
        return cls(
            event_type=event_type,
            source=source,
            timestamp=datetime.now().timestamp(),
            data=data
        )


class EventBus:
    """
    Thread-safe pub/sub event bus.

    Allows decoupled communication between components:
    - Managers publish events
    - UIs subscribe to events
    - No direct dependencies between them

    Features:
    - Thread-safe
    - Multiple subscribers per event type
    - Wildcard subscriptions (e.g., "process.*")
    - Event filtering
    - Error isolation (one subscriber error doesn't break others)
    """

    def __init__(self):
        """Initialize the event bus."""
        self._subscribers: Dict[str, List[Callable]] = {}
        self._lock = threading.RLock()
        self._event_count = 0
        self._error_count = 0

    def subscribe(self, event_type: str, handler: Callable[[Event], None]):
        """
        Subscribe to an event type.

        Args:
            event_type: Event type to subscribe to (e.g., "process.started")
                       Supports wildcards: "process.*" matches all process events
            handler: Callback function that receives Event objects
        """
        with self._lock:
            if event_type not in self._subscribers:
                self._subscribers[event_type] = []
            if handler not in self._subscribers[event_type]:
                self._subscribers[event_type].append(handler)

    def unsubscribe(self, event_type: str, handler: Callable[[Event], None]):
        """
        Unsubscribe from an event type.

        Args:
            event_type: Event type to unsubscribe from
            handler: Handler to remove
        """
        with self._lock:
            if event_type in self._subscribers:
                try:
                    self._subscribers[event_type].remove(handler)
                    # Clean up empty subscriber lists
                    if not self._subscribers[event_type]:
                        del self._subscribers[event_type]
                except ValueError:
                    pass  # Handler not in list

    def publish(self, event: Event):
        """
        Publish an event to all matching subscribers.

        Args:
            event: Event to publish

        Note:
            Errors in subscriber handlers are caught and logged, but don't
            prevent other handlers from running.
        """
        with self._lock:
            self._event_count += 1

            # Find matching subscribers
            handlers = []

            # Exact match
            if event.event_type in self._subscribers:
                handlers.extend(self._subscribers[event.event_type])

            # Wildcard match (e.g., "process.*" matches "process.started")
            for pattern, pattern_handlers in self._subscribers.items():
                if self._matches_pattern(event.event_type, pattern):
                    handlers.extend(pattern_handlers)

            # Remove duplicates while preserving order
            seen = set()
            unique_handlers = []
            for h in handlers:
                if h not in seen:
                    seen.add(h)
                    unique_handlers.append(h)

        # Call handlers outside the lock to avoid deadlock
        for handler in unique_handlers:
            try:
                handler(event)
            except Exception as e:
                self._error_count += 1
                # In production, you might want to log this
                # For now, silently catch to prevent one bad handler from breaking others
                pass

    def publish_simple(self, event_type: str, source: str, data: Any = None):
        """
        Convenience method to publish an event without creating Event object.

        Args:
            event_type: Type of event
            source: Source of event
            data: Optional event data
        """
        event = Event.create(event_type, source, data)
        self.publish(event)

    def clear(self, event_type: Optional[str] = None):
        """
        Clear subscribers.

        Args:
            event_type: If provided, clear only this event type.
                       If None, clear all subscribers.
        """
        with self._lock:
            if event_type is None:
                self._subscribers.clear()
            elif event_type in self._subscribers:
                del self._subscribers[event_type]

    def get_subscriber_count(self, event_type: Optional[str] = None) -> int:
        """
        Get number of subscribers.

        Args:
            event_type: If provided, count subscribers for this event type.
                       If None, count total subscribers across all types.

        Returns:
            Subscriber count
        """
        with self._lock:
            if event_type is None:
                return sum(len(handlers) for handlers in self._subscribers.values())
            else:
                return len(self._subscribers.get(event_type, []))

    def get_stats(self) -> Dict[str, Any]:
        """
        Get event bus statistics.

        Returns:
            Dictionary with stats (event_count, error_count, subscriber_count, etc.)
        """
        with self._lock:
            return {
                'event_count': self._event_count,
                'error_count': self._error_count,
                'subscriber_count': self.get_subscriber_count(),
                'event_types': list(self._subscribers.keys()),
            }

    @staticmethod
    def _matches_pattern(event_type: str, pattern: str) -> bool:
        """
        Check if event type matches a pattern.

        Args:
            event_type: Event type (e.g., "process.started")
            pattern: Pattern (e.g., "process.*", "*", "*.started")

        Returns:
            True if event_type matches pattern
        """
        # Exact match
        if event_type == pattern:
            return True

        # No wildcard in pattern
        if '*' not in pattern:
            return False

        # Wildcard match
        if pattern == '*':
            return True

        # Pattern like "process.*"
        if pattern.endswith('.*'):
            prefix = pattern[:-2]
            return event_type.startswith(prefix + '.')

        # Pattern like "*.started"
        if pattern.startswith('*.'):
            suffix = pattern[2:]
            return event_type.endswith('.' + suffix)

        return False


# Global event bus instance (singleton pattern)
_global_bus: Optional[EventBus] = None
_global_bus_lock = threading.Lock()


def get_event_bus() -> EventBus:
    """
    Get the global event bus instance.

    Returns:
        Global EventBus singleton
    """
    global _global_bus
    if _global_bus is None:
        with _global_bus_lock:
            if _global_bus is None:
                _global_bus = EventBus()
    return _global_bus


def reset_event_bus():
    """
    Reset the global event bus.

    Useful for testing to ensure clean state.
    """
    global _global_bus
    with _global_bus_lock:
        _global_bus = None


# Event type constants
class EventTypes:
    """Standard event type constants."""

    # Process events
    PROCESS_STARTED = "process.started"
    PROCESS_STOPPED = "process.stopped"
    PROCESS_FAILED = "process.failed"
    PROCESS_OUTPUT = "process.output"
    PROCESS_ERROR = "process.error"

    # Health events
    HEALTH_UPDATE = "health.update"
    HEALTH_CHECK_STARTED = "health.check_started"
    HEALTH_CHECK_COMPLETED = "health.check_completed"

    # Log events
    LOG_LINE = "log.line"
    LOG_CLEARED = "log.cleared"
    LOG_FILE_CREATED = "log.file_created"

    # Manager lifecycle events
    MANAGER_STARTED = "manager.started"
    MANAGER_STOPPED = "manager.stopped"
    MANAGER_ERROR = "manager.error"
