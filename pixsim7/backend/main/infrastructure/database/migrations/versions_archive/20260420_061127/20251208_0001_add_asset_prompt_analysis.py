"""add prompt_analysis column to assets table

Revision ID: b2c3d4e5f6a9
Revises: a1b2c3d4e5f8
Create Date: 2025-12-08 00:01:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'b2c3d4e5f6a9'
down_revision = 'a1b2c3d4e5f8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add prompt_analysis column to assets table
    op.add_column(
        'assets',
        sa.Column('prompt_analysis', sa.JSON(), nullable=True)
    )


def downgrade() -> None:
    # Remove prompt_analysis column from assets table
    op.drop_column('assets', 'prompt_analysis')
