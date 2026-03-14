"""Add block_metadata column to block_primitives.

Revision ID: 20260314_0003
Revises: 20260304_0002
Create Date: 2026-03-14
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "20260314_0003"
down_revision = "20260304_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "block_primitives",
        sa.Column(
            "block_metadata",
            JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("block_primitives", "block_metadata")
