"""Add chat_sessions table for /resume session history.

Revision ID: 20260320_0002
"""
from alembic import op
import sqlalchemy as sa

revision = "20260320_0002"
down_revision = "20260320_0001"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"


def upgrade() -> None:
    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.String(120), primary_key=True),
        sa.Column("user_id", sa.Integer, nullable=False, index=True, server_default="0"),
        sa.Column("engine", sa.String(32), nullable=False, server_default="claude"),
        sa.Column("profile_id", sa.String(120), nullable=True),
        sa.Column("label", sa.String(255), nullable=False, server_default="Untitled"),
        sa.Column("message_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_used_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        schema=SCHEMA,
    )
    op.create_index(
        "idx_chat_sessions_user_engine",
        "chat_sessions",
        ["user_id", "engine"],
        schema=SCHEMA,
    )
    op.create_index(
        "idx_chat_sessions_last_used",
        "chat_sessions",
        ["last_used_at"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("chat_sessions", schema=SCHEMA)
