"""chat_tabs.session_id nullable + clear synthetic auto-mints

Tabs no longer auto-mint a ChatSession at create time — the row is bound
on first turn when the bridge returns Claude's real ``cli_session_id``.
See plan ``chat-tab-server-persistence`` — first-turn resume-failure fix.

The data cleanup nulls out any existing ``session_id`` that points at a
ChatSession with no ``cli_session_id`` and no messages (i.e. an
auto-minted synthetic the bridge would try to ``--resume`` and fail).
Real, in-use sessions (those with messages or a resolved cli_session_id)
are left bound.

Revision ID: 20260514_0002
Revises: 20260514_0001
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa


revision = "20260514_0002"
down_revision = "20260514_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "chat_tabs",
        "session_id",
        existing_type=sa.String(length=120),
        nullable=True,
        schema="dev_meta",
    )

    # Clear bindings to synthetic sessions the bridge would resume-fail on.
    op.execute(
        """
        UPDATE dev_meta.chat_tabs t
        SET session_id = NULL
        WHERE t.session_id IS NOT NULL
          AND EXISTS (
              SELECT 1
              FROM dev_meta.chat_sessions s
              WHERE s.id = t.session_id
                AND (s.cli_session_id IS NULL OR s.cli_session_id = '')
                AND COALESCE(s.message_count, 0) = 0
          )
        """
    )


def downgrade() -> None:
    # Re-mint placeholder session_ids for any tabs that were nulled out so the
    # NOT NULL constraint can be restored. Generated values are uuid4 hex.
    op.execute(
        """
        UPDATE dev_meta.chat_tabs
        SET session_id = REPLACE(gen_random_uuid()::text, '-', '')
        WHERE session_id IS NULL
        """
    )
    op.alter_column(
        "chat_tabs",
        "session_id",
        existing_type=sa.String(length=120),
        nullable=False,
        schema="dev_meta",
    )
