"""drop old string-based tags columns from assets

Revision ID: 20251217_0001
Revises: 20251217_0000
Create Date: 2025-12-17 00:01:00.000000

Drop the old string-based tags and style_tags columns from the assets table.
These have been replaced with structured hierarchical tags in the tag table.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20251217_0001'
down_revision = '20251217_0000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop GIN indexes first (created in 20251111_2315_add_gin_indexes_for_asset_tags.py)
    op.execute("DROP INDEX IF EXISTS idx_assets_style_tags_gin")
    op.execute("DROP INDEX IF EXISTS idx_assets_tags_gin")

    # Drop the columns
    op.drop_column('assets', 'style_tags')
    op.drop_column('assets', 'tags')


def downgrade() -> None:
    # Re-add the columns (as JSON, not full restoration)
    op.add_column('assets',
        sa.Column('tags', sa.JSON(), nullable=True)
    )
    op.add_column('assets',
        sa.Column('style_tags', sa.JSON(), nullable=True)
    )

    # Re-create GIN indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_assets_tags_gin ON assets USING gin ((tags::jsonb))")
    op.execute("CREATE INDEX IF NOT EXISTS idx_assets_style_tags_gin ON assets USING gin ((style_tags::jsonb))")
