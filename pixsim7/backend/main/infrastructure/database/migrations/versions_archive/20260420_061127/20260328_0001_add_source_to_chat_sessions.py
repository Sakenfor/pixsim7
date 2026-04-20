"""Add source column to chat_sessions.

Tracks how the session was created: 'chat' (AI Assistant panel),
'mcp' (CLI register_session), 'mcp-auto' (first tool call),
'bridge' (pool sync).

Revision ID: 20260328_0001
Revises: 20260326_0001
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260328_0001"
down_revision = "20260326_0001"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"
TABLE = "chat_sessions"


def upgrade() -> None:
    op.add_column(
        TABLE,
        sa.Column("source", sa.String(32), nullable=True),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_column(TABLE, "source", schema=SCHEMA)
