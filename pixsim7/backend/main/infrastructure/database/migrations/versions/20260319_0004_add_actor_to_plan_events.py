"""Add actor column to plan_events for agent/service tracking.

Revision ID: 20260319_0004
Revises: 20260319_0003
Create Date: 2026-03-19
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260319_0004"
down_revision = "20260319_0003"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"


def upgrade() -> None:
    op.add_column(
        "plan_events",
        sa.Column("actor", sa.String(120), nullable=True),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("plan_events", "actor", schema=SCHEMA)
