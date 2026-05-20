"""
Community-chat notification emit (plan ``community-chat`` Phase 3B).

Mirrors the AI Assistant pattern (``meta_contracts._emit_chat_message_notification``):
on every new message, emit a *scoped* Notification per non-sender participant
with ``category='community'`` (registry default-off so the global bell stays
quiet) and ``ref_type='conversation' / ref_id=<conv_id>``. The frontend's
scoped unread-by-ref poll bypasses default-off suppression, so the per-
conversation pip + activity-bar badge still fire while the bell is silent.

The unread *truth* still lives in ``conversation_participant.last_read_at``
(Phase 3A). This emit is only the *nudge delivery* layer.

Isolation: own ``AsyncSessionLocal`` so emit failures can never roll back
the message persistence transaction; errors logged, never raised.
"""
from __future__ import annotations

from uuid import UUID

from pixsim_logging import get_logger
from sqlmodel import select

from pixsim7.backend.main.api.v1.notifications import emit_notification
from pixsim7.backend.main.domain.platform.conversation import (
    ConversationParticipant,
)
from pixsim7.backend.main.infrastructure.database.session import AsyncSessionLocal

logger = get_logger()

_PREVIEW_MAX = 140


def _preview(body: str) -> str:
    body = body.strip().replace("\n", " ")
    if len(body) <= _PREVIEW_MAX:
        return body
    return body[: _PREVIEW_MAX - 1] + "…"


async def emit_community_message_notification(
    *,
    conversation_id: UUID,
    sender_user_id: int,
    body: str,
) -> None:
    """Emit one targeted notification per non-sender participant."""
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(ConversationParticipant.user_id).where(
                    ConversationParticipant.conversation_id == conversation_id,
                    ConversationParticipant.user_id != sender_user_id,
                )
            )
            recipients = [row for (row,) in result.all()]
            if not recipients:
                return

            preview = _preview(body)
            for user_id in recipients:
                await emit_notification(
                    db,
                    title="Community Chat",
                    body=preview or None,
                    category="community",
                    severity="info",
                    source=f"user:{sender_user_id}",
                    event_type="community.message",
                    ref_type="conversation",
                    ref_id=str(conversation_id),
                    broadcast=False,
                    user_id=user_id,
                    actor_user_id=sender_user_id,
                    payload={
                        "conversationId": str(conversation_id),
                        "senderUserId": sender_user_id,
                    },
                )
            await db.commit()
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "community_chat_notification_emit_failed",
            error_type=type(exc).__name__,
            error=str(exc),
            conversation_id=str(conversation_id),
            sender_user_id=sender_user_id,
        )
