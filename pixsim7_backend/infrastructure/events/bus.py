"""
Event bus for domain events

Simple in-memory event bus for Phase 1.
Phase 2 will add Redis-backed persistent events.
"""
from typing import Callable, Dict, List, Any
from dataclasses import dataclass, field
from datetime import datetime
import logging
import asyncio

logger = logging.getLogger(__name__)


@dataclass
class Event:
    """Base event class"""
    event_type: str
    data: Dict[str, Any]
    timestamp: datetime = field(default_factory=datetime.utcnow)
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
        wait: bool = False
    ) -> None:
        """
        Publish an event

        Args:
            event_type: Event type (e.g., "job:created")
            data: Event data
            wait: If True, wait for all handlers to complete (default: False)

        Usage:
            await event_bus.publish("job:created", {"job_id": 123})
        """
        event = Event(event_type=event_type, data=data)

        # Get handlers for this event type
        handlers = self._handlers.get(event_type, []) + self._wildcard_handlers

        if not handlers:
            logger.debug(f"No handlers for event: {event_type}")
            return

        logger.info(f"Publishing event: {event_type} to {len(handlers)} handlers")

        # Execute handlers
        tasks = []
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

    def clear(self) -> None:
        """Clear all handlers (useful for testing)"""
        self._handlers.clear()
        self._wildcard_handlers.clear()


# Global event bus instance
event_bus = EventBus()


# ===== COMMON EVENT TYPES =====

# Job events
JOB_CREATED = "job:created"
JOB_STARTED = "job:started"
JOB_COMPLETED = "job:completed"
JOB_FAILED = "job:failed"
JOB_CANCELLED = "job:cancelled"

# Asset events
ASSET_CREATED = "asset:created"
ASSET_DOWNLOADED = "asset:downloaded"
ASSET_DOWNLOAD_FAILED = "asset:download_failed"

# Provider events
PROVIDER_SUBMITTED = "provider:submitted"
PROVIDER_COMPLETED = "provider:completed"
PROVIDER_FAILED = "provider:failed"

# Account events
ACCOUNT_SELECTED = "account:selected"
ACCOUNT_EXHAUSTED = "account:exhausted"
ACCOUNT_ERROR = "account:error"

# Scene events (Phase 2)
SCENE_CREATED = "scene:created"
SCENE_UPDATED = "scene:updated"
