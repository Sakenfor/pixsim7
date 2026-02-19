"""Add character_bindings column to block_templates.

Revision ID: 20260219_0001
Revises: 20260218_0001
Create Date: 2026-02-19
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260219_0001"
down_revision = "20260218_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "block_templates",
        sa.Column("character_bindings", sa.JSON(), nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("block_templates", "character_bindings")
