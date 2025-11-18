"""Add NPC memory and emotional state tables

Revision ID: 1118npcmemory
Revises: 1118_1318_d1d65acf1153
Create Date: 2025-11-18 14:00:00

This migration creates tables for NPC conversation memory and emotional states:
- npc_conversation_memories: Stores conversation history and important interactions
- npc_emotional_states: Tracks temporary emotional states that affect dialogue
- npc_conversation_topics: Tracks which topics have been discussed

Features:
- Short-term and long-term memory types
- Memory importance levels (trivial, normal, important, critical)
- Memory decay and expiration
- Emotional states with intensity and duration
- Topic tracking for conversation coherence
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON
from datetime import datetime

revision = '1118npcmemory'
down_revision = '1118_1318_d1d65acf1153'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create npc_conversation_memories table
    op.create_table(
        'npc_conversation_memories',

        # Primary key
        sa.Column('id', sa.Integer, primary_key=True, nullable=False),

        # Foreign keys
        sa.Column('npc_id', sa.Integer, sa.ForeignKey('game_npcs.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('session_id', sa.Integer, sa.ForeignKey('game_sessions.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('user_id', sa.Integer, sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),

        # Memory metadata
        sa.Column('memory_type', sa.String(50), nullable=False, index=True, server_default='short_term'),
        sa.Column('importance', sa.String(50), nullable=False, index=True, server_default='normal'),

        # Memory content
        sa.Column('topic', sa.String(200), nullable=False, index=True),
        sa.Column('summary', sa.Text, nullable=False),
        sa.Column('player_said', sa.Text, nullable=True),
        sa.Column('npc_said', sa.Text, nullable=True),

        # Context
        sa.Column('location_id', sa.Integer, sa.ForeignKey('game_locations.id', ondelete='SET NULL'), nullable=True),
        sa.Column('world_time', sa.Float, nullable=True),

        # Emotional context
        sa.Column('npc_emotion_at_time', sa.String(50), nullable=True),
        sa.Column('relationship_tier_at_time', sa.String(50), nullable=True),

        # Memory strength and decay
        sa.Column('strength', sa.Float, nullable=False, server_default='1.0'),
        sa.Column('access_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('last_accessed_at', sa.DateTime, nullable=True),

        # Tags for easy retrieval
        sa.Column('tags', JSON, nullable=False, server_default='[]'),

        # Additional metadata
        sa.Column('metadata', JSON, nullable=False, server_default='{}'),

        # Timestamps
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
        sa.Column('expires_at', sa.DateTime, nullable=True),
    )

    # Create composite indexes for efficient queries
    op.create_index(
        'idx_npc_user_memories',
        'npc_conversation_memories',
        ['npc_id', 'user_id']
    )

    op.create_index(
        'idx_memory_type_importance',
        'npc_conversation_memories',
        ['memory_type', 'importance']
    )

    # Create npc_emotional_states table
    op.create_table(
        'npc_emotional_states',

        # Primary key
        sa.Column('id', sa.Integer, primary_key=True, nullable=False),

        # Foreign keys
        sa.Column('npc_id', sa.Integer, sa.ForeignKey('game_npcs.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('session_id', sa.Integer, sa.ForeignKey('game_sessions.id', ondelete='SET NULL'), nullable=True, index=True),

        # Emotional state
        sa.Column('emotion', sa.String(50), nullable=False),
        sa.Column('intensity', sa.Float, nullable=False, server_default='0.5'),

        # Duration and decay
        sa.Column('duration_seconds', sa.Float, nullable=True),
        sa.Column('decay_rate', sa.Float, nullable=False, server_default='0.1'),

        # Trigger
        sa.Column('triggered_by', sa.String(200), nullable=True),
        sa.Column('trigger_memory_id', sa.Integer, sa.ForeignKey('npc_conversation_memories.id', ondelete='SET NULL'), nullable=True),

        # Context
        sa.Column('context', JSON, nullable=False, server_default='{}'),

        # State tracking
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true', index=True),

        # Timestamps
        sa.Column('started_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
        sa.Column('expires_at', sa.DateTime, nullable=True),
        sa.Column('ended_at', sa.DateTime, nullable=True),
    )

    # Create composite indexes
    op.create_index(
        'idx_npc_active_emotions',
        'npc_emotional_states',
        ['npc_id', 'is_active']
    )

    op.create_index(
        'idx_session_emotions',
        'npc_emotional_states',
        ['session_id', 'is_active']
    )

    # Create npc_conversation_topics table
    op.create_table(
        'npc_conversation_topics',

        # Primary key
        sa.Column('id', sa.Integer, primary_key=True, nullable=False),

        # Foreign keys
        sa.Column('npc_id', sa.Integer, sa.ForeignKey('game_npcs.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('user_id', sa.Integer, sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),

        # Topic info
        sa.Column('topic_id', sa.String(100), nullable=False, index=True),
        sa.Column('topic_name', sa.String(200), nullable=False),

        # Discussion tracking
        sa.Column('times_discussed', sa.Integer, nullable=False, server_default='1'),
        sa.Column('first_discussed_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
        sa.Column('last_discussed_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),

        # Depth of knowledge
        sa.Column('depth_level', sa.Integer, nullable=False, server_default='1'),

        # Unlocks
        sa.Column('unlocked_sub_topics', JSON, nullable=False, server_default='[]'),

        # Context
        sa.Column('relationship_tier_when_first_discussed', sa.String(50), nullable=True),

        # Metadata
        sa.Column('metadata', JSON, nullable=False, server_default='{}'),
    )

    # Create composite indexes
    op.create_index(
        'idx_npc_user_topics',
        'npc_conversation_topics',
        ['npc_id', 'user_id']
    )


def downgrade() -> None:
    # Drop tables in reverse order (respecting foreign key constraints)
    op.drop_index('idx_npc_user_topics', table_name='npc_conversation_topics')
    op.drop_table('npc_conversation_topics')

    op.drop_index('idx_session_emotions', table_name='npc_emotional_states')
    op.drop_index('idx_npc_active_emotions', table_name='npc_emotional_states')
    op.drop_table('npc_emotional_states')

    op.drop_index('idx_memory_type_importance', table_name='npc_conversation_memories')
    op.drop_index('idx_npc_user_memories', table_name='npc_conversation_memories')
    op.drop_table('npc_conversation_memories')
