"""add is_archived field to assets

Revision ID: 20251218_0300
Revises: 20251218_0200
Create Date: 2025-12-18 03:00:00.000000

Add is_archived boolean field to soft-hide assets from default gallery view.
Archived assets remain in database but are filtered out by default.
"""
from alembic import op
import sqlalchemy as sa


revision = '20251218_0300'
down_revision = '20251218_0200'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add is_archived boolean to assets table with index."""
    op.add_column(
        'assets',
        sa.Column(
            'is_archived',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('false'),
            comment='Soft-hide from default gallery view'
        )
    )
    # Create index for filtering
    op.create_index(
        'idx_asset_is_archived',
        'assets',
        ['is_archived'],
        unique=False
    )


def downgrade() -> None:
    """Remove is_archived field from assets table."""
    op.drop_index('idx_asset_is_archived', table_name='assets')
    op.drop_column('assets', 'is_archived')
