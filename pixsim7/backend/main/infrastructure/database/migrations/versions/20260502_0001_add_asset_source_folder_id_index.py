"""add idx_asset_gallery_source_folder_id

Filtering the gallery by `source_folder_id` (the local folder an asset was
imported from) had no covering index, so Postgres post-filtered each
candidate row via the JSONB extract on `upload_context->>'source_folder_id'`.
For users with a flat folder containing many assets this was slow even with
the default `(user_id, is_archived, asset_kind, searchable, created_at DESC)`
plan path.

This adds a partial expression index modelled on `idx_asset_gallery_source_path`
so the filter can seek directly into matching rows.

Revision ID: 20260502_0001
Revises: 20260427_0003
Create Date: 2026-05-02
"""
from alembic import op


revision = "20260502_0001"
down_revision = "20260427_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_gallery_source_folder_id
        ON assets (
            user_id,
            is_archived,
            asset_kind,
            searchable,
            upload_method,
            ((upload_context->>'source_folder_id')),
            created_at DESC
        )
        WHERE upload_method = 'local'
          AND upload_context IS NOT NULL
          AND (upload_context->>'source_folder_id') IS NOT NULL
          AND (upload_context->>'source_folder_id') <> ''
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute("DROP INDEX IF EXISTS idx_asset_gallery_source_folder_id")
