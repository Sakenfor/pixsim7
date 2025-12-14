"""Add object_links table for generic template-runtime links

Revision ID: 20251214_1400
Create Date: 2025-12-14 14:00:00

Creates the object_links table for generic template↔runtime linking.

This enables:
- Generic template→runtime links for any entity pair
- Character→NPC, ItemTemplate→Item, PropTemplate→Prop, etc.
- Bidirectional sync with field mappings
- Priority-based conflict resolution
- Context-based activation conditions
- Extensible via mapping registry

The existing character_npc_links table remains unchanged.
This is an additive, non-breaking change that provides a migration path.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers
revision = '20251214_1400'
down_revision = '20251118_1300'  # Previous migration (character_integrations)
branch_labels = None
depends_on = None


def upgrade():
    # Create object_links table
    op.create_table(
        'object_links',
        sa.Column('link_id', postgresql.UUID(as_uuid=True), primary_key=True),

        # Template reference
        sa.Column('template_kind', sa.String(length=50), nullable=False, index=True),
        sa.Column('template_id', sa.String(length=255), nullable=False, index=True),

        # Runtime reference
        sa.Column('runtime_kind', sa.String(length=50), nullable=False, index=True),
        sa.Column('runtime_id', sa.Integer, nullable=False, index=True),

        # Sync configuration
        sa.Column('sync_enabled', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('sync_direction', sa.String(length=50), nullable=False, server_default='bidirectional'),

        # Mapping reference
        sa.Column('mapping_id', sa.String(length=100), nullable=True, index=True),

        # Link behavior
        sa.Column('priority', sa.Integer, nullable=False, server_default='0', index=True),
        sa.Column('activation_conditions', postgresql.JSONB, nullable=True),

        # Metadata
        sa.Column('meta', postgresql.JSONB, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('last_synced_at', sa.DateTime, nullable=True),
        sa.Column('last_sync_direction', sa.String(length=50), nullable=True)
    )

    # Create composite index for template lookups
    op.create_index(
        'ix_object_links_template',
        'object_links',
        ['template_kind', 'template_id']
    )

    # Create composite index for runtime lookups
    op.create_index(
        'ix_object_links_runtime',
        'object_links',
        ['runtime_kind', 'runtime_id']
    )

    # Create index for mapping_id lookups
    op.create_index(
        'ix_object_links_mapping_id',
        'object_links',
        ['mapping_id']
    )

    # Create composite index for priority-based queries
    # Used to find highest-priority link for a runtime entity
    op.create_index(
        'ix_object_links_priority',
        'object_links',
        ['runtime_kind', 'runtime_id', 'priority']
    )

    # Create GIN index for activation_conditions JSONB queries
    op.create_index(
        'ix_object_links_activation',
        'object_links',
        ['activation_conditions'],
        postgresql_using='gin'
    )


def downgrade():
    # Drop all indexes first
    op.drop_index('ix_object_links_activation', table_name='object_links')
    op.drop_index('ix_object_links_priority', table_name='object_links')
    op.drop_index('ix_object_links_mapping_id', table_name='object_links')
    op.drop_index('ix_object_links_runtime', table_name='object_links')
    op.drop_index('ix_object_links_template', table_name='object_links')

    # Drop table
    op.drop_table('object_links')
