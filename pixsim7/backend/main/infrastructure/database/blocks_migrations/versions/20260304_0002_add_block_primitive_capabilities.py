"""Add explicit capabilities column to block_primitives.

Revision ID: 20260304_0002
Revises: 20260228_0001
Create Date: 2026-03-04
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "20260304_0002"
down_revision = "20260228_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "block_primitives",
        sa.Column(
            "capabilities",
            JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.create_index(
        "ix_block_primitives_capabilities",
        "block_primitives",
        ["capabilities"],
        postgresql_using="gin",
    )
    # Backfill baseline capability from category for existing rows.
    op.execute(
        """
        UPDATE block_primitives
        SET capabilities = jsonb_build_array(category)
        WHERE capabilities IS NULL
           OR capabilities = '[]'::jsonb
        """
    )


def downgrade() -> None:
    op.drop_index("ix_block_primitives_capabilities", table_name="block_primitives")
    op.drop_column("block_primitives", "capabilities")
