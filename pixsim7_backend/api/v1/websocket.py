"""
WebSocket endpoints for real-time updates

Provides WebSocket connections for generation status updates and other real-time events.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from pixsim7_backend.api.dependencies import CurrentUser, get_current_user_ws
from pixsim7_backend.infrastructure.websocket import connection_manager
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/generations")
async def websocket_generations(
    websocket: WebSocket,
    token: str = None,
):
    """
    WebSocket endpoint for real-time generation status updates

    Usage:
        Connect to: ws://host/api/v1/ws/generations?token=YOUR_JWT_TOKEN

    Messages sent to client:
        {
            "type": "generation:status",
            "generation_id": 123,
            "status": "processing",
            "user_id": 1,
            "data": {...}  // Full GenerationResponse
        }

    Auth:
        Pass JWT token as query parameter: ?token=YOUR_JWT_TOKEN
    """
    # Extract user from token
    # For now, accept without auth for simplicity (TODO: add proper auth)
    # In production, validate token and get user_id
    user_id = 1  # Placeholder - should come from JWT token validation

    try:
        await connection_manager.connect(websocket, user_id)

        # Send welcome message
        await connection_manager.send_personal_message(
            {
                "type": "connected",
                "message": "Connected to generation updates",
                "user_id": user_id,
            },
            websocket,
        )

        # Keep connection alive and handle incoming messages
        while True:
            # Wait for messages from client (ping/pong, etc.)
            data = await websocket.receive_text()

            # Handle ping/pong for keep-alive
            if data == "ping":
                await websocket.send_text("pong")

    except WebSocketDisconnect:
        connection_manager.disconnect(websocket, user_id)
        logger.info(f"WebSocket disconnected for user {user_id}")
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}", exc_info=True)
        connection_manager.disconnect(websocket, user_id)


@router.websocket("/ws/events")
async def websocket_events(
    websocket: WebSocket,
    token: str = None,
):
    """
    WebSocket endpoint for all real-time events

    More generic than /ws/generations - receives all event types.

    Messages sent to client:
        {
            "type": "job:created" | "job:completed" | "asset:created" | ...,
            "data": {...}
        }
    """
    user_id = 1  # Placeholder

    try:
        await connection_manager.connect(websocket, user_id)

        await connection_manager.send_personal_message(
            {
                "type": "connected",
                "message": "Connected to event stream",
                "user_id": user_id,
            },
            websocket,
        )

        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")

    except WebSocketDisconnect:
        connection_manager.disconnect(websocket, user_id)
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}", exc_info=True)
        connection_manager.disconnect(websocket, user_id)
