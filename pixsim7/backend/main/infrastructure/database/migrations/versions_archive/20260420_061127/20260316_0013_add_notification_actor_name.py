"""Add actor_name to notifications.

Stores resolved display name at notification creation time
so reads don't need user table JOINs.

Revision ID: 20260316_0013
Revises: 20260316_0012
Create Date: 2026-03-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260316_0013"
down_revision = "20260316_0012"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"


def upgrade() -> None:
    op.add_column(
        "notifications",
        sa.Column("actor_name", sa.String(120), nullable=True),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("notifications", "actor_name", schema=SCHEMA)
