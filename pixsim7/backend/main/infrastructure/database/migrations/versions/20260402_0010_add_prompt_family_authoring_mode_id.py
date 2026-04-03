"""Add authoring_mode_id to prompt_families.

Explicit soft reference to authoring_modes.id — keeps category free for
content labels ('romance', 'action') while authoring_mode_id carries the
mode used during authoring ('character_design', 'scene_setup').

Used by the AI tag vocabulary lookup (prefers authoring_mode_id, falls
back to category, then fallback vocabulary).

Revision ID: 20260402_0010
Revises: 20260402_0009
Create Date: 2026-04-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260402_0010"
down_revision = "20260402_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "prompt_families",
        sa.Column("authoring_mode_id", sa.String(100), nullable=True),
    )
    op.create_index(
        "idx_prompt_family_authoring_mode",
        "prompt_families",
        ["authoring_mode_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_prompt_family_authoring_mode", table_name="prompt_families")
    op.drop_column("prompt_families", "authoring_mode_id")
