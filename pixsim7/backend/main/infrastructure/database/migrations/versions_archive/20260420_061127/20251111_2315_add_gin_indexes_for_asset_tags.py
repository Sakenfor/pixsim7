"""Add GIN indexes for asset tags/style_tags

Revision ID: 2315addginidx
Revises: daa977a0bfa9
Create Date: 2025-11-11 23:15:00

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '2315addginidx'
down_revision = 'daa977a0bfa9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use expression indexes casting JSON to JSONB for GIN
    op.execute("CREATE INDEX IF NOT EXISTS idx_assets_tags_gin ON assets USING gin ((tags::jsonb))")
    op.execute("CREATE INDEX IF NOT EXISTS idx_assets_style_tags_gin ON assets USING gin ((style_tags::jsonb))")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_assets_style_tags_gin")
    op.execute("DROP INDEX IF EXISTS idx_assets_tags_gin")
