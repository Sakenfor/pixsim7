"""add asset search indexes

Add indexes to support efficient asset search and filtering:
- B-tree index on media_type for filter queries
- Composite index on (user_id, searchable, created_at) for default query pattern
- Partial index on (width, height) for dimension filtering
- GIN trigram index on description for efficient ILIKE text search (Postgres-specific)

Revision ID: 20251230_0100
Revises: 20251230_0000
Create Date: 2025-12-30
"""
from alembic import op
import sqlalchemy as sa

revision = '20251230_0100'
down_revision = '20251230_0000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add indexes for asset search filters."""
    bind = op.get_bind()

    # Single-column index on media_type
    # (idx_asset_sync_media exists but is composite on sync_status + media_type)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_asset_media_type
        ON assets (media_type)
    """)

    # Composite index for searchable + user + date (common default query pattern)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_asset_user_searchable_created
        ON assets (user_id, searchable, created_at DESC)
    """)

    # Dimension filtering (partial - only when dimensions exist)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_asset_dimensions
        ON assets (width, height)
        WHERE width IS NOT NULL AND height IS NOT NULL
    """)

    # pg_trgm extension for efficient ILIKE text search (Postgres-specific)
    if bind.dialect.name == 'postgresql':
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        op.execute("""
            CREATE INDEX IF NOT EXISTS idx_asset_description_trgm
            ON assets USING gin (description gin_trgm_ops)
            WHERE description IS NOT NULL
        """)


def downgrade() -> None:
    """Drop asset search indexes."""
    bind = op.get_bind()

    # Drop Postgres-specific trigram index
    if bind.dialect.name == 'postgresql':
        op.execute("DROP INDEX IF EXISTS idx_asset_description_trgm")

    op.execute("DROP INDEX IF EXISTS idx_asset_dimensions")
    op.execute("DROP INDEX IF EXISTS idx_asset_user_searchable_created")
    op.execute("DROP INDEX IF EXISTS idx_asset_media_type")
