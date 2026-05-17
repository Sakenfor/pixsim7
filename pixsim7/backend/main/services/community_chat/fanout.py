"""
Conversation-keyed WebSocket fan-out (plan ``community-chat``,
checkpoint ``substrate``).

The generic ``connection_manager`` already knows how to push a JSON
payload to every live socket of a given ``user_id``. The only thing
chat-specific is *which* users belong to a conversation. This helper is
that one piece: resolve a conversation's human participants and fan a
payload out to each.

This is deliberately the entire transport surface for Phase 1 — no REST
endpoints and no WS route yet (checkpoint ``community-room``). It works
for both a shared room (N participants) and a DM (2) with no change,
because both are just rows in ``conversation_participants``.
"""
from __future__ import annotations

from uuid import UUID

from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.platform.conversation import (
    ConversationParticipant,
)
from pixsim7.backend.main.infrastructure.websocket import connection_manager


async def broadcast_to_conversation(
    db: AsyncSession,
    conversation_id: UUID,
    payload: dict,
    *,
    exclude_user_id: int | None = None,
) -> int:
    """Push ``payload`` to every participant of ``conversation_id``.

    Args:
        db: Active async session.
        conversation_id: Target conversation.
        payload: JSON-serialisable dict (the WS envelope).
        exclude_user_id: Optionally skip this user (e.g. the sender, if
            the caller has already echoed locally). ``None`` = send to
            all, including the sender's other devices.

    Returns:
        Number of distinct users the payload was dispatched to. (A user
        with no live socket is still counted as targeted; the connection
        manager simply no-ops for them.)
    """
    result = await db.execute(
        select(ConversationParticipant.user_id).where(
            ConversationParticipant.conversation_id == conversation_id
        )
    )
    user_ids = {row for (row,) in result.all()}
    if exclude_user_id is not None:
        user_ids.discard(exclude_user_id)

    for user_id in user_ids:
        await connection_manager.broadcast_to_user(payload, user_id)

    return len(user_ids)
