"""Rename provider_instances to provider_instance_configs

Revision ID: 20260104_0003
Revises: 20260104_0002
Create Date: 2026-01-04

Renames provider_instances table to provider_instance_configs and updates
index names for clarity.
"""
from alembic import op


revision = '20260104_0003'
down_revision = '20260104_0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Rename provider_instances table and indexes."""
    op.rename_table('provider_instances', 'provider_instance_configs')

    op.drop_index(
        'idx_provider_instances_kind_provider_enabled',
        table_name='provider_instance_configs',
    )
    op.create_index(
        'idx_provider_instance_configs_kind_provider_enabled',
        'provider_instance_configs',
        ['kind', 'provider_id', 'enabled'],
        unique=False,
    )

    op.drop_index(
        'idx_provider_instances_owner_kind',
        table_name='provider_instance_configs',
    )
    op.create_index(
        'idx_provider_instance_configs_owner_kind',
        'provider_instance_configs',
        ['owner_user_id', 'kind'],
        unique=False,
    )

    op.drop_index(
        'idx_provider_instances_analyzer_id',
        table_name='provider_instance_configs',
    )
    op.create_index(
        'idx_provider_instance_configs_analyzer_id',
        'provider_instance_configs',
        ['analyzer_id'],
        unique=False,
    )


def downgrade() -> None:
    """Rename provider_instance_configs table and indexes back."""
    op.drop_index(
        'idx_provider_instance_configs_analyzer_id',
        table_name='provider_instance_configs',
    )
    op.drop_index(
        'idx_provider_instance_configs_owner_kind',
        table_name='provider_instance_configs',
    )
    op.drop_index(
        'idx_provider_instance_configs_kind_provider_enabled',
        table_name='provider_instance_configs',
    )

    op.rename_table('provider_instance_configs', 'provider_instances')

    op.create_index(
        'idx_provider_instances_kind_provider_enabled',
        'provider_instances',
        ['kind', 'provider_id', 'enabled'],
        unique=False,
    )
    op.create_index(
        'idx_provider_instances_owner_kind',
        'provider_instances',
        ['owner_user_id', 'kind'],
        unique=False,
    )
    op.create_index(
        'idx_provider_instances_analyzer_id',
        'provider_instances',
        ['analyzer_id'],
        unique=False,
    )
