"""Add asset columns to game_locations table

Revision ID: 20251222_0000
Revises: 20251221_0100
Create Date: 2025-12-22 00:00:00.000000

Adds asset_id, default_spawn, and created_at columns to game_locations table.
These columns were added to the model but the migration was missing.
"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime


revision = '20251222_0000'
down_revision = '20251221_0100'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add asset_id column (references assets.id for the primary 3D asset/scene)
    op.add_column('game_locations',
        sa.Column('asset_id', sa.Integer(), nullable=True))

    # Add default_spawn column (name of spawn point node in the primary 3D asset)
    op.add_column('game_locations',
        sa.Column('default_spawn', sa.String(length=128), nullable=True))

    # Add created_at column with default value for existing rows
    op.add_column('game_locations',
        sa.Column('created_at', sa.DateTime(), nullable=True))

    # Set default value for existing rows
    op.execute("UPDATE game_locations SET created_at = NOW() WHERE created_at IS NULL")

    # Make created_at non-nullable after setting defaults
    op.alter_column('game_locations', 'created_at', nullable=False)

    # Create index on created_at
    op.create_index(op.f('ix_game_locations_created_at'), 'game_locations', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_game_locations_created_at'), table_name='game_locations')
    op.drop_column('game_locations', 'created_at')
    op.drop_column('game_locations', 'default_spawn')
    op.drop_column('game_locations', 'asset_id')
