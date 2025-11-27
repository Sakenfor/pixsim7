"""Add semantic_packs table for shareable prompt semantics bundles

Revision ID: 1127semanticpacks
Revises: 20251125aiint
Create Date: 2025-11-27 15:00:00

This migration creates the semantic_packs table for Semantic Packs v1.

Features:
- Stores pack manifests with metadata, versioning, and status
- Contains parser hints (keywords/synonyms) for parser customization
- References ActionBlocks and PromptFamilies by ID (no data duplication)
- Supports tags-based discovery and filtering
- Enables sharing of prompt semantics bundles between players/creators
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON, JSONB, TEXT
from datetime import datetime

revision = '1127semanticpacks'
down_revision = '20251125aiint'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create semantic_packs table
    op.create_table(
        'semantic_packs',

        # Primary Identity
        sa.Column('id', sa.String(100), primary_key=True, nullable=False),
        sa.Column('version', sa.String(20), nullable=False),
        sa.Column('label', sa.String(200), nullable=False),
        sa.Column('description', TEXT, nullable=True),
        sa.Column('author', sa.String(100), nullable=True),

        # Compatibility
        sa.Column('ontology_version_min', sa.String(20), nullable=True),
        sa.Column('ontology_version_max', sa.String(20), nullable=True),

        # Tags/metadata (for discovery and filters) - JSONB for GIN indexing
        sa.Column('tags', JSONB, nullable=False, server_default='[]'),

        # Parser hints (keywords/synonyms) - JSONB for GIN indexing
        sa.Column('parser_hints', JSONB, nullable=False, server_default='{}'),

        # Links to content (ActionBlocks, PromptFamilies)
        sa.Column('action_block_ids', JSON, nullable=False, server_default='[]'),
        sa.Column('prompt_family_slugs', JSON, nullable=False, server_default='[]'),

        # Status
        sa.Column('status', sa.String(20), nullable=False, server_default='draft', index=True),

        # Metadata
        sa.Column('extra', JSON, nullable=False, server_default='{}'),

        # Timestamps
        sa.Column('created_at', sa.DateTime, nullable=False, index=True),
        sa.Column('updated_at', sa.DateTime, nullable=False),
    )

    # Create indexes
    op.create_index(
        'idx_semantic_pack_status',
        'semantic_packs',
        ['status']
    )

    op.create_index(
        'idx_semantic_pack_author',
        'semantic_packs',
        ['author']
    )

    op.create_index(
        'idx_semantic_pack_created',
        'semantic_packs',
        ['created_at']
    )

    # Create GIN index for tags JSON search (PostgreSQL specific)
    op.execute("""
        CREATE INDEX idx_semantic_pack_tags_gin
        ON semantic_packs USING GIN (tags)
    """)

    # Create GIN index for parser_hints search
    op.execute("""
        CREATE INDEX idx_semantic_pack_parser_hints_gin
        ON semantic_packs USING GIN (parser_hints)
    """)


def downgrade() -> None:
    # Drop GIN indexes
    op.drop_index('idx_semantic_pack_parser_hints_gin', table_name='semantic_packs')
    op.drop_index('idx_semantic_pack_tags_gin', table_name='semantic_packs')

    # Drop standard indexes
    op.drop_index('idx_semantic_pack_created', table_name='semantic_packs')
    op.drop_index('idx_semantic_pack_author', table_name='semantic_packs')
    op.drop_index('idx_semantic_pack_status', table_name='semantic_packs')

    # Drop table
    op.drop_table('semantic_packs')
