"""merge main and game branches

Revision ID: a786922d98aa
Revises: a1b2c3d4e5f7, 1905addactionblocks
Create Date: 2025-11-17 03:40:46.628965

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic
# NOTE: Use hash-based revision IDs (auto-generated) for consistency
# Avoid custom revision names to prevent conflicts in version chain
revision = 'a786922d98aa'
down_revision = ('a1b2c3d4e5f7', '1905addactionblocks')
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Apply migration: merge main and game branches"""
    pass


def downgrade() -> None:
    """Revert migration: merge main and game branches

    ⚠️ WARNING: This may result in data loss!
    Ensure you have a verified backup before running.
    """
    pass
