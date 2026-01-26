"""
Revision ID: 20260118_0001
Revises: 20260117_0001
Create Date: 2026-01-18

Adds item_templates and game_items tables for template and runtime item entities.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '20260118_0001'
down_revision = '20260117_0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'item_templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('item_id', sa.String(length=200), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=True),
        sa.Column('display_name', sa.String(length=200), nullable=True),
        sa.Column('category', sa.String(length=100), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('tags', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('template_metadata', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('stats', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('stats_metadata', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_index('ix_item_templates_item_id', 'item_templates', ['item_id'], unique=True)
    op.create_index('ix_item_templates_category', 'item_templates', ['category'])
    op.create_index('ix_item_templates_is_active', 'item_templates', ['is_active'])

    op.create_table(
        'game_items',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('meta', postgresql.JSONB(), nullable=True),
        sa.Column('stats', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('stats_metadata', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )


def downgrade() -> None:
    op.drop_table('game_items')
    op.drop_index('ix_item_templates_is_active', table_name='item_templates')
    op.drop_index('ix_item_templates_category', table_name='item_templates')
    op.drop_index('ix_item_templates_item_id', table_name='item_templates')
    op.drop_table('item_templates')
