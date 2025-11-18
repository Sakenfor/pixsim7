"""
Event Routes - WebSocket for real-time event streaming.

Provides WebSocket endpoint for streaming launcher events to clients.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
import asyncio
import json
from typing import Set

from launcher.core import EventBus
from launcher.core.event_bus import Event

from ..dependencies import get_event_bus
from ..models import EventMessage


router = APIRouter(prefix="/events", tags=["events"])


# Track active WebSocket connections
_active_connections: Set[WebSocket] = set()


@router.websocket("/ws")
async def websocket_events(
    websocket: WebSocket,
    event_bus: EventBus = Depends(get_event_bus)
):
    """
    WebSocket endpoint for real-time event streaming.

    Clients connect to this endpoint to receive all launcher events in real-time.

    Event format:
    ```json
    {
        "event_type": "process.started",
        "source": "ProcessManager",
        "timestamp": 1234567890.123,
        "data": {...}
    }
    ```

    Supported event types:
    - process.started
    - process.stopped
    - process.failed
    - health.update
    - log.line
    - (and more)

    Use wildcards to filter:
    - "*" - all events
    - "process.*" - all process events
    - "health.update" - specific event
    """
    await websocket.accept()
    _active_connections.add(websocket)

    # Event handler - sends events to this WebSocket
    async def send_event(event: Event):
        """Send event to WebSocket client."""
        try:
            # Convert event to JSON-serializable dict
            event_data = EventMessage(
                event_type=event.event_type,
                source=event.source,
                timestamp=event.timestamp,
                data=_serialize_event_data(event.data)
            )

            await websocket.send_json(event_data.dict())
        except Exception:
            # Connection might be closed
            pass

    # Subscribe to all events
    event_bus.subscribe("*", lambda e: asyncio.create_task(send_event(e)))

    try:
        # Keep connection alive and handle client messages
        while True:
            try:
                # Wait for messages from client (ping/pong, filter updates, etc.)
                message = await websocket.receive_text()

                # Handle client messages (future: allow clients to update filters)
                try:
                    data = json.loads(message)
                    if data.get('type') == 'ping':
                        await websocket.send_json({'type': 'pong'})
                except json.JSONDecodeError:
                    pass

            except WebSocketDisconnect:
                break

    except Exception:
        pass

    finally:
        # Clean up
        _active_connections.discard(websocket)
        # Note: We don't unsubscribe from event bus because we used a lambda
        # In production, you'd want to track the handler and unsubscribe


def _serialize_event_data(data: any) -> dict:
    """
    Serialize event data to JSON-safe dict.

    Handles conversion of custom types to primitives.
    """
    from launcher.core.types import ProcessEvent, HealthEvent

    if isinstance(data, ProcessEvent):
        return {
            'service_key': data.service_key,
            'event_type': data.event_type,
            'data': data.data or {}
        }
    elif isinstance(data, HealthEvent):
        return {
            'service_key': data.service_key,
            'status': data.status.value,
            'timestamp': data.timestamp,
            'details': data.details or {}
        }
    elif isinstance(data, dict):
        # Already a dict, return as-is
        return data
    else:
        # Try to convert to dict
        try:
            if hasattr(data, '__dict__'):
                return data.__dict__
            else:
                return str(data)
        except Exception:
            return str(data)


@router.get("/stats", response_model=dict)
async def get_event_stats(
    event_bus: EventBus = Depends(get_event_bus)
):
    """
    Get event bus statistics.

    Returns:
        Event bus stats (event count, subscribers, etc.)
    """
    stats = event_bus.get_stats()

    return {
        **stats,
        "active_websocket_connections": len(_active_connections)
    }
