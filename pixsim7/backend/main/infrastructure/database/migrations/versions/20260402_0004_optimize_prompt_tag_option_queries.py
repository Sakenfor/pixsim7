"""optimize prompt-tag option queries

Adds a prompt-version scoped partial index for gallery prompt-tag option loads
and removes the obsolete JSON-era prompt-tags index.

Revision ID: 20260402_0004
Revises: 20260402_0003
Create Date: 2026-04-02
"""
from alembic import op


revision = "20260402_0004"
down_revision = "20260402_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_prompt_tag_scope_user_prompt_version
        ON assets (user_id, prompt_version_id)
        WHERE is_archived = false
          AND searchable = true
          AND asset_kind = 'content'
          AND prompt_version_id IS NOT NULL
        """
    )

    # Old JSON-path prompt tag option index is no longer used after switching
    # to prompt_version_tag_assertion lookups.
    op.execute("DROP INDEX IF EXISTS idx_asset_prompt_tags_options_recent")


def downgrade() -> None:
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

    op.execute("DROP INDEX IF EXISTS idx_asset_prompt_tag_scope_user_prompt_version")
