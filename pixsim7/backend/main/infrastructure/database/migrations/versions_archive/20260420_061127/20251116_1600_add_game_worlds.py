"""Add game_worlds and game_world_states tables

Revision ID: 1116addgameworlds
Revises: 1116addgametables
Create Date: 2025-11-16 16:00:00

Adds tables for:
- GameWorld (authored world metadata)
- GameWorldState (per-world global time/state)
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '1116addgameworlds'
down_revision = '1116addgametables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'game_worlds',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('owner_user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('meta', postgresql.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_game_worlds_owner_user_id'), 'game_worlds', ['owner_user_id'], unique=False)
    op.create_index(op.f('ix_game_worlds_created_at'), 'game_worlds', ['created_at'], unique=False)

    op.create_table(
        'game_world_states',
        sa.Column('world_id', sa.Integer(), nullable=False),
        sa.Column('world_time', sa.Float(), nullable=False),
        sa.Column('last_advanced_at', sa.DateTime(), nullable=False),
        sa.Column('meta', postgresql.JSON(), nullable=True),
        sa.ForeignKeyConstraint(['world_id'], ['game_worlds.id'], ),
        sa.PrimaryKeyConstraint('world_id'),
    )
    op.create_index(op.f('ix_game_world_states_last_advanced_at'), 'game_world_states', ['last_advanced_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_game_world_states_last_advanced_at'), table_name='game_world_states')
    op.drop_table('game_world_states')

    op.drop_index(op.f('ix_game_worlds_created_at'), table_name='game_worlds')
    op.drop_index(op.f('ix_game_worlds_owner_user_id'), table_name='game_worlds')
    op.drop_table('game_worlds')

