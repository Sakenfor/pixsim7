"""Drop legacy llm_provider_instances table

Revision ID: 20260104_0001
Revises: 20260104_0000
Create Date: 2026-01-04

Removes the legacy llm_provider_instances table after migrating
LLM instances into provider_instances (kind='llm').
"""
from alembic import op
import sqlalchemy as sa


revision = '20260104_0001'
down_revision = '20260104_0000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Drop llm_provider_instances table."""
    op.drop_index('idx_llm_instances_provider_enabled', table_name='llm_provider_instances')
    op.drop_table('llm_provider_instances')


def downgrade() -> None:
    """Recreate llm_provider_instances table and backfill from provider_instances."""
    op.create_table(
        'llm_provider_instances',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column(
            'provider_id',
            sa.String(length=50),
            nullable=False,
            index=True,
            comment='Provider ID this instance configures (e.g., cmd-llm)'
        ),
        sa.Column(
            'label',
            sa.String(length=100),
            nullable=False,
            comment='Display name (e.g., Claude CLI, Local Ollama)'
        ),
        sa.Column(
            'description',
            sa.String(length=500),
            nullable=True,
            comment='Optional description'
        ),
        sa.Column(
            'config',
            sa.JSON(),
            nullable=False,
            server_default='{}',
            comment='Provider-specific configuration (JSON)'
        ),
        sa.Column(
            'enabled',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('true'),
            index=True,
            comment='Whether this instance is active'
        ),
        sa.Column(
            'priority',
            sa.Integer(),
            nullable=False,
            server_default='0',
            comment='Display priority (higher = first)'
        ),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False
        ),
    )

    op.create_index(
        'idx_llm_instances_provider_enabled',
        'llm_provider_instances',
        ['provider_id', 'enabled'],
        unique=False
    )

    op.execute(
        "INSERT INTO llm_provider_instances "
        "(provider_id, label, description, config, enabled, priority, created_at, updated_at) "
        "SELECT provider_id, label, description, config, enabled, priority, created_at, updated_at "
        "FROM provider_instances WHERE kind = 'llm'"
    )
