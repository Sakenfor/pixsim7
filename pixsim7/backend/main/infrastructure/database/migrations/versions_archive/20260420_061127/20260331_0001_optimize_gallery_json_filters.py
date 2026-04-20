"""optimize gallery json filter indexes

Add expression indexes for frequently-used gallery filters that read from
upload_context JSONB and improve index coverage for "More from..." flows.

Revision ID: 20260331_0001
Revises: 20260330_0002
Create Date: 2026-03-31
"""
from alembic import op


revision = "20260331_0001"
down_revision = "20260330_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    # upload_context->>'source_site'
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_gallery_source_site
        ON assets (
            user_id,
            is_archived,
            asset_kind,
            searchable,
            upload_method,
            ((upload_context->>'source_site')),
            created_at DESC
        )
        WHERE upload_context IS NOT NULL
          AND (upload_context->>'source_site') IS NOT NULL
          AND (upload_context->>'source_site') <> ''
        """
    )

    # Unified source_path expression: folder/subfolder (or just folder)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_gallery_source_path
        ON assets (
            user_id,
            is_archived,
            asset_kind,
            searchable,
            upload_method,
            (
                CASE
                    WHEN (upload_context->>'source_subfolder') IS NOT NULL
                     AND (upload_context->>'source_subfolder') <> ''
                    THEN (upload_context->>'source_folder') || '/' || (upload_context->>'source_subfolder')
                    ELSE (upload_context->>'source_folder')
                END
            ),
            created_at DESC
        )
        WHERE upload_method = 'local'
          AND upload_context IS NOT NULL
          AND (upload_context->>'source_folder') IS NOT NULL
          AND (upload_context->>'source_folder') <> ''
        """
    )

    # Unified source_filename expression: folder/filename (or just filename)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_gallery_source_filename
        ON assets (
            user_id,
            is_archived,
            asset_kind,
            searchable,
            upload_method,
            (
                CASE
                    WHEN (upload_context->>'source_folder') IS NOT NULL
                     AND (upload_context->>'source_folder') <> ''
                    THEN (upload_context->>'source_folder') || '/' || (upload_context->>'source_filename')
                    ELSE (upload_context->>'source_filename')
                END
            ),
            created_at DESC
        )
        WHERE upload_method = 'video_capture'
          AND upload_context IS NOT NULL
          AND (upload_context->>'source_filename') IS NOT NULL
          AND (upload_context->>'source_filename') <> ''
        """
    )

    # upload_context->>'source_asset_id' (used by source-asset related filters)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_gallery_source_asset_id
        ON assets (
            user_id,
            is_archived,
            asset_kind,
            searchable,
            ((upload_context->>'source_asset_id')),
            created_at DESC
        )
        WHERE upload_context IS NOT NULL
          AND (upload_context->>'source_asset_id') IS NOT NULL
          AND (upload_context->>'source_asset_id') <> ''
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute("DROP INDEX IF EXISTS idx_asset_gallery_source_asset_id")
    op.execute("DROP INDEX IF EXISTS idx_asset_gallery_source_filename")
    op.execute("DROP INDEX IF EXISTS idx_asset_gallery_source_path")
    op.execute("DROP INDEX IF EXISTS idx_asset_gallery_source_site")
