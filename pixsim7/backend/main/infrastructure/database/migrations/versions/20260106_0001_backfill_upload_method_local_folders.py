"""Backfill upload_method for local folder assets

Revision ID: 20260106_0001
Revises: 20260104_0004
Create Date: 2026-01-06

This migration backfills upload_method='local_folders' for assets that:
1. Have source_folder_id in media_metadata->upload_attribution
2. Have source_folder_id in media_metadata->upload_history->context
3. Have source_folder_id in media_metadata (top-level, legacy)

Also backfills 'extension' for assets with pixverse sync indicators.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260106_0001'
down_revision = '20260104_0006'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Backfill local_folders from upload_attribution.source_folder_id
    op.execute("""
        UPDATE assets
        SET upload_method = 'local_folders'
        WHERE upload_method IS NULL
        AND media_metadata IS NOT NULL
        AND media_metadata->'upload_attribution'->>'source_folder_id' IS NOT NULL
    """)

    # 2. Backfill local_folders from upload_history.context.source_folder_id (legacy path)
    op.execute("""
        UPDATE assets
        SET upload_method = 'local_folders'
        WHERE upload_method IS NULL
        AND media_metadata IS NOT NULL
        AND media_metadata->'upload_history'->'context'->>'source_folder_id' IS NOT NULL
    """)

    # 3. Backfill local_folders from top-level source_folder_id (very old format)
    op.execute("""
        UPDATE assets
        SET upload_method = 'local_folders'
        WHERE upload_method IS NULL
        AND media_metadata IS NOT NULL
        AND media_metadata->>'source_folder_id' IS NOT NULL
    """)

    # 4. Backfill 'extension' for pixverse sync assets (extension_badge source)
    op.execute("""
        UPDATE assets
        SET upload_method = 'extension'
        WHERE upload_method IS NULL
        AND media_metadata IS NOT NULL
        AND (
            media_metadata->>'source' = 'extension_badge'
            OR media_metadata->'upload_attribution'->>'source_url' IS NOT NULL
            OR media_metadata->'upload_attribution'->>'source_site' IS NOT NULL
        )
    """)

    # 5. Backfill 'extension' for assets with pixverse provider and remote URLs
    # (likely synced via extension before upload_method tracking)
    op.execute("""
        UPDATE assets
        SET upload_method = 'extension'
        WHERE upload_method IS NULL
        AND provider_id = 'pixverse'
        AND remote_url LIKE '%media.pixverse.ai%'
        AND source_generation_id IS NULL
    """)


def downgrade():
    # Don't clear values on downgrade as that would lose data
    pass
