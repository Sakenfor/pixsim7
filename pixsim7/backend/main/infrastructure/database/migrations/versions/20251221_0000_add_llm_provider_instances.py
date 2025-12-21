"""Add LLM provider instances table

Revision ID: 20251221_0000
Revises: 20251218_0300
Create Date: 2025-12-21 00:00:00.000000

Add llm_provider_instances table for configurable LLM provider profiles.
Allows multiple named configurations per provider type (e.g., multiple
cmd-llm instances for different backends like Claude CLI, Ollama, etc.)
"""
from alembic import op
import sqlalchemy as sa


revision = '20251221_0000'
down_revision = '20251218_0300'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create llm_provider_instances table."""
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

    # Index for listing instances by provider
    op.create_index(
        'idx_llm_instances_provider_enabled',
        'llm_provider_instances',
        ['provider_id', 'enabled'],
        unique=False
    )


def downgrade() -> None:
    """Drop llm_provider_instances table."""
    op.drop_index('idx_llm_instances_provider_enabled', table_name='llm_provider_instances')
    op.drop_table('llm_provider_instances')
