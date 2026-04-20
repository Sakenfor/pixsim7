"""merge heads

Revision ID: b971466cd208
Revises: 20251222_0200, fix_operationtype_enum
Create Date: 2025-12-26 19:03:19.713617

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic
# NOTE: Use hash-based revision IDs (auto-generated) for consistency
# Avoid custom revision names to prevent conflicts in version chain
revision = 'b971466cd208'
down_revision = ('20251222_0200', 'fix_operationtype_enum')
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
