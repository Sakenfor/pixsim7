"""Add primary_character_id to prompt_families.

Soft reference to characters.id — enables deterministic structural tag
derivation (species, archetype, category) without an LLM call.

Also documents the three-value source enum on prompt_family_tag:
  'manual'  — user-curated, never overwritten by automation
  'derived' — deterministic from structured authoring context (sync)
  'ai'      — LLM-inferred from prompt text (async background)

Revision ID: 20260402_0011
Revises: 20260402_0010
Create Date: 2026-04-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260402_0011"
down_revision = "20260402_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "prompt_families",
        sa.Column("primary_character_id", sa.UUID(), nullable=True),
    )
    op.create_index(
        "idx_prompt_family_primary_character",
        "prompt_families",
        ["primary_character_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_prompt_family_primary_character", table_name="prompt_families")
    op.drop_column("prompt_families", "primary_character_id")
