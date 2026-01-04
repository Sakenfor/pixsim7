"""Add analyzer fields to provider_instances

Revision ID: 20260104_0002
Revises: 20260104_0001
Create Date: 2026-01-04

Adds analyzer_id and model_id columns to provider_instances.
"""
from alembic import op
import sqlalchemy as sa


revision = '20260104_0002'
down_revision = '20260104_0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add analyzer_id and model_id columns."""
    op.add_column(
        'provider_instances',
        sa.Column('analyzer_id', sa.String(length=100), nullable=True)
    )
    op.add_column(
        'provider_instances',
        sa.Column('model_id', sa.String(length=100), nullable=True)
    )
    op.create_index(
        'idx_provider_instances_analyzer_id',
        'provider_instances',
        ['analyzer_id'],
        unique=False
    )


def downgrade() -> None:
    """Drop analyzer_id and model_id columns."""
    op.drop_index('idx_provider_instances_analyzer_id', table_name='provider_instances')
    op.drop_column('provider_instances', 'model_id')
    op.drop_column('provider_instances', 'analyzer_id')
