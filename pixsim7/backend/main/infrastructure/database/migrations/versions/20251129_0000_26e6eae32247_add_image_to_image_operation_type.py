"""add image_to_image operation type

Revision ID: 26e6eae32247
Revises: 32e0c9501b5c
Create Date: 2025-11-29 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '26e6eae32247'
down_revision = '32e0c9501b5c'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add image_to_image to the operationtype enum (lowercase to match existing values)
    # PostgreSQL doesn't support ALTER TYPE ... ADD VALUE in a transaction,
    # so we need to use EXECUTE
    op.execute("ALTER TYPE operationtype ADD VALUE IF NOT EXISTS 'image_to_image'")


def downgrade() -> None:
    # PostgreSQL doesn't support removing enum values easily
    # This would require recreating the enum and all dependent columns
    # For now, we'll leave the enum value in place on downgrade
    # If you need to remove it, you'll need to:
    # 1. Create a new enum without IMAGE_TO_IMAGE
    # 2. Alter all columns using operationtype to use the new enum
    # 3. Drop the old enum
    pass
