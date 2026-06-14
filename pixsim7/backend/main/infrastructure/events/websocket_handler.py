"""
WebSocket event handler - broadcasts events to connected clients

Listens to event bus and broadcasts relevant events via WebSocket.
"""
from pixsim7.backend.main.infrastructure.events.bus import event_bus, Event
from pixsim7.backend.main.infrastructure.websocket import connection_manager
from pixsim_logging import configure_logging

logger = configure_logging("websocket_handler").bind(domain="websocket")


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
        "Broadcasting event to clients",
        extra={
            "event_type": event.event_type,
            "generation_id": message.get('generation_id'),
            "client_count": len(connection_manager._all_connections),
            "event_id": event.event_id
        }
    )
    await connection_manager.broadcast(message)


async def broadcast_bridge_event(event: Event):
    """Broadcast bridge status changes to all connected WS clients.

    The frontend bridgeStatusStore consumes this to skip its 15s polling
    heartbeat when a fresh status arrives via WS.
    """
    event_data = event.data
    message = {
        "type": event.event_type,
        "data": event_data,
        "timestamp": event.timestamp.isoformat(),
    }
    logger.info(
        "Broadcasting bridge event to clients",
        extra={
            "event_type": event.event_type,
            "connected": event_data.get("connected"),
            "reason": event_data.get("reason"),
            "client_count": len(connection_manager._all_connections),
            "event_id": event.event_id,
        },
    )
    await connection_manager.broadcast(message)


async def broadcast_asset_event(event: Event):
    """
    Broadcast asset events to WebSocket clients

    Sends asset creation/deletion events to all connected clients
    for real-time gallery updates.
    """
    event_data = event.data

    # Build WebSocket message
    message = {
        "type": event.event_type,
        "asset_id": event_data.get("asset_id"),
        "user_id": event_data.get("user_id"),
        "media_type": event_data.get("media_type"),
        "data": event_data,
        "timestamp": event.timestamp.isoformat(),
    }

    # Broadcast to all connected clients
    logger.info(
        "Broadcasting asset event to clients",
        extra={
            "event_type": event.event_type,
            "asset_id": message.get('asset_id'),
            "client_count": len(connection_manager._all_connections),
            "event_id": event.event_id
        }
    )
    await connection_manager.broadcast(message)


def register_websocket_handlers():
    """
    Register WebSocket broadcast handlers for all relevant events

    Call this during app startup to enable WebSocket broadcasts.
    """
    # Generation/Job events
    logger.info("Registering WebSocket event handlers...")
    event_bus.subscribe("job:created", broadcast_generation_event)
    event_bus.subscribe("job:started", broadcast_generation_event)
    event_bus.subscribe("job:completed", broadcast_generation_event)
    event_bus.subscribe("job:failed", broadcast_generation_event)
    event_bus.subscribe("job:cancelled", broadcast_generation_event)
    event_bus.subscribe("job:paused", broadcast_generation_event)
    event_bus.subscribe("job:resumed", broadcast_generation_event)
    event_bus.subscribe("job:retrying", broadcast_generation_event)

    # Asset events
    event_bus.subscribe("asset:created", broadcast_asset_event)
    event_bus.subscribe("asset:updated", broadcast_asset_event)
    event_bus.subscribe("asset:deleted", broadcast_asset_event)

    # Bridge connectivity events — push status changes to the frontend
    # bridgeStatusStore so it doesn't have to wait for its 15s poll.
    event_bus.subscribe("bridge:status_changed", broadcast_bridge_event)

    logger.info("Event handlers registered for: job:*, asset:*, bridge:*")

    # Log the event bus state
    logger.info(f"Event bus has {len(event_bus._handlers)} event types with subscribers")
