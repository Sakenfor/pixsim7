"""Add missing operationtype enum values

Revision ID: add_missing_operationtype
Revises: 20260112_0002_add_clip_sequences
Create Date: 2026-01-17

Adds enum values that exist in Python OperationType but may be missing from
the PostgreSQL enum:
- image_to_video
- video_transition (was in original migration but may have been skipped)
- frame_extraction
- image_edit
- image_composite
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = '20260117_0001'
down_revision = '20260112_0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add all potentially missing enum values
    # ADD VALUE IF NOT EXISTS is safe - won't error if value already exists
    op.execute("ALTER TYPE operationtype ADD VALUE IF NOT EXISTS 'image_to_video'")
    op.execute("ALTER TYPE operationtype ADD VALUE IF NOT EXISTS 'video_transition'")
    op.execute("ALTER TYPE operationtype ADD VALUE IF NOT EXISTS 'frame_extraction'")
    op.execute("ALTER TYPE operationtype ADD VALUE IF NOT EXISTS 'image_edit'")
    op.execute("ALTER TYPE operationtype ADD VALUE IF NOT EXISTS 'image_composite'")


def downgrade() -> None:
    # Can't remove enum values in PostgreSQL
    pass
