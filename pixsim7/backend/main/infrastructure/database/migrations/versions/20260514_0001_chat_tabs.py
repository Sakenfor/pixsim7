"""chat_tabs table — user-visible AI Assistant tabs

Adds ``dev_meta.chat_tabs``: a server-persisted tab list pointing at the
existing ``dev_meta.chat_sessions`` rows. Closing a tab deletes the
``chat_tabs`` row but leaves the underlying session untouched, so chats
can be reopened later (Closed-tab Reopen UX, plan
``chat-tab-server-persistence`` checkpoint E).

Composite index on ``(user_id, order_index)`` powers the primary list
endpoint (one user's tabs, in tab-strip order). Index on ``session_id``
covers reverse lookups (which tab owns this session, used by the
notification ref_id path).

Revision ID: 20260514_0001
Revises: 20260503_0001
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa


revision = "20260514_0001"
down_revision = "20260503_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_tabs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.String(length=120), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False, server_default="Untitled"),
        sa.Column("draft", sa.Text(), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("plan_id", sa.String(length=120), nullable=True),
        sa.Column("scope_key", sa.String(length=255), nullable=True),
        sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["dev_meta.chat_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        schema="dev_meta",
    )
    op.create_index(
        "idx_chat_tabs_user_id",
        "chat_tabs",
        ["user_id"],
        schema="dev_meta",
    )
    op.create_index(
        "idx_chat_tabs_user_order",
        "chat_tabs",
        ["user_id", "order_index"],
        schema="dev_meta",
    )
    op.create_index(
        "idx_chat_tabs_session",
        "chat_tabs",
        ["session_id"],
        schema="dev_meta",
    )
    op.create_index(
        "idx_chat_tabs_plan_id",
        "chat_tabs",
        ["plan_id"],
        schema="dev_meta",
    )


def downgrade() -> None:
    op.drop_index("idx_chat_tabs_plan_id", table_name="chat_tabs", schema="dev_meta")
    op.drop_index("idx_chat_tabs_session", table_name="chat_tabs", schema="dev_meta")
    op.drop_index("idx_chat_tabs_user_order", table_name="chat_tabs", schema="dev_meta")
    op.drop_index("idx_chat_tabs_user_id", table_name="chat_tabs", schema="dev_meta")
    op.drop_table("chat_tabs", schema="dev_meta")
