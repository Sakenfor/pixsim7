"""Clean up placeholder video capture filenames.

Revision ID: 20260110_0002
Revises: 20260110_0001
Create Date: 2026-01-10
"""
from alembic import op


revision = "20260110_0002"
down_revision = "20260110_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE assets
        SET upload_context = jsonb_set(upload_context, '{source_site}', '"local"', true)
        WHERE upload_method = 'video_capture'
          AND upload_context IS NOT NULL
          AND upload_context->>'source_site' ~ '^[a-p]{32}$'
        """
    )
    op.execute(
        """
        UPDATE assets
        SET upload_context = jsonb_set(
            jsonb_set(upload_context, '{source_folder}', to_jsonb(upload_context->>'source_site'), true),
            '{source_site}', '"local"', true
        )
        WHERE upload_method = 'video_capture'
          AND upload_context IS NOT NULL
          AND upload_context->>'source_site' IS NOT NULL
          AND upload_context->>'source_site' <> ''
          AND upload_context->>'source_site' NOT IN ('local', 'localhost')
          AND upload_context->>'source_site' !~ '\\.'
          AND upload_context->>'source_site' !~ '^[a-p]{32}$'
          AND (upload_context->>'source_folder' IS NULL OR upload_context->>'source_folder' = '')
        """
    )
    op.execute(
        """
        UPDATE assets
        SET upload_context = upload_context - 'source_filename'
        WHERE upload_method = 'video_capture'
          AND upload_context IS NOT NULL
          AND upload_context->>'source' = 'video_player'
          AND upload_context->>'source_filename' IN (
            'Video',
            'Remote Video',
            'PixSim7 Asset',
            'Source Video',
            'Source'
          )
        """
    )


def downgrade() -> None:
    # No-op: removed placeholder filenames cannot be restored safely.
    pass
