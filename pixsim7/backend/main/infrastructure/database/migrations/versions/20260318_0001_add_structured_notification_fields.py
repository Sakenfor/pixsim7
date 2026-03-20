"""Add structured notification fields for forward rendering.

Revision ID: 20260318_0001
Revises: 20260317_0200
Create Date: 2026-03-18
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260318_0001"
down_revision = "20260317_0200"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"


def upgrade() -> None:
    op.add_column(
        "notifications",
        sa.Column("event_type", sa.String(length=120), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "notifications",
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "notifications",
        sa.Column("payload", sa.JSON(), nullable=True),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_notifications_actor_user_id",
        "notifications",
        ["actor_user_id"],
        unique=False,
        schema=SCHEMA,
    )
    op.create_index(
        "ix_notifications_event_type",
        "notifications",
        ["event_type"],
        unique=False,
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_index("ix_notifications_event_type", table_name="notifications", schema=SCHEMA)
    op.drop_index("ix_notifications_actor_user_id", table_name="notifications", schema=SCHEMA)
    op.drop_column("notifications", "payload", schema=SCHEMA)
    op.drop_column("notifications", "actor_user_id", schema=SCHEMA)
    op.drop_column("notifications", "event_type", schema=SCHEMA)
