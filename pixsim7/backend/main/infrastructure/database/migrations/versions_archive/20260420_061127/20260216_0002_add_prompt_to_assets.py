"""Add prompt column to assets table.

Revision ID: 20260216_0002
Revises: 20260216_0001
Create Date: 2026-02-16

Adds a first-class `prompt` text column to the assets table for direct
access, querying, and display.  Backfills from existing JSON blobs:
  1. media_metadata->'generation_context'->>'prompt'
  2. prompt_analysis->>'prompt'
"""

from alembic import op
import sqlalchemy as sa


revision = "20260216_0002"
down_revision = "20260216_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("assets", sa.Column("prompt", sa.Text(), nullable=True))

    # Backfill from existing JSON columns
    op.execute(
        """
        UPDATE assets
        SET prompt = COALESCE(
            media_metadata->'generation_context'->>'prompt',
            prompt_analysis->>'prompt'
        )
        WHERE prompt IS NULL
          AND (
            media_metadata->'generation_context'->>'prompt' IS NOT NULL
            OR prompt_analysis->>'prompt' IS NOT NULL
          )
        """
    )


def downgrade() -> None:
    op.drop_column("assets", "prompt")
