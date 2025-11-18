"""Add session versioning for optimistic locking

Revision ID: 1118addsessionver
Revises: 1117unifygenmodel
Create Date: 2025-11-18 00:00:00

Adds version field to game_sessions table to support optimistic locking
and conflict resolution for concurrent session updates.
"""
from alembic import op
import sqlalchemy as sa

revision = '1118addsessionver'
down_revision = '20251117_unify_gen'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add version column to game_sessions
    op.add_column('game_sessions', sa.Column('version', sa.Integer(), nullable=False, server_default='1'))


def downgrade() -> None:
    # Remove version column from game_sessions
    op.drop_column('game_sessions', 'version')
