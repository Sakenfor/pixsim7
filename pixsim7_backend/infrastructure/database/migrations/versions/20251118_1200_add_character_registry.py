"""Add character registry tables

Revision ID: 20251118_1200
Create Date: 2025-11-18 12:00:00

Creates tables for character registry system:
- characters: Main character definitions
- character_relationships: Relationships between characters
- character_usage: Track where characters are used
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from datetime import datetime


# revision identifiers
revision = '20251118_1200'
down_revision = '1118actionblocks'  # Previous migration (action_blocks)
branch_labels = None
depends_on = None


def upgrade():
    # Create characters table
    op.create_table(
        'characters',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('character_id', sa.String(length=200), nullable=False, unique=True, index=True),
        sa.Column('name', sa.String(length=200), nullable=True),
        sa.Column('display_name', sa.String(length=200), nullable=True),

        # Classification
        sa.Column('category', sa.String(length=50), nullable=False, index=True),
        sa.Column('species', sa.String(length=100), nullable=True),
        sa.Column('archetype', sa.String(length=100), nullable=True),

        # JSONB fields for flexible data
        sa.Column('visual_traits', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('personality_traits', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('behavioral_patterns', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('voice_profile', postgresql.JSONB, nullable=False, server_default='{}'),

        # Rendering
        sa.Column('render_style', sa.String(length=100), nullable=True),
        sa.Column('render_instructions', sa.Text, nullable=True),
        sa.Column('reference_images', postgresql.JSON, nullable=False, server_default='[]'),

        # Game integration
        sa.Column('game_npc_id', sa.Integer(), nullable=True, index=True),
        sa.Column('sync_with_game', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('game_metadata', postgresql.JSONB, nullable=False, server_default='{}'),

        # Versioning
        sa.Column('version', sa.Integer, nullable=False, server_default='1'),
        sa.Column('previous_version_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('version_notes', sa.Text, nullable=True),

        # Usage tracking
        sa.Column('usage_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('last_used_at', sa.DateTime, nullable=True),

        # Metadata
        sa.Column('tags', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('character_metadata', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('created_by', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),

        # Soft delete
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true', index=True),
        sa.Column('deleted_at', sa.DateTime, nullable=True),

        # Foreign keys
        sa.ForeignKeyConstraint(['game_npc_id'], ['game_npcs.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['previous_version_id'], ['characters.id'], ondelete='SET NULL')
    )

    # Create indexes on JSONB fields for performance
    op.create_index(
        'ix_characters_visual_traits',
        'characters',
        ['visual_traits'],
        postgresql_using='gin'
    )
    op.create_index(
        'ix_characters_personality_traits',
        'characters',
        ['personality_traits'],
        postgresql_using='gin'
    )
    op.create_index(
        'ix_characters_tags',
        'characters',
        ['tags'],
        postgresql_using='gin'
    )

    # Create character_relationships table
    op.create_table(
        'character_relationships',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('character_a_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('character_b_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('relationship_type', sa.String(length=50), nullable=False),
        sa.Column('relationship_strength', sa.Float, nullable=False, server_default='0.5'),
        sa.Column('history', postgresql.JSON, nullable=False, server_default='[]'),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('created_by', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),

        sa.ForeignKeyConstraint(['character_a_id'], ['characters.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['character_b_id'], ['characters.id'], ondelete='CASCADE')
    )

    # Create composite index for relationship queries
    op.create_index(
        'ix_character_relationships_pair',
        'character_relationships',
        ['character_a_id', 'character_b_id']
    )

    # Create character_usage table
    op.create_table(
        'character_usage',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('character_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('usage_type', sa.String(length=50), nullable=False),
        sa.Column('prompt_version_id', postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column('action_block_id', postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column('template_reference', sa.String(length=500), nullable=True),
        sa.Column('used_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),

        sa.ForeignKeyConstraint(['character_id'], ['characters.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['prompt_version_id'], ['prompt_versions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['action_block_id'], ['action_blocks.id'], ondelete='CASCADE')
    )

    # Create composite index for usage queries
    op.create_index(
        'ix_character_usage_character_type',
        'character_usage',
        ['character_id', 'usage_type']
    )


def downgrade():
    # Drop tables in reverse order (to handle foreign keys)
    op.drop_table('character_usage')
    op.drop_table('character_relationships')
    op.drop_table('characters')
