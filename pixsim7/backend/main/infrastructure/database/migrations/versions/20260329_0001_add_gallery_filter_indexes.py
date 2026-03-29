"""add gallery filter indexes

Add composite indexes to speed up gallery asset filtering and JSONB search:
- (user_id, is_archived, asset_kind) for base filter conditions
- (user_id, is_archived, asset_kind, searchable, created_at) for default gallery query
- GIN index on prompt_analysis for JSONB containment queries (analysis tags)

Revision ID: 20260329_0001
Revises: 20260328_0002
Create Date: 2026-03-29
"""
from alembic import op

revision = '20260329_0001'
down_revision = '20260328_0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # Composite index for base filter conditions (every gallery query uses these)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_asset_user_archived_kind
        ON assets (user_id, is_archived, asset_kind)
    """)

    # Composite index covering the default gallery listing query pattern
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_asset_gallery_default
        ON assets (user_id, is_archived, asset_kind, searchable, created_at DESC)
    """)

    # GIN index for containment on prompt_analysis (analysis tag filtering)
    # Column is JSON, so cast to JSONB for GIN indexing
    if bind.dialect.name == 'postgresql':
        op.execute("""
            CREATE INDEX IF NOT EXISTS idx_asset_prompt_analysis_gin
            ON assets USING GIN ((prompt_analysis::jsonb) jsonb_path_ops)
            WHERE prompt_analysis IS NOT NULL
        """)


def downgrade() -> None:
    bind = op.get_bind()

    if bind.dialect.name == 'postgresql':
        op.execute("DROP INDEX IF EXISTS idx_asset_prompt_analysis_gin")

    op.execute("DROP INDEX IF EXISTS idx_asset_gallery_default")
    op.execute("DROP INDEX IF EXISTS idx_asset_user_archived_kind")
