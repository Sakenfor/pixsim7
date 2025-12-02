"""Drop relationships column from game_sessions

Revision ID: 1202droprelations
Revises: 1202addentitystats
Create Date: 2025-12-02 01:00:00

Removes the deprecated relationships JSONB column from game_sessions table.
Relationship data is now stored exclusively in stats['relationships'].

This completes the migration to the abstract stat system for relationships.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '1202droprelations'
down_revision = '1202addentitystats'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the deprecated relationships column
    op.drop_column('game_sessions', 'relationships')


def downgrade() -> None:
    # Re-add relationships column if needed (for rollback)
    op.add_column('game_sessions',
        sa.Column('relationships', postgresql.JSONB(), nullable=True, server_default='{}'))
