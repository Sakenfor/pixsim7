"""
Add api_keys JSON column to provider_accounts

Revision ID: 20251121apikeys
Revises: d1376070c77e
Create Date: 2025-11-21
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

# revision identifiers, used by Alembic.
revision = '20251121apikeys'
down_revision = 'd1376070c77e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add api_keys JSON column for multiple API keys per account"""
    op.add_column('provider_accounts', sa.Column('api_keys', JSON, nullable=True))


def downgrade() -> None:
    """Remove api_keys column"""
    op.drop_column('provider_accounts', 'api_keys')
