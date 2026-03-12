"""Add stats columns to game entities

Revision ID: 1202addentitystats
Revises: exec_preset_nullable
Create Date: 2025-12-02 00:00:00

Adds stats columns to game_npcs, npc_state, game_locations, and
game_sessions to support the abstract stat system with entity-owned stats.

This enables:
- NPCs with base stats (GameNPC.stats)
- Runtime stat overrides (NPCState.stats)
- Location environmental effects (GameLocation.stats)
- Session stat tracking (GameSession.stats)
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '1202addentitystats'
down_revision = 'exec_preset_nullable'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add stats column to game_npcs (base stats)
    op.add_column('game_npcs',
        sa.Column('stats', postgresql.JSONB(), nullable=True, server_default='{}'))

    # Add stats column to npc_state (runtime overrides)
    op.add_column('npc_state',
        sa.Column('stats', postgresql.JSONB(), nullable=True, server_default='{}'))

    # Add stats column to game_locations (environmental effects)
    op.add_column('game_locations',
        sa.Column('stats', postgresql.JSONB(), nullable=True, server_default='{}'))

    # Add stats column to game_sessions (session stat tracking)
    op.add_column('game_sessions',
        sa.Column('stats', postgresql.JSON(), nullable=True, server_default='{}'))


def downgrade() -> None:
    # Remove stats columns
    op.drop_column('game_sessions', 'stats')
    op.drop_column('game_npcs', 'stats')
    op.drop_column('npc_state', 'stats')
    op.drop_column('game_locations', 'stats')
