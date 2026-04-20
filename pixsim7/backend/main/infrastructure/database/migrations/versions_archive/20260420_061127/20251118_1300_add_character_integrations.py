"""Add character integrations tables

Revision ID: 20251118_1300
Create Date: 2025-11-18 13:00:00

Creates tables for character world instances, NPC sync, capabilities,
scene manifests, and dialogue profiles.

This enables:
- Character instances per world (one template → many instances)
- Character-NPC bidirectional sync with field mappings
- Character capability system (skills/abilities)
- Scene character requirements and validation
- Character dialogue integration
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from datetime import datetime


# revision identifiers
revision = '20251118_1300'
down_revision = '20251118_1200'  # Previous migration (character_registry)
branch_labels = None
depends_on = None


def upgrade():
    # Create character_instances table
    op.create_table(
        'character_instances',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('character_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('world_id', sa.Integer, nullable=True, index=True),
        sa.Column('character_version', sa.Integer, nullable=False, server_default='1'),

        # Instance-specific overrides
        sa.Column('visual_overrides', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('personality_overrides', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('behavioral_overrides', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('current_state', postgresql.JSONB, nullable=False, server_default='{}'),

        sa.Column('instance_name', sa.String(length=200), nullable=True),
        sa.Column('instance_metadata', postgresql.JSONB, nullable=False, server_default='{}'),

        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true', index=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),

        sa.ForeignKeyConstraint(['character_id'], ['characters.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['world_id'], ['game_worlds.id'], ondelete='CASCADE')
    )

    # Create indexes for character_instances
    op.create_index(
        'ix_character_instances_character_world',
        'character_instances',
        ['character_id', 'world_id']
    )
    op.create_index(
        'ix_character_instances_overrides',
        'character_instances',
        ['visual_overrides'],
        postgresql_using='gin'
    )
    op.create_index(
        'ix_character_instances_state',
        'character_instances',
        ['current_state'],
        postgresql_using='gin'
    )

    # Create character_npc_links table
    op.create_table(
        'character_npc_links',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('character_instance_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('npc_id', sa.Integer, nullable=False, index=True),

        # Sync configuration
        sa.Column('sync_enabled', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('sync_direction', sa.String(length=50), nullable=False, server_default='bidirectional'),
        sa.Column('field_mappings', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('priority', sa.Integer, nullable=False, server_default='0'),
        sa.Column('activation_conditions', postgresql.JSONB, nullable=False, server_default='{}'),

        # Last sync metadata
        sa.Column('last_synced_at', sa.DateTime, nullable=True),
        sa.Column('last_sync_direction', sa.String(length=50), nullable=True),

        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),

        sa.ForeignKeyConstraint(['character_instance_id'], ['character_instances.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['npc_id'], ['game_npcs.id'], ondelete='CASCADE')
    )

    # Create indexes for character_npc_links
    op.create_index(
        'ix_character_npc_links_instance_npc',
        'character_npc_links',
        ['character_instance_id', 'npc_id']
    )
    op.create_index(
        'ix_character_npc_links_priority',
        'character_npc_links',
        ['npc_id', 'priority']
    )

    # Create character_capabilities table
    op.create_table(
        'character_capabilities',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('character_id', postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column('character_instance_id', postgresql.UUID(as_uuid=True), nullable=True, index=True),

        # Capability definition
        sa.Column('capability_type', sa.String(length=100), nullable=False, index=True),
        sa.Column('skill_level', sa.Integer, nullable=False, server_default='5'),
        sa.Column('action_blocks', postgresql.JSON, nullable=False, server_default='[]'),

        # Conditions and effects
        sa.Column('conditions', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('effects', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('cooldown_seconds', sa.Integer, nullable=True),

        # Metadata
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('tags', postgresql.JSONB, nullable=False, server_default='{}'),

        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true', index=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),

        sa.ForeignKeyConstraint(['character_id'], ['characters.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['character_instance_id'], ['character_instances.id'], ondelete='CASCADE')
    )

    # Create indexes for character_capabilities
    op.create_index(
        'ix_character_capabilities_type_level',
        'character_capabilities',
        ['capability_type', 'skill_level']
    )

    # Create scene_character_manifests table
    op.create_table(
        'scene_character_manifests',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('scene_id', sa.Integer, nullable=False, index=True),

        # Character requirements
        sa.Column('required_characters', postgresql.JSON, nullable=False, server_default='[]'),
        sa.Column('optional_characters', postgresql.JSON, nullable=False, server_default='[]'),
        sa.Column('character_roles', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('required_relationships', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('instance_requirements', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('validation_rules', postgresql.JSONB, nullable=False, server_default='{}'),

        # Metadata
        sa.Column('created_by', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),

        sa.ForeignKeyConstraint(['scene_id'], ['game_scenes.id'], ondelete='CASCADE')
    )

    # Create index for scene_character_manifests
    op.create_index(
        'ix_scene_character_manifests_roles',
        'scene_character_manifests',
        ['character_roles'],
        postgresql_using='gin'
    )

    # Create character_dialogue_profiles table
    op.create_table(
        'character_dialogue_profiles',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('character_id', postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column('character_instance_id', postgresql.UUID(as_uuid=True), nullable=True, index=True),

        # Dialogue configuration
        sa.Column('dialogue_tree_id', sa.String(length=200), nullable=True),
        sa.Column('voice_style', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('personality_modifiers', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('response_templates', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('dialogue_triggers', postgresql.JSONB, nullable=False, server_default='{}'),

        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),

        sa.ForeignKeyConstraint(['character_id'], ['characters.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['character_instance_id'], ['character_instances.id'], ondelete='CASCADE')
    )

    # Create indexes for character_dialogue_profiles
    op.create_index(
        'ix_character_dialogue_profiles_triggers',
        'character_dialogue_profiles',
        ['dialogue_triggers'],
        postgresql_using='gin'
    )


def downgrade():
    # Drop tables in reverse order (to handle foreign keys)
    op.drop_table('character_dialogue_profiles')
    op.drop_table('scene_character_manifests')
    op.drop_table('character_capabilities')
    op.drop_table('character_npc_links')
    op.drop_table('character_instances')
