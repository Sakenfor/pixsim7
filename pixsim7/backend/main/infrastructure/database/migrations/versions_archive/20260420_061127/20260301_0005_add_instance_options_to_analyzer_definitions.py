"""Add instance_options column to analyzer_definitions

Revision ID: 20260301_0005
Revises: 20260301_0004
Create Date: 2026-03-01

Adds instance_options JSON column so analyzer definitions can declare
dynamic instance-level option descriptors for frontend rendering.
"""
from alembic import op
import sqlalchemy as sa


revision = '20260301_0005'
down_revision = '20260301_0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add instance_options JSON column."""
    op.add_column(
        'analyzer_definitions',
        sa.Column('instance_options', sa.JSON(), nullable=False, server_default='[]'),
    )


def downgrade() -> None:
    """Drop instance_options column."""
    op.drop_column('analyzer_definitions', 'instance_options')
