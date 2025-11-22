"""
Event Metrics Handler Plugin

Tracks event counts and patterns for monitoring and analytics.
Auto-discovered and registered via event handler plugin system.
"""

from typing import Dict
from collections import defaultdict
from datetime import datetime
from pydantic import BaseModel

from pixsim7.backend.main.infrastructure.events.bus import Event
from pixsim7.backend.main.shared.logging import get_event_logger


# ===== HANDLER MANIFEST =====

class EventHandlerManifest(BaseModel):
    """Manifest for event handler plugins"""
    id: str
    name: str
    version: str
    description: str
    author: str
    enabled: bool = True
    subscribe_to: str = "*"  # Event pattern to subscribe to ("*" for all events)


manifest = EventHandlerManifest(
    id="metrics",
    name="Event Metrics Tracker",
    version="1.0.0",
    description="Tracks event counts, first/last seen timestamps, and generates statistics for monitoring",
    author="PixSim Team",
    enabled=True,
    subscribe_to="*",  # Subscribe to all events
)


# ===== EVENT HANDLER =====

class EventMetrics:
    """
    Track event counts and patterns for monitoring

    Useful for:
    - Admin dashboard (show event counts)
    - Health monitoring (detect anomalies)
    - Analytics (user activity patterns)
    """

    def __init__(self):
        self.counts: Dict[str, int] = defaultdict(int)
        self.first_seen: Dict[str, datetime] = {}
        self.last_seen: Dict[str, datetime] = {}
        self.logger = configure_logging("event_handler.metrics")

    async def track_event(self, event: Event) -> None:
        """Track event occurrence"""
        event_type = event.event_type

        # Increment counter
        self.counts[event_type] += 1

        # Track first/last seen
        if event_type not in self.first_seen:
            self.first_seen[event_type] = event.timestamp
        self.last_seen[event_type] = event.timestamp

        # Log milestone counts (every 100th event)
        count = self.counts[event_type]
        if count % 100 == 0:
            self.logger.info(
                "event_milestone",
                event_type=event_type,
                count=count,
                first_seen=self.first_seen[event_type].isoformat(),
            )

    def get_stats(self) -> Dict[str, any]:
        """Get current metrics"""
        return {
            "total_events": sum(self.counts.values()),
            "by_type": dict(self.counts),
            "unique_types": len(self.counts),
        }


# Create handler instance
handler = EventMetrics()


# ===== LIFECYCLE HOOKS =====

def on_register():
    """Called when handler is registered"""
    logger = configure_logging("event_handler.metrics")
    logger.info("Event metrics tracker registered")


def on_unregister():
    """Called when handler is unregistered"""
    logger = configure_logging("event_handler.metrics")
    logger.info("Event metrics tracker unregistered")


# ===== EXPORTED HANDLER FUNCTION =====

async def handle_event(event: Event) -> None:
    """
    Main entry point for event handling
    This function is called by the event bus
    """
    await handler.track_event(event)


# ===== UTILITY FUNCTIONS =====

def get_metrics() -> EventMetrics:
    """Get the handler instance for accessing metrics"""
    return handler
