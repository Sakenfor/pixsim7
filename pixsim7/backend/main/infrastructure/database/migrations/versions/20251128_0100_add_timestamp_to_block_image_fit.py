"""Add timestamp_sec to block_image_fits for video frame-level feedback

Revision ID: 1128timestamp
Revises: 1128blockimagefit
Create Date: 2025-11-28 01:00:00

This migration adds optional timestamp support to block_image_fits for Task 90.

Features:
- Adds timestamp_sec column to capture specific moments in video assets
- Nullable to maintain backward compatibility with existing records
- Enables frame-level feedback for block-to-video fit ratings
"""
from alembic import op
import sqlalchemy as sa

revision = '1128timestamp'
down_revision = '1128blockimagefit'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add timestamp_sec column for video timestamp ratings."""
    op.add_column(
        'block_image_fits',
        sa.Column('timestamp_sec', sa.Float(), nullable=True,
                  comment='Optional timestamp in seconds within the asset (video) where this rating applies')
    )


def downgrade() -> None:
    """Remove timestamp_sec column."""
    op.drop_column('block_image_fits', 'timestamp_sec')
