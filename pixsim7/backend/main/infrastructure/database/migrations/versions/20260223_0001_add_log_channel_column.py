"""Add channel column to log_entries for semantic log categorization.

Revision ID: 20260223_0001
Revises: 20260221_0002
Create Date: 2026-02-23
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260223_0001"
down_revision = "20260221_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("log_entries", sa.Column("channel", sa.String(30), nullable=True))
    op.create_index("ix_log_entries_channel", "log_entries", ["channel"])
    op.create_index("idx_logs_channel_timestamp", "log_entries", ["channel", "timestamp"])


def downgrade() -> None:
    op.drop_index("idx_logs_channel_timestamp", table_name="log_entries")
    op.drop_index("ix_log_entries_channel", table_name="log_entries")
    op.drop_column("log_entries", "channel")
