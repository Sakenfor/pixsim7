"""Add pairing_requests table

Revision ID: 20251221_0100
Revises: 20251221_0000
Create Date: 2025-12-21 01:00:00.000000

Replace in-memory pairing state with database-backed storage.
Fixes issue where pairing codes don't work across multiple workers/processes.
"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


revision = '20251221_0100'
down_revision = '20251221_0000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create pairing_requests table."""
    op.create_table(
        'pairing_requests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('agent_id', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('pairing_code', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('host', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('port', sa.Integer(), nullable=False),
        sa.Column('api_port', sa.Integer(), nullable=False),
        sa.Column('version', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column('os_info', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('paired_user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['paired_user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes
    op.create_index(op.f('ix_pairing_requests_id'), 'pairing_requests', ['id'], unique=False)
    op.create_index(op.f('ix_pairing_requests_agent_id'), 'pairing_requests', ['agent_id'], unique=True)
    op.create_index(op.f('ix_pairing_requests_pairing_code'), 'pairing_requests', ['pairing_code'], unique=True)
    op.create_index(op.f('ix_pairing_requests_paired_user_id'), 'pairing_requests', ['paired_user_id'], unique=False)

    # Index for efficient cleanup of expired requests
    op.create_index('ix_pairing_requests_expires_at', 'pairing_requests', ['expires_at'], unique=False)


def downgrade() -> None:
    """Drop pairing_requests table."""
    op.drop_index('ix_pairing_requests_expires_at', table_name='pairing_requests')
    op.drop_index(op.f('ix_pairing_requests_paired_user_id'), table_name='pairing_requests')
    op.drop_index(op.f('ix_pairing_requests_pairing_code'), table_name='pairing_requests')
    op.drop_index(op.f('ix_pairing_requests_agent_id'), table_name='pairing_requests')
    op.drop_index(op.f('ix_pairing_requests_id'), table_name='pairing_requests')
    op.drop_table('pairing_requests')
