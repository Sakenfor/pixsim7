"""Backfill source_folder name in upload_context for local folder assets.

Revision ID: 20260214_0004
Revises: 20260214_0003
Create Date: 2026-02-14

Resolves local folder assets having source_folder_id but no human-readable
source_folder name in upload_context.  The folder name is looked up from
each user's preferences->'localFolders' array (synced by the frontend).
"""

from alembic import op


revision = "20260214_0004"
down_revision = "20260214_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Build a CTE that unnests the localFolders preference array for each user
    # into (user_id, folder_id, folder_name) rows, then join against assets
    # that have a matching source_folder_id but no source_folder yet.
    op.execute("""
        WITH folder_map AS (
            SELECT
                u.id AS user_id,
                f->>'id' AS folder_id,
                f->>'name' AS folder_name
            FROM users u,
                 jsonb_array_elements(u.preferences->'localFolders') AS f
            WHERE u.preferences->'localFolders' IS NOT NULL
              AND jsonb_typeof(u.preferences->'localFolders') = 'array'
        )
        UPDATE assets a
        SET upload_context = a.upload_context || jsonb_build_object('source_folder', fm.folder_name)
        FROM folder_map fm
        WHERE a.user_id = fm.user_id
          AND a.upload_method = 'local'
          AND a.upload_context IS NOT NULL
          AND a.upload_context->>'source_folder_id' = fm.folder_id
          AND (a.upload_context->>'source_folder') IS NULL
    """)


def downgrade() -> None:
    # Remove the backfilled source_folder key from local assets
    op.execute("""
        UPDATE assets
        SET upload_context = upload_context - 'source_folder'
        WHERE upload_method = 'local'
          AND upload_context IS NOT NULL
          AND upload_context ? 'source_folder'
    """)
