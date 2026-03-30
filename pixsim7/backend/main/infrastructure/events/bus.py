"""
Event bus for domain events

Simple in-memory event bus for Phase 1.
Phase 2 will add Redis-backed persistent events.
"""
from typing import Callable, Dict, List, Any, Awaitable, Optional
from dataclasses import dataclass, field
from datetime import datetime, timezone
import logging
import asyncio

logger = logging.getLogger(__name__)


@dataclass
class Event:
    """Base event class"""
    event_type: str
    data: Dict[str, Any]
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    event_id: str | None = None

    def __post_init__(self):
        if self.event_id is None:
            # Simple event ID generation
            self.event_id = f"{self.event_type}_{self.timestamp.timestamp()}"


# Type alias for event handlers
EventHandler = Callable[[Event], Any]


class EventBus:
    """
    Simple in-memory event bus

    Usage:
        # Register handler
        @event_bus.on("job:created")
        async def on_job_created(event: Event):
            print(f"Job created: {event.data['job_id']}")

        # Publish event
        await event_bus.publish("job:created", {"job_id": 123})
    """

    def __init__(self):
        self._handlers: Dict[str, List[EventHandler]] = {}
        self._wildcard_handlers: List[EventHandler] = []
        self._distributed_publisher: Optional[Callable[[Event], Awaitable[None]]] = None

    def on(self, event_type: str) -> Callable:
        """
        Decorator to register an event handler

        Usage:
            @event_bus.on("job:created")
            async def on_job_created(event: Event):
                ...
        """
        def decorator(handler: EventHandler) -> EventHandler:
            self.subscribe(event_type, handler)
            return handler
        return decorator

    def subscribe(self, event_type: str, handler: EventHandler) -> None:
        """
        Subscribe to an event

        Args:
            event_type: Event type (e.g., "job:created", "asset:downloaded")
            handler: Async function to call when event is published
        """
        if event_type == "*":
            self._wildcard_handlers.append(handler)
        else:
            if event_type not in self._handlers:
                self._handlers[event_type] = []
            self._handlers[event_type].append(handler)

        logger.debug(f"Subscribed to event: {event_type} -> {handler.__name__}")

    def unsubscribe(self, event_type: str, handler: EventHandler) -> None:
        """Unsubscribe from an event"""
        if event_type == "*":
            if handler in self._wildcard_handlers:
                self._wildcard_handlers.remove(handler)
        elif event_type in self._handlers:
            if handler in self._handlers[event_type]:
                self._handlers[event_type].remove(handler)

    async def publish(
        self,
        event_type: str,
        data: Dict[str, Any],
        wait: bool = False,
        strict: bool = False,
        event_id: str | None = None,
        timestamp: datetime | None = None,
        propagate: bool = True,
    ) -> None:
        """
        Publish an event

        Args:
            event_type: Event type (e.g., "job:created")
            data: Event data
            wait: If True, wait for all handlers to complete (default: False)
            strict: If True, raise error if event type not registered (default: False)

        Usage:
            await event_bus.publish("job:created", {"job_id": 123})

        Validation:
            If the event type is not registered in the event registry, a warning
            will be logged to help catch typos. Use register_event_type() to
            register your event types.
        """
        # Validate event type is registered (helps catch typos)
        if event_type not in _event_registry:
            message = (
                f"Publishing unregistered event type: '{event_type}'. "
                f"Consider calling register_event_type() to document this event. "
                f"This helps catch typos and improves discoverability."
            )
            if strict:
                raise ValueError(message)
            else:
                logger.warning(message)

        event = Event(event_type=event_type, data=data, event_id=event_id, timestamp=timestamp or datetime.now(timezone.utc))

        # Get handlers for this event type
        handlers = self._handlers.get(event_type, []) + self._wildcard_handlers

        if not handlers:
            logger.debug(f"No local handlers for event: {event_type}")
            # Don't return - still need to propagate to distributed publisher!
        else:
            logger.debug(f"Publishing event: {event_type} to {len(handlers)} handlers")

        # Execute local handlers (if any)
        tasks = []
        if handlers:
            for handler in handlers:
                try:
                    if asyncio.iscoroutinefunction(handler):
                        task = handler(event)
                        if wait:
                            await task
                        else:
                            tasks.append(asyncio.create_task(task))
                    else:
                        # Sync handler - run in executor
                        task = asyncio.get_event_loop().run_in_executor(
                            None, handler, event
                        )
                        if wait:
                            await task
                        else:
                            tasks.append(task)
                except Exception as e:
                    logger.error(
                        f"Error in event handler {handler.__name__} "
                        f"for {event_type}: {e}",
                        exc_info=True
                    )

            # If not waiting, just log task creation
            if not wait and tasks:
                logger.debug(f"Created {len(tasks)} background tasks for {event_type}")

        # Propagate to distributed publisher (e.g., Redis) if configured
        if propagate and self._distributed_publisher:
            try:
                await self._distributed_publisher(event)
            except Exception as e:
                logger.error(
                    "Distributed publish failed",
                    event_type=event_type,
                    error=str(e),
                )

    def set_distributed_publisher(self, publisher: Callable[[Event], Awaitable[None]]) -> None:
        """Register a distributed publisher (e.g., Redis bridge)"""
        self._distributed_publisher = publisher

    def clear_distributed_publisher(self, publisher: Optional[Callable[[Event], Awaitable[None]]] = None) -> None:
        """Clear distributed publisher if it matches"""
        if publisher is None or self._distributed_publisher == publisher:
            self._distributed_publisher = None

    def clear(self) -> None:
        """Clear all handlers (useful for testing)"""
        self._handlers.clear()
        self._wildcard_handlers.clear()


# Global event bus instance
event_bus = EventBus()


# ===== EVENT REGISTRY =====
# Services can register their event types here for documentation/discovery
# This is optional - services can emit events without registration

_event_registry: Dict[str, Dict[str, Any]] = {}


def register_event_type(
    event_type: str,
    description: str | None = None,
    payload_schema: Dict[str, Any] | None = None,
    source: str | None = None
) -> str:
    """
    Register an event type for documentation and discovery.

    Returns the event_type string so it can double as the constant definition:

        JOB_CREATED = register_event_type("job:created")

    Args:
        event_type: Event type string (e.g., "game:entity_moved")
        description: Human-readable description (defaults to event_type)
        payload_schema: Optional dict describing expected payload fields
        source: Optional source module/service name
    """
    _event_registry[event_type] = {
        "description": description or event_type,
        "payload_schema": payload_schema or {},
        "source": source
    }
    logger.debug(f"Registered event type: {event_type}")
    return event_type


def get_registered_events() -> Dict[str, Dict[str, Any]]:
    """Get all registered event types (for documentation/tooling)"""
    return _event_registry.copy()


