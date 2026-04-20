"""Fix operationtype enum values

Revision ID: fix_operationtype_enum
Revises: 26e6eae32247
Create Date: 2025-12-26 16:12:00.000000

Fixes:
1. Rename IMAGE_TO_IMAGE (uppercase) to image_to_image (lowercase) to match other values
2. Add missing text_to_image enum value
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'fix_operationtype_enum'
down_revision = '26e6eae32247'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Fix uppercase IMAGE_TO_IMAGE -> lowercase image_to_image (PostgreSQL 10+)
    # First check if the uppercase version exists and rename it
    op.execute("""
        DO $$
        BEGIN
            -- Check if IMAGE_TO_IMAGE exists and rename to lowercase
            IF EXISTS (
                SELECT 1 FROM pg_enum
                WHERE enumlabel = 'IMAGE_TO_IMAGE'
                AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'operationtype')
            ) THEN
                ALTER TYPE operationtype RENAME VALUE 'IMAGE_TO_IMAGE' TO 'image_to_image';
            END IF;
        EXCEPTION
            WHEN others THEN
                -- Ignore if already lowercase or doesn't exist
                NULL;
        END $$;
    """)

    # Add text_to_image if not exists
    op.execute("ALTER TYPE operationtype ADD VALUE IF NOT EXISTS 'text_to_image'")


def downgrade() -> None:
    # Can't remove enum values in PostgreSQL
    pass
