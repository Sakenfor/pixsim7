"""Add world_id to GameSession for world-aware normalization

Revision ID: 1119addworldid
Revises: 1118advanced
Create Date: 2025-11-19 00:00:00

Adds world_id field to game_sessions table to support world-aware
relationship normalization using per-world schemas.
"""
from alembic import op
import sqlalchemy as sa

revision = '1119addworldid'
down_revision = '1118advanced'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add world_id column to game_sessions
    op.add_column('game_sessions', sa.Column('world_id', sa.Integer(), nullable=True))

    # Add foreign key constraint
    op.create_foreign_key(
        'fk_game_sessions_world_id_game_worlds',
        'game_sessions',
        'game_worlds',
        ['world_id'],
        ['id']
    )

    # Add index for efficient lookups
    op.create_index('ix_game_sessions_world_id', 'game_sessions', ['world_id'])


def downgrade() -> None:
    # Drop index first
    op.drop_index('ix_game_sessions_world_id', table_name='game_sessions')

    # Drop foreign key constraint
    op.drop_constraint('fk_game_sessions_world_id_game_worlds', 'game_sessions', type_='foreignkey')

    # Drop column
    op.drop_column('game_sessions', 'world_id')
