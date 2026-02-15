"""Backfill source_subfolder in upload_context for local folder assets.

Revision ID: 20260215_0002
Revises: 20260215_0001
Create Date: 2026-02-15

Derives source_subfolder from source_relative_path for assets that have
a relative path with at least one directory component.
E.g. "Characters/warrior.png" -> source_subfolder = "Characters"
Files in the folder root (no slash) get no subfolder.
"""

from alembic import op


revision = "20260215_0002"
down_revision = "20260215_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Extract the first path segment from source_relative_path as the subfolder.
    # Only applies to local assets that have a relative path containing '/'.
    op.execute("""
        UPDATE assets
        SET upload_context = upload_context || jsonb_build_object(
            'source_subfolder',
            split_part(upload_context->>'source_relative_path', '/', 1)
        )
        WHERE upload_method = 'local'
          AND upload_context IS NOT NULL
          AND upload_context->>'source_relative_path' IS NOT NULL
          AND upload_context->>'source_relative_path' LIKE '%/%'
          AND (upload_context->>'source_subfolder') IS NULL
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE assets
        SET upload_context = upload_context - 'source_subfolder'
        WHERE upload_method = 'local'
          AND upload_context IS NOT NULL
          AND upload_context ? 'source_subfolder'
    """)
