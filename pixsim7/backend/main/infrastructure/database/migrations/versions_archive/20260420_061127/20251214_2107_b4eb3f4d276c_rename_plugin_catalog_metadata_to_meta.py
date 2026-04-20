"""rename plugin_catalog metadata to meta

Revision ID: b4eb3f4d276c
Revises: 42192587e59e
Create Date: 2025-12-14 21:07:52.254566

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic
# NOTE: Use hash-based revision IDs (auto-generated) for consistency
# Avoid custom revision names to prevent conflicts in version chain
revision = 'b4eb3f4d276c'
down_revision = '42192587e59e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Apply migration: rename plugin_catalog metadata to meta"""
    # Check if table exists before renaming column
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if 'plugin_catalog' in inspector.get_table_names():
        # Check if 'metadata' column exists
        columns = [col['name'] for col in inspector.get_columns('plugin_catalog')]
        if 'metadata' in columns:
            op.alter_column('plugin_catalog', 'metadata', new_column_name='meta')


def downgrade() -> None:
    """Revert migration: rename plugin_catalog metadata to meta

    ⚠️ WARNING: This may result in data loss!
    Ensure you have a verified backup before running.
    """
    # Check if table exists before renaming column
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if 'plugin_catalog' in inspector.get_table_names():
        # Check if 'meta' column exists
        columns = [col['name'] for col in inspector.get_columns('plugin_catalog')]
        if 'meta' in columns:
            op.alter_column('plugin_catalog', 'meta', new_column_name='metadata')
