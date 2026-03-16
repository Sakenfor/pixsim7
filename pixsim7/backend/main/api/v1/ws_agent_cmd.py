"""
WebSocket endpoint for remote agent command bridge.

Supports both authenticated (user-scoped) and unauthenticated (shared/admin) connections.

Protocol:
    Connect:
        ws://host/api/v1/ws/agent-cmd?agent_type=claude-cli
        ws://host/api/v1/ws/agent-cmd?agent_type=claude-cli&token=JWT_TOKEN  (user-scoped)

    Server -> Client:
        {"type": "connected", "agent_id": "...", "user_id": ..., "message": "..."}
        {"type": "task", "task_id": "...", "task": "edit_prompt", ...}
        {"type": "ping"}

    Client -> Server:
        {"type": "result", "task_id": "...", "edited_prompt": "..."}
        {"type": "error", "task_id": "...", "error": "..."}
        {"type": "heartbeat", "status": "...", "action": "...", "detail": "..."}
        {"type": "pong"}
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge
from pixsim_logging import get_logger

logger = get_logger()

router = APIRouter()


async def _resolve_user_id(token: str | None) -> int | None:
    """Resolve user ID from JWT token, returns None if no token or invalid."""
    if not token:
        return None
    try:
        from pixsim7.backend.main.api.dependencies import get_auth_service
        auth_service = get_auth_service()
        user = await auth_service.verify_token(token)
        return user.id if user else None
    except Exception:
        return None


@router.websocket("/ws/agent-cmd")
async def agent_cmd_websocket(
    websocket: WebSocket,
    agent_type: str = "claude-cli",
    agent_id: str = None,
    token: str = None,
):
    """
    WebSocket for remote agent command execution.

    Connect:
        ws://host/api/v1/ws/agent-cmd?agent_type=claude-cli
        ws://host/api/v1/ws/agent-cmd?token=JWT_TOKEN  (user-scoped bridge)

    Without token: shared/admin bridge (serves any user as fallback).
    With token: user-scoped bridge (serves only that user, with shared fallback).
    """
    user_id = await _resolve_user_id(token)

    if not agent_id:
        prefix = f"user-{user_id}" if user_id else "shared"
        agent_id = f"{prefix}-{uuid.uuid4().hex[:8]}"

    agent = await remote_cmd_bridge.connect(
        websocket, agent_id=agent_id, agent_type=agent_type, user_id=user_id,
    )

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "")

            if msg_type == "result":
                task_id = data.get("task_id")
                if task_id:
                    remote_cmd_bridge.resolve_task(task_id, data)

            elif msg_type == "error":
                task_id = data.get("task_id")
                error = data.get("error", "Unknown error from remote agent")
                if task_id:
                    remote_cmd_bridge.fail_task(task_id, error)

            elif msg_type == "heartbeat":
                try:
                    from pixsim7.backend.main.services.meta.agent_sessions import agent_session_registry
                    agent_session_registry.heartbeat(
                        session_id=agent_id,
                        agent_type=agent_type,
                        status=data.get("status", "active"),
                        contract_id=data.get("contract_id"),
                        plan_id=data.get("plan_id"),
                        action=data.get("action", ""),
                        detail=data.get("detail", ""),
                    )
                except Exception:
                    pass

            elif msg_type == "pong":
                pass

            else:
                logger.warning("agent_cmd_unknown_message", agent_id=agent_id, type=msg_type)

    except WebSocketDisconnect:
        remote_cmd_bridge.disconnect(agent_id)
    except Exception as exc:
        logger.warning("agent_cmd_error", agent_id=agent_id, error=str(exc))
        remote_cmd_bridge.disconnect(agent_id)
