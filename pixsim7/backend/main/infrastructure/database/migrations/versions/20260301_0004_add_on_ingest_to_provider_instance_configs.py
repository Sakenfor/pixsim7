"""Add on_ingest column to provider_instance_configs

Revision ID: 20260301_0004
Revises: 20260301_0003
Create Date: 2026-03-01

Adds on_ingest boolean flag so analyzer instances can be auto-triggered
during asset ingestion.
"""
from alembic import op
import sqlalchemy as sa


revision = '20260301_0004'
down_revision = '20260301_0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add on_ingest column with index."""
    op.add_column(
        'provider_instance_configs',
        sa.Column('on_ingest', sa.Boolean(), nullable=False, server_default=sa.text('false')),
    )
    op.create_index(
        'idx_provider_instance_configs_on_ingest',
        'provider_instance_configs',
        ['on_ingest'],
        unique=False,
    )


def downgrade() -> None:
    """Drop on_ingest column and index."""
    op.drop_index(
        'idx_provider_instance_configs_on_ingest',
        table_name='provider_instance_configs',
    )
    op.drop_column('provider_instance_configs', 'on_ingest')
