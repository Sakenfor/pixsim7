"""add prompt-tags recent-options index

Optimizes Prompt Tags option loading in gallery filters by indexing the exact
recent-assets slice used for tag discovery.

Revision ID: 20260402_0001
Revises: 20260401_0001
Create Date: 2026-04-02
"""
from alembic import op


revision = "20260402_0001"
down_revision = "20260401_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_prompt_tags_options_recent
        ON assets (user_id, created_at DESC, id DESC)
        WHERE is_archived = false
          AND searchable = true
          AND asset_kind = 'content'
          AND prompt_analysis IS NOT NULL
          AND (prompt_analysis::jsonb ? 'tags_flat')
          AND jsonb_typeof((prompt_analysis::jsonb -> 'tags_flat')) = 'array'
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute("DROP INDEX IF EXISTS idx_asset_prompt_tags_options_recent")

