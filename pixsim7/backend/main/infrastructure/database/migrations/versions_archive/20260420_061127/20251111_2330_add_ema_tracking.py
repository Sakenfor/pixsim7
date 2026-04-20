"""
Alembic migration: Add EMA generation time tracking to provider_accounts

Revision ID: 2330addema
Revises: 2315addginidx
Create Date: 2025-01-11 23:30:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '2330addema'
down_revision = '2315addginidx'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add EMA tracking fields for adaptive generation time estimates"""
    op.add_column('provider_accounts', sa.Column('ema_generation_time_sec', sa.Float(), nullable=True))
    op.add_column('provider_accounts', sa.Column('ema_alpha', sa.Float(), nullable=False, server_default='0.3'))


def downgrade() -> None:
    """Remove EMA tracking fields"""
    op.drop_column('provider_accounts', 'ema_alpha')
    op.drop_column('provider_accounts', 'ema_generation_time_sec')
