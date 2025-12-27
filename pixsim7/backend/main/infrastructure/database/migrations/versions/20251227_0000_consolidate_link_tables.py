"""Consolidate link tables: add sync_field_mappings, drop character_npc_links

Revision ID: 20251227_0000
Create Date: 2025-12-27 00:00:00

Consolidates the link system by:
1. Adding sync_field_mappings column to object_links for per-link sync mappings
2. Dropping the character_npc_links table (now replaced by object_links)

CharacterNPCSyncService now uses ObjectLink via LinkService exclusively.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers
revision = '20251227_0000'
down_revision = '20251226_2105'  # Previous migration
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add sync_field_mappings column to object_links
    # This stores per-link field mappings for sync operations (source_path -> target_path)
    # Format: {"visual_traits.scars": "personality.appearance.scars", ...}
    op.add_column(
        'object_links',
        sa.Column('sync_field_mappings', postgresql.JSONB, nullable=True)
    )

    # 2. Drop character_npc_links table (replaced by object_links)
    # Drop indexes first
    op.drop_index('ix_character_npc_links_priority', table_name='character_npc_links')
    op.drop_index('ix_character_npc_links_instance_npc', table_name='character_npc_links')

    # Drop the table
    op.drop_table('character_npc_links')


def downgrade():
    # 1. Recreate character_npc_links table
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

    # Recreate indexes
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

    # 2. Drop sync_field_mappings column from object_links
    op.drop_column('object_links', 'sync_field_mappings')
