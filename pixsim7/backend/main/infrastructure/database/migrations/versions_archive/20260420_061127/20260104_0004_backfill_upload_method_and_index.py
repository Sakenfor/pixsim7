"""Backfill upload_method from JSON and add index

Revision ID: 20260104_0004
Revises: 20260104_0003
Create Date: 2026-01-04

This migration:
1. Backfills upload_method column from media_metadata->upload_history->context->source
   (or media_metadata->upload_history->source for newer format)
2. Adds an index on upload_method for efficient filtering
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260104_0004'
down_revision = '20260104_0003'
branch_labels = None
depends_on = None


def upgrade():
    # Backfill upload_method from JSON metadata
    # Handle both old format (upload_history.context.source) and new format (upload_history.source)
    op.execute("""
        UPDATE assets
        SET upload_method = COALESCE(
            media_metadata->'upload_history'->'context'->>'source',
            media_metadata->'upload_history'->>'source'
        )
        WHERE upload_method IS NULL
        AND media_metadata IS NOT NULL
        AND (
            media_metadata->'upload_history'->'context'->>'source' IS NOT NULL
            OR media_metadata->'upload_history'->>'source' IS NOT NULL
        )
    """)

    # Set upload_method='generated' for assets created from generations (have source_generation_id)
    op.execute("""
        UPDATE assets
        SET upload_method = 'generated'
        WHERE upload_method IS NULL
        AND source_generation_id IS NOT NULL
    """)

    # Add index on upload_method for efficient filtering
    op.create_index(
        'idx_asset_upload_method',
        'assets',
        ['upload_method'],
        postgresql_where=sa.text("upload_method IS NOT NULL")
    )


def downgrade():
    op.drop_index('idx_asset_upload_method', table_name='assets')
    # Note: We don't clear upload_method values on downgrade as that would lose data
