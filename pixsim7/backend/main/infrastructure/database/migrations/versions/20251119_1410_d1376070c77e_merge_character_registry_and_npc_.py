"""Merge character registry and NPC features branches

Revision ID: d1376070c77e
Revises: 20251118_1300, 1119addworldid
Create Date: 2025-11-19 14:10:40.194141

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic
# NOTE: Use hash-based revision IDs (auto-generated) for consistency
# Avoid custom revision names to prevent conflicts in version chain
revision = 'd1376070c77e'
down_revision = ('20251118_1300', '1119addworldid')
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Apply migration: Merge character registry and NPC features branches"""
    pass


def downgrade() -> None:
    """Revert migration: Merge character registry and NPC features branches

    ⚠️ WARNING: This may result in data loss!
    Ensure you have a verified backup before running.
    """
    pass
