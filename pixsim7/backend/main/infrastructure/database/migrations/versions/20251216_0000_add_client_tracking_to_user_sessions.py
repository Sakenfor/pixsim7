"""add client tracking to user_sessions

Revision ID: 20251216_0000
Revises: 20251215_0035
Create Date: 2025-12-16 00:00:00

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '20251216_0000'
down_revision = '20251215_0035'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add client tracking fields to user_sessions table"""
    # Add client_id column (nullable)
    op.add_column('user_sessions',
        sa.Column('client_id', sa.String(length=255), nullable=True)
    )

    # Add client_type column (nullable)
    op.add_column('user_sessions',
        sa.Column('client_type', sa.String(length=50), nullable=True)
    )

    # Add client_name column (nullable)
    op.add_column('user_sessions',
        sa.Column('client_name', sa.String(length=255), nullable=True)
    )

    # Create index on client_id for faster lookups
    op.create_index(
        'ix_user_sessions_client_id',
        'user_sessions',
        ['client_id'],
        unique=False
    )


def downgrade() -> None:
    """Remove client tracking fields from user_sessions table"""
    op.drop_index('ix_user_sessions_client_id', table_name='user_sessions')
    op.drop_column('user_sessions', 'client_name')
    op.drop_column('user_sessions', 'client_type')
    op.drop_column('user_sessions', 'client_id')
