"""
Community chat API — REST history/send + a thin WebSocket receive channel.

Plan ``community-chat`` / checkpoint ``community-room`` (Phase 2, first
visible milestone). One shared room; send via REST, receive live via WS.
The WS protocol is intentionally tiny (``ping``/``pong`` +
``{type:'message', body}``) — none of the agent-chat task/confirmation
machinery. DM-specific routes are a later checkpoint.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from pixsim_logging import get_logger

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession
from pixsim7.backend.main.domain.platform.conversation import ConversationMessage
from pixsim7.backend.main.infrastructure.database.session import AsyncSessionLocal
from pixsim7.backend.main.infrastructure.websocket import connection_manager
from pixsim7.backend.main.services.community_chat import (
    CommunityChatService,
    broadcast_to_conversation,
)

logger = get_logger()

router = APIRouter()


# ===== SCHEMAS =====

class ChatMessageOut(BaseModel):
    id: str
    conversation_id: str
    sender: str
    body: str
    created_at: str


class RoomResponse(BaseModel):
    conversation_id: str
    messages: list[ChatMessageOut] = Field(default_factory=list)
    unread_count: int = 0


class SendMessageRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)


def _serialize(message: ConversationMessage) -> ChatMessageOut:
    return ChatMessageOut(
        id=str(message.id),
        conversation_id=str(message.conversation_id),
        sender=message.sender,
        body=message.body,
        created_at=message.created_at.isoformat(),
    )


# ===== REST =====

@router.get("/community-chat/room", response_model=RoomResponse)
async def get_room(current_user: CurrentUser, db: DatabaseSession):
    """Return the shared room id + recent history; join the caller to it."""
    svc = CommunityChatService(db)
    room = await svc.get_or_create_room()
    await svc.ensure_participant(room.id, current_user.id)
    messages = await svc.list_messages(room.id)
    unread = await svc.unread_count(room.id, current_user.id)
    return RoomResponse(
        conversation_id=str(room.id),
        messages=[_serialize(m) for m in messages],
        unread_count=unread,
    )


@router.post("/community-chat/room/read")
async def mark_room_read(current_user: CurrentUser, db: DatabaseSession):
    """Mark the shared room read for the caller (clear-on-view)."""
    svc = CommunityChatService(db)
    room = await svc.get_or_create_room()
    await svc.ensure_participant(room.id, current_user.id)
    await svc.mark_read(room.id, current_user.id)
    return {"ok": True}


@router.post("/community-chat/messages", response_model=ChatMessageOut)
async def send_message(
    request: SendMessageRequest,
    current_user: CurrentUser,
    db: DatabaseSession,
):
    """Append a message to the shared room and fan it out to participants."""
    body = request.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Message body is empty")

    svc = CommunityChatService(db)
    room = await svc.get_or_create_room()
    await svc.ensure_participant(room.id, current_user.id)
    message = await svc.post_message(room.id, current_user.id, body)

    out = _serialize(message)
    await broadcast_to_conversation(
        db,
        room.id,
        {"type": "message", "message": out.model_dump()},
    )
    return out


# ===== WEBSOCKET =====

async def _resolve_user_id(token: str | None) -> int | None:
    """Resolve user id from a JWT query-param token (same shape as ws_chat)."""
    if not token:
        return None
    try:
        from pixsim7.backend.main.api.dependencies import get_auth_service
        from pixsim7.backend.main.shared.actor import RequestPrincipal

        auth_service = get_auth_service()
        payload = await auth_service.verify_token_claims(
            token, update_last_used=False
        )
        return RequestPrincipal.from_jwt_payload(payload).user_id
    except Exception:
        return None


@router.websocket("/ws/community-chat")
async def websocket_community_chat(websocket: WebSocket, token: str | None = None):
    """Live community-room channel.

    Connect: ``ws://host/api/v1/ws/community-chat?token=JWT``
    Receive: ``{"type":"message","message":{...}}`` on every new message.
    Send:    ``ping`` -> ``pong``; ``{"type":"message","body":"..."}``.
    """
    user_id = await _resolve_user_id(token)

    from pixsim7.backend.main.shared.config import settings

    # Logged before any close so a failed handshake is diagnosable (the
    # reject path is otherwise silent).
    logger.info(
        "ws_community_chat_handshake",
        has_token=bool(token),
        resolved_user_id=user_id,
        debug=settings.debug,
    )

    if user_id is None and not settings.debug:
        logger.warning(
            "ws_community_chat_rejected",
            reason="auth" if not token else "token_unresolved",
        )
        await websocket.close(code=1008, reason="Authentication required")
        return

    await connection_manager.connect(websocket, user_id)

    # Join the room so fan-out reaches this user.
    async with AsyncSessionLocal() as db:
        svc = CommunityChatService(db)
        room = await svc.get_or_create_room()
        if user_id is not None:
            await svc.ensure_participant(room.id, user_id)
        room_id = room.id

    await websocket.send_json({
        "type": "connected",
        "conversation_id": str(room_id),
        "user_id": user_id,
    })
    logger.info("ws_community_chat_connected", user_id=user_id)

    try:
        while True:
            raw = await websocket.receive_text()

            if raw == "ping":
                await websocket.send_text("pong")
                continue

            try:
                data = json.loads(raw)
            except (json.JSONDecodeError, ValueError):
                continue

            if data.get("type") != "message":
                continue
            body = str(data.get("body") or "").strip()
            if not body or user_id is None:
                continue

            async with AsyncSessionLocal() as db:
                svc = CommunityChatService(db)
                message = await svc.post_message(room_id, user_id, body)
                out = _serialize(message)
                await broadcast_to_conversation(
                    db,
                    room_id,
                    {"type": "message", "message": out.model_dump()},
                )

    except WebSocketDisconnect:
        logger.info("ws_community_chat_disconnected", user_id=user_id)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "ws_community_chat_error", user_id=user_id, error=str(exc)
        )
    finally:
        connection_manager.disconnect(websocket, user_id)
