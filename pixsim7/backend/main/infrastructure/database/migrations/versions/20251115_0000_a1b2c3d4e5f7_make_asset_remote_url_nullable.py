"""make_asset_remote_url_nullable

Revision ID: a1b2c3d4e5f7
Revises: 32e0c9501b5c
Create Date: 2025-11-15 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f7'
down_revision = '32e0c9501b5c'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Make remote_url column nullable in assets table.

    This allows assets to be stored locally without requiring a provider URL.
    Useful for Chrome extension uploads that save locally first, then optionally
    upload to provider.
    """
    # Make remote_url nullable
    op.alter_column('assets', 'remote_url',
                    existing_type=sa.VARCHAR(),
                    nullable=True)


def downgrade() -> None:
    """Revert remote_url to non-nullable.

    Warning: This will fail if any assets have NULL remote_url.
    """
    # Make remote_url non-nullable (will fail if NULLs exist)
    op.alter_column('assets', 'remote_url',
                    existing_type=sa.VARCHAR(),
                    nullable=False)
