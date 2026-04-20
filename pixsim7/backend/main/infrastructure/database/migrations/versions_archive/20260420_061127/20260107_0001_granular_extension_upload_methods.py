"""Split extension uploads into Pixverse vs Web badge

Revision ID: 20260107_0001
Revises: 20260106_0001
Create Date: 2026-01-07

This migration splits extension-sourced assets into two categories:
- extension_pixverse: Badge used on Pixverse site (syncing your own content)
- extension_web: Badge used on other sites (Pinterest, Google, etc.)

Also fixes miscategorized generated assets.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260107_0001'
down_revision = '20260106_0001'
branch_labels = None
depends_on = None


def upgrade():
    # First consolidate to extension_badge, then split into pixverse vs web

    # 1. Consolidate badge sources
    op.execute("""
        UPDATE assets
        SET upload_method = 'extension_badge'
        WHERE upload_method IN ('extension', 'api')
        AND provider_id = 'pixverse'
    """)

    # 2. Fix miscategorized generated assets
    op.execute("""
        UPDATE assets
        SET upload_method = 'generated'
        WHERE upload_method = 'extension_badge'
        AND media_metadata->>'prompt' IS NOT NULL
    """)

    # 3. Split: Pixverse badge (auto-sync + your own content)
    op.execute("""
        UPDATE assets
        SET upload_method = 'extension_pixverse'
        WHERE upload_method = 'extension_badge'
        AND (
            media_metadata->>'source' = 'extension_badge'
            OR media_metadata->>'pixverse_asset_uuid' IS NOT NULL
            OR media_metadata->>'image_id' IS NOT NULL
            OR (provider_id = 'pixverse'
                AND media_metadata->'upload_attribution' IS NULL
                AND media_metadata->'upload_history' IS NULL)
        )
    """)

    # 4. Split: Web badge (Pinterest, Google, etc.)
    op.execute("""
        UPDATE assets
        SET upload_method = 'extension_web'
        WHERE upload_method = 'extension_badge'
        AND (
            media_metadata->'upload_attribution'->>'source_site' IS NOT NULL
            OR media_metadata->'upload_history'->'context'->>'source_site' IS NOT NULL
            OR media_metadata->'upload_attribution'->>'source_url' LIKE 'file://%'
        )
    """)

    # 5. Remaining badge assets default to extension_web
    op.execute("""
        UPDATE assets
        SET upload_method = 'extension_web'
        WHERE upload_method = 'extension_badge'
    """)


def downgrade():
    # Revert badge uploads back to generic 'extension'
    op.execute("""
        UPDATE assets
        SET upload_method = 'extension'
        WHERE upload_method IN ('extension_pixverse', 'extension_web')
    """)
