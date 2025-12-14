"""merge heads

Revision ID: 42192587e59e
Revises: g8h9i0j1k2l3, 20251214_1400
Create Date: 2025-12-14 20:57:30.131983

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic
# NOTE: Use hash-based revision IDs (auto-generated) for consistency
# Avoid custom revision names to prevent conflicts in version chain
revision = '42192587e59e'
down_revision = ('g8h9i0j1k2l3', '20251214_1400')
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Apply migration: merge heads"""
    pass


def downgrade() -> None:
    """Revert migration: merge heads

    ⚠️ WARNING: This may result in data loss!
    Ensure you have a verified backup before running.
    """
    pass
