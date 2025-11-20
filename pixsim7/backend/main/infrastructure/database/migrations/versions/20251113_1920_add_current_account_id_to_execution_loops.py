"""add current_account_id to execution_loops

Revision ID: a1b2c3d4e5f6
Revises: 295075b0482d
Create Date: 2025-11-13 19:20:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '295075b0482d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add current_account_id column to execution_loops table
    op.add_column('execution_loops', sa.Column('current_account_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    # Remove current_account_id column from execution_loops table
    op.drop_column('execution_loops', 'current_account_id')
