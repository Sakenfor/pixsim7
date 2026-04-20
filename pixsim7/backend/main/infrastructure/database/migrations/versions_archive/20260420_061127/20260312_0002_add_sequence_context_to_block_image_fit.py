"""Add sequence_context_snapshot column to block_image_fits.

Revision ID: 20260312_0002
Revises: 20260312_0001
Create Date: 2026-03-12

Adds a JSON column for persisting sequence continuity context
alongside fit records, enabling continuation/transition calibration.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

revision = "20260312_0002"
down_revision = "20260312_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "block_image_fits",
        sa.Column(
            "sequence_context_snapshot",
            JSON,
            nullable=False,
            server_default="{}",
        ),
    )


def downgrade() -> None:
    op.drop_column("block_image_fits", "sequence_context_snapshot")

