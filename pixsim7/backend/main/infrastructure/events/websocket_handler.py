"""
WebSocket event handler - broadcasts events to connected clients

Listens to event bus and broadcasts relevant events via WebSocket.
"""
from pixsim7.backend.main.infrastructure.events.bus import event_bus, Event
from pixsim7.backend.main.infrastructure.websocket import connection_manager
import logging

logger = logging.getLogger(__name__)


async def broadcast_generation_event(event: Event):
    """
    Broadcast generation events to WebSocket clients

    Sends to:
    - Specific user (generation owner)
    - All connected clients (for admin monitoring)
    """
    event_data = event.data

    # Build WebSocket message
    message = {
        "type": event.event_type,
        "generation_id": event_data.get("generation_id") or event_data.get("job_id"),
        "status": event_data.get("status"),
        "user_id": event_data.get("user_id"),
        "data": event_data,
        "timestamp": event.timestamp.isoformat(),
    }

    # Broadcast to all connected clients
    # NOTE: Currently WebSocket auth is not implemented, so user_id is hardcoded.
    # Once proper auth is added, we can use broadcast_to_user() for filtering.
    await connection_manager.broadcast(message)
    logger.debug(f"Broadcast {event.event_type} to all clients (gen_id={message.get('generation_id')})")


def register_websocket_handlers():
    """
    Register WebSocket broadcast handlers for all relevant events

    Call this during app startup to enable WebSocket broadcasts.
    """
    # Generation events
    event_bus.subscribe("job:created", broadcast_generation_event)
    event_bus.subscribe("job:started", broadcast_generation_event)
    event_bus.subscribe("job:completed", broadcast_generation_event)
    event_bus.subscribe("job:failed", broadcast_generation_event)
    event_bus.subscribe("job:cancelled", broadcast_generation_event)

    logger.info("WebSocket event handlers registered")
