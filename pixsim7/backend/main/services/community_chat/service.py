"""
Community chat service (plan ``community-chat``, checkpoint
``community-room``).

Thin domain service over the Phase-1 substrate. Phase 2 only needs the
single shared **community room**: one ``Conversation(type='room')`` that
every authenticated user joins on first contact. DM-specific logic
(pairwise dedupe, multiple conversations) is a later checkpoint and is
deliberately absent here.
"""
from __future__ import annotations

from uuid import UUID

from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.platform.conversation import (
    Conversation,
    ConversationMessage,
    ConversationParticipant,
    CONVERSATION_TYPE_ROOM,
    user_actor,
)
from pixsim7.backend.main.shared.datetime_utils import utcnow


class CommunityChatService:
    """Room get-or-create, membership, history, and message append."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_or_create_room(self) -> Conversation:
        """Return the singleton community room, creating it on first use.

        There is exactly one shared room in Phase 2: the oldest
        ``type='room'`` conversation. A first-call race could create two
        rows; harmless for the current single-tenant dev state (no users
        yet) and superseded once rooms become explicitly identified.
        """
        result = await self.db.execute(
            select(Conversation)
            .where(Conversation.type == CONVERSATION_TYPE_ROOM)
            .order_by(Conversation.created_at)
            .limit(1)
        )
        room = result.scalars().first()
        if room is not None:
            return room

        room = Conversation(type=CONVERSATION_TYPE_ROOM)
        self.db.add(room)
        await self.db.commit()
        await self.db.refresh(room)
        return room

    async def ensure_participant(self, conversation_id: UUID, user_id: int) -> None:
        """Idempotently add ``user_id`` as a participant of the conversation."""
        existing = await self.db.get(
            ConversationParticipant, (conversation_id, user_id)
        )
        if existing is not None:
            return
        self.db.add(
            ConversationParticipant(
                conversation_id=conversation_id,
                user_id=user_id,
            )
        )
        await self.db.commit()

    async def list_messages(
        self,
        conversation_id: UUID,
        *,
        limit: int = 50,
    ) -> list[ConversationMessage]:
        """Most recent ``limit`` messages, returned oldest-first."""
        result = await self.db.execute(
            select(ConversationMessage)
            .where(ConversationMessage.conversation_id == conversation_id)
            .order_by(ConversationMessage.created_at.desc())
            .limit(limit)
        )
        rows = list(result.scalars().all())
        rows.reverse()
        return rows

    async def post_message(
        self,
        conversation_id: UUID,
        user_id: int,
        body: str,
    ) -> ConversationMessage:
        """Append a user-authored message and bump ``last_message_at``."""
        message = ConversationMessage(
            conversation_id=conversation_id,
            sender=user_actor(user_id),
            body=body,
        )
        self.db.add(message)

        conversation = await self.db.get(Conversation, conversation_id)
        if conversation is not None:
            conversation.last_message_at = utcnow()

        await self.db.commit()
        await self.db.refresh(message)
        return message
