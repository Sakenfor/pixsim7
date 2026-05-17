"""
Conversation substrate — generic user-to-user chat storage.

Three tables form the reusable substrate (plan ``community-chat``,
checkpoint ``substrate``):

* ``Conversation``        — a chat container; ``type`` is ``room`` or ``dm``.
* ``ConversationParticipant`` — a *human* member of a conversation, with
  per-participant ``last_read_at`` for unread tracking.
* ``ConversationMessage`` — one message; authorship is an *actor string*
  (``user:{id}`` / ``agent:{session}`` / ``system``) rather than a rigid
  user FK.

Design decisions (see plan ``community-chat``):

* A shared room is a degenerate case of the same abstraction — a
  ``Conversation(type='room')`` with many participants. A DM is
  ``type='dm'`` with two. Same write path, same WS fan-out path.
* ``ConversationMessage.sender`` follows the existing codebase actor
  convention (``notifications.py``: ``user:{id}|agent:{session}|system``)
  instead of a ``sender_user_id`` FK. Phases 1–4 only ever emit
  ``user:{id}`` — no extra machinery now — but this keeps a future
  non-human author from becoming a schema migration.
* ``ConversationParticipant`` is **users-only by design**: unread state
  (``last_read_at``) is a human concern. A future attached agent is best
  expressed as an optional conversation-level attribute added when
  needed, NOT a participant row.

Access control is intentionally NOT modelled with the generic
``OwnershipPolicy`` here: that policy only expresses
GLOBAL/USER/WORLD/SESSION owner-field scoping, and a conversation is
*participant-scoped* (a room is visible to all its members, a DM to its
two). Membership-based authorization is enforced at the service/endpoint
layer in checkpoint ``community-room`` (Phase 2), not via owner_field.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import Text
from sqlmodel import Column, Field, Index, SQLModel

from pixsim7.backend.main.shared.datetime_utils import utcnow

PLATFORM_SCHEMA = "dev_meta"

# Conversation kinds. Kept as a plain str column (not a DB enum) so adding
# kinds later is a code change, not a migration.
CONVERSATION_TYPE_ROOM = "room"
CONVERSATION_TYPE_DM = "dm"


class Conversation(SQLModel, table=True):
    """A chat container. ``type`` selects room vs. 1:1 DM semantics."""

    __tablename__ = "conversations"
    __table_args__ = (
        Index("idx_conversations_type", "type"),
        {"schema": PLATFORM_SCHEMA},
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    type: str = Field(
        default=CONVERSATION_TYPE_ROOM,
        max_length=16,
        description="'room' (N participants) or 'dm' (exactly 2).",
    )
    created_at: datetime = Field(default_factory=utcnow)
    # NULL until the first message; ordering key for an inbox list.
    last_message_at: Optional[datetime] = Field(default=None, index=True)


class ConversationParticipant(SQLModel, table=True):
    """A human member of a conversation (composite PK conversation_id+user_id).

    Users-only by design — see module docstring. ``last_read_at`` powers
    per-participant unread counts (checkpoint ``read-state``).
    """

    __tablename__ = "conversation_participants"
    __table_args__ = (
        Index("idx_conversation_participants_user", "user_id"),
        {"schema": PLATFORM_SCHEMA},
    )

    conversation_id: UUID = Field(
        foreign_key=f"{PLATFORM_SCHEMA}.conversations.id",
        primary_key=True,
    )
    user_id: int = Field(primary_key=True)
    joined_at: datetime = Field(default_factory=utcnow)
    # NULL = never read. Updated when the participant views the conversation.
    last_read_at: Optional[datetime] = Field(default=None)


class ConversationMessage(SQLModel, table=True):
    """One message in a conversation.

    ``sender`` is an actor string (``user:{id}`` / ``agent:{session}`` /
    ``system``), not a user FK — see module docstring.
    """

    __tablename__ = "conversation_messages"
    __table_args__ = (
        # Primary history query: one conversation's messages in time order.
        Index("idx_conversation_messages_conv_created", "conversation_id", "created_at"),
        {"schema": PLATFORM_SCHEMA},
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    conversation_id: UUID = Field(
        foreign_key=f"{PLATFORM_SCHEMA}.conversations.id",
        index=True,
    )
    sender: str = Field(
        max_length=128,
        description="Actor string: 'user:{id}' | 'agent:{session}' | 'system'.",
    )
    body: str = Field(sa_column=Column(Text))
    created_at: datetime = Field(default_factory=utcnow)


# --- Actor-string helpers -------------------------------------------------
# Single source of truth for the sender convention so callers don't
# hand-format the prefix. Mirrors notifications.py's source format.

def user_actor(user_id: int) -> str:
    """Actor string for a human author."""
    return f"user:{user_id}"


def actor_user_id(sender: str) -> Optional[int]:
    """Extract the user id from a ``user:{id}`` actor string, else None."""
    if sender.startswith("user:"):
        try:
            return int(sender.split(":", 1)[1])
        except (ValueError, IndexError):
            return None
    return None
