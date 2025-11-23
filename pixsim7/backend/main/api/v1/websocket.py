"""
WebSocket endpoints for real-time updates

Provides WebSocket connections for generation status updates and other real-time events.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from pixsim7.backend.main.api.dependencies import CurrentUser, get_current_user_ws
from pixsim7.backend.main.infrastructure.websocket import connection_manager
from pixsim7.backend.main.infrastructure.websocket.types import ConnectedMessage, is_keep_alive
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

        # Send welcome message using typed envelope
        welcome = ConnectedMessage(
            type="connected",
            message="Connected to generation updates",
            user_id=user_id,
        )
        await connection_manager.send_personal_message(
            welcome.model_dump(),
            websocket,
        )

        # Keep connection alive and handle incoming messages
        while True:
            # Wait for messages from client (ping/pong, etc.)
            data = await websocket.receive_text()

            # Handle ping/pong for keep-alive (plain text, not JSON)
            if is_keep_alive(data):
                if data == "ping":
                    await websocket.send_text("pong")
                continue

            # All other messages should be JSON with envelope structure
            # (Add custom message handling here if needed)

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

        # Send welcome message using typed envelope
        welcome = ConnectedMessage(
            type="connected",
            message="Connected to event stream",
            user_id=user_id,
        )
        await connection_manager.send_personal_message(
            welcome.model_dump(),
            websocket,
        )

        while True:
            data = await websocket.receive_text()

            # Handle ping/pong for keep-alive (plain text, not JSON)
            if is_keep_alive(data):
                if data == "ping":
                    await websocket.send_text("pong")
                continue

            # All other messages should be JSON with envelope structure
            # (Add custom message handling here if needed)

    except WebSocketDisconnect:
        connection_manager.disconnect(websocket, user_id)
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}", exc_info=True)
        connection_manager.disconnect(websocket, user_id)


@router.websocket("/ws/jobs")
async def websocket_jobs(
    websocket: WebSocket,
    token: str = None,
):
    """
    WebSocket endpoint for real-time job feed updates

    Provides live updates about:
    - Generation jobs (created, processing, completed, failed)
    - Asset processing jobs
    - Upload jobs
    - Other background tasks

    Usage:
        Connect to: ws://host/api/v1/ws/jobs?token=YOUR_JWT_TOKEN

    Messages sent to client:
        {
            "type": "job:created" | "job:updated" | "job:completed" | "job:failed",
            "job_id": 123,
            "job_type": "generation" | "upload" | "processing",
            "status": "pending" | "processing" | "completed" | "failed",
            "progress": 0.5,  // 0.0 to 1.0
            "data": {...}  // Job-specific data
        }

    Auth:
        Pass JWT token as query parameter: ?token=YOUR_JWT_TOKEN
    """
    user_id = 1  # Placeholder - should come from JWT token validation

    try:
        await connection_manager.connect(websocket, user_id)

        # Send welcome message
        welcome = ConnectedMessage(
            type="connected",
            message="Connected to jobs feed",
            user_id=user_id,
        )
        await connection_manager.send_personal_message(
            welcome.model_dump(),
            websocket,
        )

        # Keep connection alive and handle incoming messages
        while True:
            data = await websocket.receive_text()

            # Handle ping/pong for keep-alive
            if is_keep_alive(data):
                if data == "ping":
                    await websocket.send_text("pong")
                continue

            # Handle other messages if needed

    except WebSocketDisconnect:
        connection_manager.disconnect(websocket, user_id)
        logger.info(f"Jobs WebSocket disconnected for user {user_id}")
    except Exception as e:
        logger.error(f"Jobs WebSocket error for user {user_id}: {e}", exc_info=True)
        connection_manager.disconnect(websocket, user_id)
