"""add_device_last_used_at

Revision ID: device_last_used
Revises: 1202droprelations
Create Date: 2025-12-03 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'device_last_used'
down_revision = '1202droprelations'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add last_used_at column to android_devices table.

    This field tracks when a device was last used for an execution,
    enabling LRU (Least Recently Used) device selection algorithm
    for fair load distribution across the device pool.
    """
    op.add_column('android_devices',
                  sa.Column('last_used_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Remove last_used_at column from android_devices table."""
    op.drop_column('android_devices', 'last_used_at')
