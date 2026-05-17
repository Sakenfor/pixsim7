"""conversation substrate — conversations, participants, messages

Creates the reusable user-chat substrate in ``dev_meta`` (plan
``community-chat``, checkpoint ``substrate``):

* ``conversations``            — chat container; ``type`` = room | dm.
* ``conversation_participants``— human members; composite PK
  ``(conversation_id, user_id)``; ``last_read_at`` for unread tracking.
* ``conversation_messages``    — messages; ``sender`` is an actor string
  (``user:{id}`` / ``agent:{session}`` / ``system``), not a user FK.

A room is a ``conversations`` row of type ``room`` with N participant
rows; a DM is type ``dm`` with two. Same schema either way — DM is a
later phase, no migration needed for it.

Indexes:
  * ``idx_conversations_type`` / ``idx_conversations_last_message_at``
    — kind filter and inbox ordering.
  * ``idx_conversation_participants_user`` — "conversations for user X".
  * ``idx_conversation_messages_conv_created`` — primary history query
    (one conversation, time order). Single ``conversation_id`` index
    mirrors the model's declared FK index.

Both child tables FK into ``conversations`` with ON DELETE CASCADE so
deleting a conversation cleans up its members and messages.

Revision ID: 20260517_0001
Revises: 20260515_0001
Create Date: 2026-05-17
"""
from alembic import op
import sqlalchemy as sa


revision = "20260517_0001"
down_revision = "20260515_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "conversations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(length=16), nullable=False, server_default="room"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        schema="dev_meta",
    )
    op.create_index(
        "idx_conversations_type",
        "conversations",
        ["type"],
        schema="dev_meta",
    )
    op.create_index(
        "idx_conversations_last_message_at",
        "conversations",
        ["last_message_at"],
        schema="dev_meta",
    )

    op.create_table(
        "conversation_participants",
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["dev_meta.conversations.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("conversation_id", "user_id"),
        schema="dev_meta",
    )
    op.create_index(
        "idx_conversation_participants_user",
        "conversation_participants",
        ["user_id"],
        schema="dev_meta",
    )

    op.create_table(
        "conversation_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("sender", sa.String(length=128), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["dev_meta.conversations.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        schema="dev_meta",
    )
    op.create_index(
        "idx_conversation_messages_conversation",
        "conversation_messages",
        ["conversation_id"],
        schema="dev_meta",
    )
    op.create_index(
        "idx_conversation_messages_conv_created",
        "conversation_messages",
        ["conversation_id", "created_at"],
        schema="dev_meta",
    )


def downgrade() -> None:
    op.drop_index(
        "idx_conversation_messages_conv_created",
        table_name="conversation_messages",
        schema="dev_meta",
    )
    op.drop_index(
        "idx_conversation_messages_conversation",
        table_name="conversation_messages",
        schema="dev_meta",
    )
    op.drop_table("conversation_messages", schema="dev_meta")

    op.drop_index(
        "idx_conversation_participants_user",
        table_name="conversation_participants",
        schema="dev_meta",
    )
    op.drop_table("conversation_participants", schema="dev_meta")

    op.drop_index(
        "idx_conversations_last_message_at",
        table_name="conversations",
        schema="dev_meta",
    )
    op.drop_index(
        "idx_conversations_type",
        table_name="conversations",
        schema="dev_meta",
    )
    op.drop_table("conversations", schema="dev_meta")
