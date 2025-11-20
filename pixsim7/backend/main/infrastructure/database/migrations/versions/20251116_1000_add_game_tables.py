"""Add game tables (scenes, sessions, locations, NPCs)

Revision ID: 1116addgametables
Revises: 1105simplifylineage
Create Date: 2025-11-16 10:00:00

Consolidated game backend into main backend (Phase 1 of architecture simplification).
Adds tables for:
- Game scenes (GameScene, GameSceneNode, GameSceneEdge)
- Game sessions (GameSession, GameSessionEvent)
- Game world (GameLocation, GameNPC, NPCSchedule, NPCState)
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '1116addgametables'
down_revision = '1105simplifylineage'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create game_scenes table
    op.create_table('game_scenes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=128), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('entry_node_id', sa.Integer(), nullable=True),
        sa.Column('meta', postgresql.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_game_scenes_created_at'), 'game_scenes', ['created_at'], unique=False)

    # Create game_scene_nodes table
    op.create_table('game_scene_nodes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('scene_id', sa.Integer(), nullable=False),
        sa.Column('asset_id', sa.Integer(), nullable=False),
        sa.Column('label', sa.String(length=128), nullable=True),
        sa.Column('loopable', sa.Boolean(), nullable=False),
        sa.Column('skippable', sa.Boolean(), nullable=False),
        sa.Column('reveal_choices_at_sec', sa.Float(), nullable=True),
        sa.Column('meta', postgresql.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['scene_id'], ['game_scenes.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_scene_node_scene', 'game_scene_nodes', ['scene_id'], unique=False)
    op.create_index(op.f('ix_game_scene_nodes_asset_id'), 'game_scene_nodes', ['asset_id'], unique=False)
    op.create_index(op.f('ix_game_scene_nodes_created_at'), 'game_scene_nodes', ['created_at'], unique=False)
    op.create_index(op.f('ix_game_scene_nodes_scene_id'), 'game_scene_nodes', ['scene_id'], unique=False)

    # Add foreign key from game_scenes to game_scene_nodes (for entry_node_id)
    op.create_foreign_key('fk_game_scenes_entry_node', 'game_scenes', 'game_scene_nodes', ['entry_node_id'], ['id'])

    # Create game_scene_edges table
    op.create_table('game_scene_edges',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('scene_id', sa.Integer(), nullable=False),
        sa.Column('from_node_id', sa.Integer(), nullable=False),
        sa.Column('to_node_id', sa.Integer(), nullable=False),
        sa.Column('choice_label', sa.String(length=128), nullable=False),
        sa.Column('weight', sa.Float(), nullable=False),
        sa.Column('reveal_at_sec', sa.Float(), nullable=True),
        sa.Column('cooldown_sec', sa.Integer(), nullable=True),
        sa.Column('conditions', postgresql.JSON(), nullable=True),
        sa.Column('effects', postgresql.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['from_node_id'], ['game_scene_nodes.id'], ),
        sa.ForeignKeyConstraint(['scene_id'], ['game_scenes.id'], ),
        sa.ForeignKeyConstraint(['to_node_id'], ['game_scene_nodes.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_scene_edge_from', 'game_scene_edges', ['scene_id', 'from_node_id'], unique=False)
    op.create_index(op.f('ix_game_scene_edges_from_node_id'), 'game_scene_edges', ['from_node_id'], unique=False)
    op.create_index(op.f('ix_game_scene_edges_scene_id'), 'game_scene_edges', ['scene_id'], unique=False)
    op.create_index(op.f('ix_game_scene_edges_to_node_id'), 'game_scene_edges', ['to_node_id'], unique=False)

    # Create game_sessions table
    op.create_table('game_sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('scene_id', sa.Integer(), nullable=False),
        sa.Column('current_node_id', sa.Integer(), nullable=False),
        sa.Column('flags', postgresql.JSON(), nullable=False),
        sa.Column('relationships', postgresql.JSON(), nullable=False),
        sa.Column('world_time', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['current_node_id'], ['game_scene_nodes.id'], ),
        sa.ForeignKeyConstraint(['scene_id'], ['game_scenes.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_game_sessions_created_at'), 'game_sessions', ['created_at'], unique=False)
    op.create_index(op.f('ix_game_sessions_current_node_id'), 'game_sessions', ['current_node_id'], unique=False)
    op.create_index(op.f('ix_game_sessions_scene_id'), 'game_sessions', ['scene_id'], unique=False)
    op.create_index(op.f('ix_game_sessions_updated_at'), 'game_sessions', ['updated_at'], unique=False)
    op.create_index(op.f('ix_game_sessions_user_id'), 'game_sessions', ['user_id'], unique=False)

    # Create game_session_events table
    op.create_table('game_session_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('session_id', sa.Integer(), nullable=False),
        sa.Column('node_id', sa.Integer(), nullable=True),
        sa.Column('edge_id', sa.Integer(), nullable=True),
        sa.Column('action', sa.String(length=64), nullable=False),
        sa.Column('diff', postgresql.JSON(), nullable=True),
        sa.Column('ts', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['edge_id'], ['game_scene_edges.id'], ),
        sa.ForeignKeyConstraint(['node_id'], ['game_scene_nodes.id'], ),
        sa.ForeignKeyConstraint(['session_id'], ['game_sessions.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_game_session_events_session_id'), 'game_session_events', ['session_id'], unique=False)
    op.create_index(op.f('ix_game_session_events_ts'), 'game_session_events', ['ts'], unique=False)

    # Create game_locations table
    op.create_table('game_locations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=64), nullable=False),
        sa.Column('x', sa.Float(), nullable=False),
        sa.Column('y', sa.Float(), nullable=False),
        sa.Column('meta', postgresql.JSON(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # Create game_npcs table
    op.create_table('game_npcs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=64), nullable=False),
        sa.Column('personality', postgresql.JSON(), nullable=True),
        sa.Column('home_location_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['home_location_id'], ['game_locations.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Create npc_schedules table
    op.create_table('npc_schedules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('npc_id', sa.Integer(), nullable=False),
        sa.Column('day_of_week', sa.Integer(), nullable=False),
        sa.Column('start_time', sa.Float(), nullable=False),
        sa.Column('end_time', sa.Float(), nullable=False),
        sa.Column('location_id', sa.Integer(), nullable=False),
        sa.Column('rule', postgresql.JSON(), nullable=True),
        sa.ForeignKeyConstraint(['location_id'], ['game_locations.id'], ),
        sa.ForeignKeyConstraint(['npc_id'], ['game_npcs.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_npc_schedules_npc_id'), 'npc_schedules', ['npc_id'], unique=False)

    # Create npc_state table
    op.create_table('npc_state',
        sa.Column('npc_id', sa.Integer(), nullable=False),
        sa.Column('current_location_id', sa.Integer(), nullable=True),
        sa.Column('state', postgresql.JSON(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['current_location_id'], ['game_locations.id'], ),
        sa.PrimaryKeyConstraint('npc_id')
    )
    op.create_index(op.f('ix_npc_state_updated_at'), 'npc_state', ['updated_at'], unique=False)


def downgrade() -> None:
    # Drop tables in reverse order (respecting foreign keys)
    op.drop_index(op.f('ix_npc_state_updated_at'), table_name='npc_state')
    op.drop_table('npc_state')

    op.drop_index(op.f('ix_npc_schedules_npc_id'), table_name='npc_schedules')
    op.drop_table('npc_schedules')

    op.drop_table('game_npcs')
    op.drop_table('game_locations')

    op.drop_index(op.f('ix_game_session_events_ts'), table_name='game_session_events')
    op.drop_index(op.f('ix_game_session_events_session_id'), table_name='game_session_events')
    op.drop_table('game_session_events')

    op.drop_index(op.f('ix_game_sessions_user_id'), table_name='game_sessions')
    op.drop_index(op.f('ix_game_sessions_updated_at'), table_name='game_sessions')
    op.drop_index(op.f('ix_game_sessions_scene_id'), table_name='game_sessions')
    op.drop_index(op.f('ix_game_sessions_current_node_id'), table_name='game_sessions')
    op.drop_index(op.f('ix_game_sessions_created_at'), table_name='game_sessions')
    op.drop_table('game_sessions')

    op.drop_index(op.f('ix_game_scene_edges_to_node_id'), table_name='game_scene_edges')
    op.drop_index(op.f('ix_game_scene_edges_scene_id'), table_name='game_scene_edges')
    op.drop_index(op.f('ix_game_scene_edges_from_node_id'), table_name='game_scene_edges')
    op.drop_index('idx_scene_edge_from', table_name='game_scene_edges')
    op.drop_table('game_scene_edges')

    # Drop foreign key from game_scenes to game_scene_nodes before dropping nodes
    op.drop_constraint('fk_game_scenes_entry_node', 'game_scenes', type_='foreignkey')

    op.drop_index(op.f('ix_game_scene_nodes_scene_id'), table_name='game_scene_nodes')
    op.drop_index(op.f('ix_game_scene_nodes_created_at'), table_name='game_scene_nodes')
    op.drop_index(op.f('ix_game_scene_nodes_asset_id'), table_name='game_scene_nodes')
    op.drop_index('idx_scene_node_scene', table_name='game_scene_nodes')
    op.drop_table('game_scene_nodes')

    op.drop_index(op.f('ix_game_scenes_created_at'), table_name='game_scenes')
    op.drop_table('game_scenes')
