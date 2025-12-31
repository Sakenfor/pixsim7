"""add device ad tracking fields

Add fields to track device activity and ad watching state:
- current_activity: Stores the currently focused activity on the device
- is_watching_ad: Boolean flag indicating if an ad SDK activity is detected
- ad_session_started_at: Timestamp when ad watching session started (for session-based detection)

Revision ID: 20251231_0000
Revises: 20251230_0100
Create Date: 2025-12-31
"""
from alembic import op
import sqlalchemy as sa

revision = '20251231_0000'
down_revision = '20251230_0100'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add ad tracking columns to android_devices table."""
    op.add_column('android_devices',
                  sa.Column('current_activity', sa.String(255), nullable=True))
    op.add_column('android_devices',
                  sa.Column('is_watching_ad', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('android_devices',
                  sa.Column('ad_session_started_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Remove ad tracking columns from android_devices table."""
    op.drop_column('android_devices', 'ad_session_started_at')
    op.drop_column('android_devices', 'is_watching_ad')
    op.drop_column('android_devices', 'current_activity')
