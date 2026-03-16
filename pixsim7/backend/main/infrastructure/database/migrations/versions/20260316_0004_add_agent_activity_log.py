"""Add agent_activity_log table for persistent agent action tracking.

Revision ID: 20260316_0004
Revises: 20260316_0003
Create Date: 2026-03-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260316_0004"
down_revision = "20260316_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS dev_meta")
    op.create_table(
        "agent_activity_log",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("session_id", sa.String(120), nullable=False, index=True),
        sa.Column("agent_type", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("contract_id", sa.String(120), nullable=True, index=True),
        sa.Column("plan_id", sa.String(120), nullable=True, index=True),
        sa.Column("action", sa.String(120), nullable=False, server_default=""),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("endpoint", sa.String(512), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("timestamp", sa.DateTime(), nullable=False, index=True),
        schema="dev_meta",
    )
    op.create_index(
        "idx_agent_log_session_ts",
        "agent_activity_log",
        ["session_id", "timestamp"],
        schema="dev_meta",
    )


def downgrade() -> None:
    op.drop_index("idx_agent_log_session_ts", table_name="agent_activity_log", schema="dev_meta")
    op.drop_table("agent_activity_log", schema="dev_meta")
