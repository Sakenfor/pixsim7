"""Add new device types to DeviceType enum

Revision ID: 20251222_0100
Revises: 20251222_0000
Create Date: 2025-12-22 01:00:00.000000

Adds MUMU, NOX, LDPLAYER, and GENYMOTION to the DeviceType enum
to support dynamic device discovery for various Android emulators.
"""
from alembic import op
import sqlalchemy as sa


revision = '20251222_0100'
down_revision = '20251222_0000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new enum values to devicetype enum
    # PostgreSQL requires this syntax to add values to existing enums
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE devicetype ADD VALUE IF NOT EXISTS 'MUMU'")
        op.execute("ALTER TYPE devicetype ADD VALUE IF NOT EXISTS 'NOX'")
        op.execute("ALTER TYPE devicetype ADD VALUE IF NOT EXISTS 'LDPLAYER'")
        op.execute("ALTER TYPE devicetype ADD VALUE IF NOT EXISTS 'GENYMOTION'")


def downgrade() -> None:
    # Note: PostgreSQL does not support removing enum values directly
    # If you need to remove these values, you would need to:
    # 1. Create a new enum type without these values
    # 2. Alter the column to use the new type (with type conversion)
    # 3. Drop the old enum type
    # This is complex and risky, so we're leaving it as a no-op
    # Ensure no devices use these types before attempting manual removal
    pass
