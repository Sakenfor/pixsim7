"""Add notifications table.

Lightweight broadcast/targeted notifications for plan events,
feature announcements, and agent actions.

Revision ID: 20260316_0012
Revises: 20260316_0011
Create Date: 2026-03-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260316_0012"
down_revision = "20260316_0011"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("category", sa.String(32), nullable=False, server_default="system"),
        sa.Column("severity", sa.String(16), nullable=False, server_default="info"),
        sa.Column("source", sa.String(120), nullable=False, server_default="system"),
        sa.Column("ref_type", sa.String(32), nullable=True),
        sa.Column("ref_id", sa.String(120), nullable=True),
        sa.Column("broadcast", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("user_id", sa.Integer(), nullable=True, index=True),
        sa.Column("read", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=False, index=True),
        schema=SCHEMA,
    )
    op.create_index(
        "idx_notifications_user_read",
        "notifications",
        ["user_id", "read"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_index("idx_notifications_user_read", table_name="notifications", schema=SCHEMA)
    op.drop_table("notifications", schema=SCHEMA)
