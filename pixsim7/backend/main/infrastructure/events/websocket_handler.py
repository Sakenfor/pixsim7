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
    logger.info(
        "[WebSocket] Broadcasting event to clients",
        extra={
            "event_type": event.event_type,
            "generation_id": message.get('generation_id'),
            "client_count": len(connection_manager._all_connections),
            "event_id": event.event_id
        }
    )
    await connection_manager.broadcast(message)
    logger.info(
        "[WebSocket] Broadcast complete",
        extra={"event_type": event.event_type, "generation_id": message.get('generation_id')}
    )


def register_websocket_handlers():
    """
    Register WebSocket broadcast handlers for all relevant events

    Call this during app startup to enable WebSocket broadcasts.
    """
    # Generation events
    logger.info("[WebSocket] Registering WebSocket event handlers...")
    event_bus.subscribe("job:created", broadcast_generation_event)
    event_bus.subscribe("job:started", broadcast_generation_event)
    event_bus.subscribe("job:completed", broadcast_generation_event)
    event_bus.subscribe("job:failed", broadcast_generation_event)
    event_bus.subscribe("job:cancelled", broadcast_generation_event)

    logger.info("[WebSocket] Event handlers registered for: job:created, job:started, job:completed, job:failed, job:cancelled")

    # Log the event bus state
    logger.info(f"[WebSocket] Event bus has {len(event_bus._handlers)} event types with subscribers")
