"""
Revision ID: 20260126_0001
Revises: 20260118_0001
Create Date: 2026-01-26

Adds location_templates table for template location entities.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '20260126_0001'
down_revision = '20260118_0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'location_templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('location_id', sa.String(length=200), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=True),
        sa.Column('display_name', sa.String(length=200), nullable=True),
        sa.Column('location_type', sa.String(length=100), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('default_asset_id', sa.Integer(), nullable=True),
        sa.Column('default_spawn', sa.String(length=128), nullable=True),
        sa.Column('tags', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('template_metadata', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('stats', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('stats_metadata', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_index('ix_location_templates_location_id', 'location_templates', ['location_id'], unique=True)
    op.create_index('ix_location_templates_location_type', 'location_templates', ['location_type'])
    op.create_index('ix_location_templates_is_active', 'location_templates', ['is_active'])


def downgrade() -> None:
    op.drop_index('ix_location_templates_is_active', table_name='location_templates')
    op.drop_index('ix_location_templates_location_type', table_name='location_templates')
    op.drop_index('ix_location_templates_location_id', table_name='location_templates')
    op.drop_table('location_templates')
