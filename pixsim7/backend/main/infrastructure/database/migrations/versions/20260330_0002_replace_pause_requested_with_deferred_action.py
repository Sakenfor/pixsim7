"""Replace pause_requested bool with deferred_action string.

Unifies the cooperative cancel/pause mechanism for PROCESSING generations.
deferred_action holds 'pause' or 'cancel' (NULL = no deferred action).

Revision ID: 20260330_0002
Revises: 20260330_0001
Create Date: 2026-03-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260330_0002"
down_revision = "20260330_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "generations",
        sa.Column("deferred_action", sa.String(10), nullable=True),
    )
    op.execute("UPDATE generations SET deferred_action = 'pause' WHERE pause_requested = true")
    op.drop_column("generations", "pause_requested")


def downgrade() -> None:
    op.add_column(
        "generations",
        sa.Column("pause_requested", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.execute("UPDATE generations SET pause_requested = true WHERE deferred_action = 'pause'")
    op.drop_column("generations", "deferred_action")
