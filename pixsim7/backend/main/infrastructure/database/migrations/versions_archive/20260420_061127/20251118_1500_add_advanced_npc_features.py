"""Add advanced NPC features: milestones, world context, personality evolution, analytics

Revision ID: 1118advanced
Revises: 1118npcmemory
Create Date: 2025-11-18 15:00:00

This migration creates tables for advanced NPC features:
- npc_relationship_milestones: Tracks major relationship events
- npc_world_context: NPC awareness of world events
- npc_personality_evolution: Personality trait changes over time
- npc_dialogue_analytics: Analytics and optimization data

Features:
- Relationship milestone detection and tracking
- World event awareness and NPC reactions
- Dynamic personality evolution
- Comprehensive dialogue analytics
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON
from datetime import datetime

revision = '1118advanced'
down_revision = '1118npcmemory'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create npc_relationship_milestones table
    op.create_table(
        'npc_relationship_milestones',

        # Primary key
        sa.Column('id', sa.Integer, primary_key=True, nullable=False),

        # Foreign keys
        sa.Column('npc_id', sa.Integer, sa.ForeignKey('game_npcs.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('user_id', sa.Integer, sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('session_id', sa.Integer, sa.ForeignKey('game_sessions.id', ondelete='SET NULL'), nullable=True),

        # Milestone info
        sa.Column('milestone_type', sa.String(50), nullable=False, index=True),
        sa.Column('milestone_name', sa.String(200), nullable=False),

        # Context at the time
        sa.Column('relationship_values', JSON, nullable=False, server_default='{}'),
        sa.Column('relationship_tier', sa.String(50), nullable=False),

        # Triggers
        sa.Column('triggered_by', sa.String(200), nullable=True),
        sa.Column('trigger_memory_id', sa.Integer, sa.ForeignKey('npc_conversation_memories.id', ondelete='SET NULL'), nullable=True),

        # Effects
        sa.Column('unlocked_content', JSON, nullable=False, server_default='[]'),
        sa.Column('emotional_impact', sa.String(50), nullable=True),

        # Metadata
        sa.Column('metadata', JSON, nullable=False, server_default='{}'),

        # Timestamp
        sa.Column('achieved_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
    )

    # Create composite indexes for milestones
    op.create_index(
        'idx_npc_user_milestones',
        'npc_relationship_milestones',
        ['npc_id', 'user_id']
    )

    op.create_index(
        'idx_milestone_type',
        'npc_relationship_milestones',
        ['milestone_type']
    )

    # Create npc_world_context table
    op.create_table(
        'npc_world_context',

        # Primary key
        sa.Column('id', sa.Integer, primary_key=True, nullable=False),

        # Foreign keys
        sa.Column('npc_id', sa.Integer, sa.ForeignKey('game_npcs.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('world_id', sa.Integer, sa.ForeignKey('game_worlds.id', ondelete='CASCADE'), nullable=True),
        sa.Column('session_id', sa.Integer, sa.ForeignKey('game_sessions.id', ondelete='SET NULL'), nullable=True),

        # Event info
        sa.Column('event_type', sa.String(50), nullable=False, index=True),
        sa.Column('event_name', sa.String(200), nullable=False, index=True),
        sa.Column('event_description', sa.Text, nullable=False),

        # NPC awareness
        sa.Column('is_aware', sa.Boolean, nullable=False, server_default='true', index=True),
        sa.Column('awareness_source', sa.String(200), nullable=True),

        # NPC reaction
        sa.Column('emotional_response', sa.String(50), nullable=True),
        sa.Column('opinion', sa.Text, nullable=True),

        # Relevance
        sa.Column('relevance_score', sa.Float, nullable=False, server_default='0.5'),
        sa.Column('expires_at', sa.DateTime, nullable=True),

        # Metadata
        sa.Column('metadata', JSON, nullable=False, server_default='{}'),

        # Timestamps
        sa.Column('occurred_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
        sa.Column('npc_learned_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
    )

    # Create composite indexes for world context
    op.create_index(
        'idx_npc_world_events',
        'npc_world_context',
        ['npc_id', 'is_aware']
    )

    op.create_index(
        'idx_event_type',
        'npc_world_context',
        ['event_type']
    )

    # Create npc_personality_evolution table
    op.create_table(
        'npc_personality_evolution',

        # Primary key
        sa.Column('id', sa.Integer, primary_key=True, nullable=False),

        # Foreign keys
        sa.Column('npc_id', sa.Integer, sa.ForeignKey('game_npcs.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('user_id', sa.Integer, sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=True),

        # Personality change
        sa.Column('trait_changed', sa.String(50), nullable=False, index=True),
        sa.Column('old_value', sa.Float, nullable=False),
        sa.Column('new_value', sa.Float, nullable=False),
        sa.Column('change_amount', sa.Float, nullable=False),

        # Cause
        sa.Column('triggered_by', sa.String(200), nullable=False),
        sa.Column('trigger_event_id', sa.Integer, nullable=True),

        # Context
        sa.Column('relationship_tier_at_time', sa.String(50), nullable=True),
        sa.Column('world_time', sa.Float, nullable=True),

        # Metadata
        sa.Column('metadata', JSON, nullable=False, server_default='{}'),

        # Timestamp
        sa.Column('changed_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
    )

    # Create composite indexes for personality evolution
    op.create_index(
        'idx_npc_evolution',
        'npc_personality_evolution',
        ['npc_id']
    )

    op.create_index(
        'idx_trait_changed',
        'npc_personality_evolution',
        ['trait_changed']
    )

    # Create npc_dialogue_analytics table
    op.create_table(
        'npc_dialogue_analytics',

        # Primary key
        sa.Column('id', sa.Integer, primary_key=True, nullable=False),

        # Foreign keys
        sa.Column('npc_id', sa.Integer, sa.ForeignKey('game_npcs.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('user_id', sa.Integer, sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('session_id', sa.Integer, sa.ForeignKey('game_sessions.id', ondelete='SET NULL'), nullable=True),
        sa.Column('memory_id', sa.Integer, sa.ForeignKey('npc_conversation_memories.id', ondelete='SET NULL'), nullable=True),

        # Dialogue info
        sa.Column('program_id', sa.String(100), nullable=False, index=True),
        sa.Column('prompt_hash', sa.String(64), nullable=False),

        # Context at generation
        sa.Column('relationship_tier', sa.String(50), nullable=False),
        sa.Column('intimacy_level', sa.String(50), nullable=True),
        sa.Column('npc_emotion', sa.String(50), nullable=True),

        # LLM info
        sa.Column('model_used', sa.String(100), nullable=False),
        sa.Column('was_cached', sa.Boolean, nullable=False, server_default='false', index=True),
        sa.Column('tokens_used', sa.Integer, nullable=True),
        sa.Column('generation_time_ms', sa.Float, nullable=False),
        sa.Column('estimated_cost', sa.Float, nullable=True),

        # Player engagement metrics
        sa.Column('player_responded', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('response_time_seconds', sa.Float, nullable=True),
        sa.Column('conversation_continued', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('player_sentiment', sa.String(50), nullable=True),

        # Quality metrics
        sa.Column('dialogue_length', sa.Integer, nullable=False),
        sa.Column('contains_memory_reference', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('emotional_consistency', sa.Boolean, nullable=False, server_default='true'),

        # A/B testing
        sa.Column('variant_id', sa.String(50), nullable=True, index=True),

        # Metadata
        sa.Column('metadata', JSON, nullable=False, server_default='{}'),

        # Timestamp
        sa.Column('generated_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()'), index=True),
    )

    # Create composite indexes for dialogue analytics
    op.create_index(
        'idx_npc_user_analytics',
        'npc_dialogue_analytics',
        ['npc_id', 'user_id']
    )

    op.create_index(
        'idx_program_id',
        'npc_dialogue_analytics',
        ['program_id']
    )


def downgrade() -> None:
    # Drop tables in reverse order (respecting foreign key constraints)
    op.drop_index('idx_program_id', table_name='npc_dialogue_analytics')
    op.drop_index('idx_npc_user_analytics', table_name='npc_dialogue_analytics')
    op.drop_table('npc_dialogue_analytics')

    op.drop_index('idx_trait_changed', table_name='npc_personality_evolution')
    op.drop_index('idx_npc_evolution', table_name='npc_personality_evolution')
    op.drop_table('npc_personality_evolution')

    op.drop_index('idx_event_type', table_name='npc_world_context')
    op.drop_index('idx_npc_world_events', table_name='npc_world_context')
    op.drop_table('npc_world_context')

    op.drop_index('idx_milestone_type', table_name='npc_relationship_milestones')
    op.drop_index('idx_npc_user_milestones', table_name='npc_relationship_milestones')
    op.drop_table('npc_relationship_milestones')
