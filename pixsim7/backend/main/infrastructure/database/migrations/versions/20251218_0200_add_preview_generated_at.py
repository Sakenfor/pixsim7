"""add preview_generated_at timestamp

Revision ID: 20251218_0200
Revises: 20251218_0100
Create Date: 2025-12-18 02:00:00.000000

Add preview_generated_at timestamp to track preview derivative generation.
This supports the new high-quality preview generation feature alongside
existing thumbnail generation.
"""
from alembic import op
import sqlalchemy as sa


revision = '20251218_0200'
down_revision = '20251218_0100'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add preview_generated_at timestamp to assets table."""
    op.add_column(
        'assets',
        sa.Column(
            'preview_generated_at',
            sa.DateTime(),
            nullable=True,
            comment='When preview derivative generation completed'
        )
    )


def downgrade() -> None:
    """Remove preview_generated_at timestamp from assets table."""
    op.drop_column('assets', 'preview_generated_at')
