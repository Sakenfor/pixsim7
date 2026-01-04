"""Add provider_instances shared base table

Revision ID: 20260104_0000
Revises: 20251231_0000
Create Date: 2026-01-04

Creates provider_instances table for shared provider instance configs,
and migrates existing LLM instances into it.
"""
from alembic import op
import sqlalchemy as sa


revision = '20260104_0000'
down_revision = '20251231_0000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create provider_instances table and migrate LLM instances."""
    kind_enum = sa.Enum(
        "llm",
        "analyzer",
        name="_provider_instance_kind",
        native_enum=False,
        create_constraint=False,
    )

    op.create_table(
        'provider_instances',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('kind', kind_enum, nullable=False),
        sa.Column('provider_id', sa.String(length=50), nullable=False),
        sa.Column('owner_user_id', sa.Integer(), nullable=True),
        sa.Column('label', sa.String(length=100), nullable=False),
        sa.Column('description', sa.String(length=500), nullable=True),
        sa.Column('config', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('priority', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['owner_user_id'], ['users.id']),
    )

    op.create_index(
        'idx_provider_instances_kind_provider_enabled',
        'provider_instances',
        ['kind', 'provider_id', 'enabled'],
        unique=False
    )
    op.create_index(
        'idx_provider_instances_owner_kind',
        'provider_instances',
        ['owner_user_id', 'kind'],
        unique=False
    )

    op.execute(
        "INSERT INTO provider_instances "
        "(kind, provider_id, owner_user_id, label, description, config, enabled, priority, created_at, updated_at) "
        "SELECT 'llm', provider_id, NULL, label, description, config, enabled, priority, created_at, updated_at "
        "FROM llm_provider_instances"
    )


def downgrade() -> None:
    """Drop provider_instances table."""
    op.drop_index('idx_provider_instances_owner_kind', table_name='provider_instances')
    op.drop_index('idx_provider_instances_kind_provider_enabled', table_name='provider_instances')
    op.drop_table('provider_instances')
