"""Add action_blocks table for database-backed reusable prompt components

Revision ID: 1118actionblocks
Revises: 1118genpromptconfig
Create Date: 2025-11-18 11:00:00

This migration creates the action_blocks table to replace JSON file storage
with PostgreSQL while maintaining backward compatibility.

Features:
- Stores simple blocks (200-300 chars) from existing JSON libraries
- Supports complex blocks (1000+ chars) extracted from prompts
- Links to prompt versioning system
- Tracks composition and reusability
- Maintains compatibility with existing ActionBlock format
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON, JSONB, UUID, TEXT
from datetime import datetime

revision = '1118actionblocks'
down_revision = '1118genpromptconfig'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create action_blocks table
    op.create_table(
        'action_blocks',

        # Primary Identity
        sa.Column('id', UUID, primary_key=True, nullable=False),
        sa.Column('block_id', sa.String(200), unique=True, nullable=False, index=True),

        # Block Type
        sa.Column('kind', sa.String(50), nullable=False, index=True),

        # Core Content
        sa.Column('prompt', TEXT, nullable=False),
        sa.Column('negative_prompt', TEXT, nullable=True),
        sa.Column('style', sa.String(100), nullable=True),
        sa.Column('duration_sec', sa.Float, nullable=False, server_default='6.0'),

        # Structured Tags (JSONB for GIN indexing)
        sa.Column('tags', JSONB, nullable=False, server_default='{}'),

        # Compatibility
        sa.Column('compatible_next', JSONB, nullable=False, server_default='[]'),
        sa.Column('compatible_prev', JSON, nullable=False, server_default='[]'),

        # Reference Images
        sa.Column('reference_image', JSON, nullable=True),
        sa.Column('transition_from', JSON, nullable=True),
        sa.Column('transition_to', JSON, nullable=True),
        sa.Column('transition_via', JSON, nullable=True),

        # Pose Tracking
        sa.Column('start_pose', sa.String(100), nullable=True),
        sa.Column('end_pose', sa.String(100), nullable=True),

        # Complexity Support
        sa.Column('complexity_level', sa.String(50), nullable=False, server_default='simple', index=True),
        sa.Column('char_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('word_count', sa.Integer, nullable=False, server_default='0'),

        # Source Tracking
        sa.Column('source_type', sa.String(50), nullable=False, server_default='library', index=True),
        sa.Column('extracted_from_prompt_version', UUID, nullable=True, index=True),

        # Composition Support
        sa.Column('is_composite', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('component_blocks', JSON, nullable=False, server_default='[]'),
        sa.Column('composition_strategy', sa.String(50), nullable=True),

        # Versioning Link
        sa.Column('prompt_version_id', UUID, nullable=True, index=True),

        # Package/Library Organization
        sa.Column('package_name', sa.String(100), nullable=True, index=True),

        # Enhanced Features (v2 support)
        sa.Column('camera_movement', JSON, nullable=True),
        sa.Column('consistency', JSON, nullable=True),
        sa.Column('intensity_progression', JSON, nullable=True),

        # Usage Analytics
        sa.Column('usage_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('success_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('avg_rating', sa.Float, nullable=True),

        # Community & Permissions
        sa.Column('is_public', sa.Boolean, nullable=False, server_default='true', index=True),
        sa.Column('created_by', sa.String(100), nullable=True),

        # Metadata
        sa.Column('description', TEXT, nullable=True),
        sa.Column('block_metadata', JSON, nullable=False, server_default='{}'),

        # Timestamps
        sa.Column('created_at', sa.DateTime, nullable=False, index=True),
        sa.Column('updated_at', sa.DateTime, nullable=False),
    )

    # Add foreign key constraints
    op.create_foreign_key(
        'fk_action_block_extracted_from_prompt_version',
        'action_blocks',
        'prompt_versions',
        ['extracted_from_prompt_version'],
        ['id'],
        ondelete='SET NULL'
    )

    op.create_foreign_key(
        'fk_action_block_prompt_version',
        'action_blocks',
        'prompt_versions',
        ['prompt_version_id'],
        ['id'],
        ondelete='SET NULL'
    )

    # Create composite indexes
    op.create_index(
        'idx_action_block_kind_complexity',
        'action_blocks',
        ['kind', 'complexity_level']
    )

    op.create_index(
        'idx_action_block_package_public',
        'action_blocks',
        ['package_name', 'is_public']
    )

    # Create GIN index for tags JSON search (PostgreSQL specific)
    op.execute("""
        CREATE INDEX idx_action_block_tags_gin
        ON action_blocks USING GIN (tags)
    """)

    # Create GIN index for compatible_next search
    op.execute("""
        CREATE INDEX idx_action_block_compatible_next_gin
        ON action_blocks USING GIN (compatible_next)
    """)


def downgrade() -> None:
    # Drop GIN indexes
    op.drop_index('idx_action_block_compatible_next_gin', table_name='action_blocks')
    op.drop_index('idx_action_block_tags_gin', table_name='action_blocks')

    # Drop composite indexes
    op.drop_index('idx_action_block_package_public', table_name='action_blocks')
    op.drop_index('idx_action_block_kind_complexity', table_name='action_blocks')

    # Drop foreign keys
    op.drop_constraint('fk_action_block_prompt_version', 'action_blocks', type_='foreignkey')
    op.drop_constraint('fk_action_block_extracted_from_prompt_version', 'action_blocks', type_='foreignkey')

    # Drop table
    op.drop_table('action_blocks')
