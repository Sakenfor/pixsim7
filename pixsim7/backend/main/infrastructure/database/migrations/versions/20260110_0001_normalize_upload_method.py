"""Normalize legacy upload_method values.

Revision ID: 20260110_0001
Revises: 20260109_0002
Create Date: 2026-01-10
"""
from alembic import op


revision = "20260110_0001"
down_revision = "20260109_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE assets
        SET upload_method = 'pixverse_sync'
        WHERE upload_method IN ('extension_badge', 'extension_pixverse')
        """
    )
    op.execute(
        """
        UPDATE assets
        SET upload_method = 'web'
        WHERE upload_method IN ('extension', 'extension_web', 'api', 'mobile')
        """
    )
    op.execute(
        """
        UPDATE assets
        SET upload_method = 'local'
        WHERE upload_method IN ('local_folders')
        """
    )


def downgrade() -> None:
    # No-op: original legacy values cannot be reliably restored.
    pass
