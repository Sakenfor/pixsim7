"""add plugin_catalog table

Revision ID: add_plugin_catalog
Revises: 20251215_0027
Create Date: 2025-12-15 01:00:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = 'add_plugin_catalog'
down_revision = '20251215_0027'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create plugin_catalog table"""
    op.create_table(
        'plugin_catalog',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('plugin_id', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('version', sa.String(length=20), nullable=False, server_default='1.0.0'),
        sa.Column('author', sa.String(length=100), nullable=True),
        sa.Column('icon', sa.String(length=50), nullable=True),
        sa.Column('family', sa.String(length=50), nullable=True),
        sa.Column('plugin_type', sa.String(length=50), nullable=False),
        sa.Column('tags', postgresql.JSONB(astext_type=sa.Text()), nullable=True, server_default='[]'),
        sa.Column('bundle_url', sa.String(), nullable=True),
        sa.Column('manifest_url', sa.String(), nullable=True),
        sa.Column('is_builtin', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_available', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('meta', postgresql.JSONB(astext_type=sa.Text()), nullable=True, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('plugin_id')
    )
    op.create_index(op.f('ix_plugin_catalog_plugin_id'), 'plugin_catalog', ['plugin_id'], unique=False)


def downgrade() -> None:
    """Drop plugin_catalog table"""
    op.drop_index(op.f('ix_plugin_catalog_plugin_id'), table_name='plugin_catalog')
    op.drop_table('plugin_catalog')
