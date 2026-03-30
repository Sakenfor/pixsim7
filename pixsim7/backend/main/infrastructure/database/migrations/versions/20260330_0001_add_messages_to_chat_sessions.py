"""Add messages JSON column to chat_sessions for resume history.

Revision ID: 20260330_0001
"""
from alembic import op
import sqlalchemy as sa

revision = "20260330_0001"
down_revision = "20260329_0002"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"


def upgrade() -> None:
    op.add_column(
        "chat_sessions",
        sa.Column("messages", sa.JSON, nullable=True),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("chat_sessions", "messages", schema=SCHEMA)
