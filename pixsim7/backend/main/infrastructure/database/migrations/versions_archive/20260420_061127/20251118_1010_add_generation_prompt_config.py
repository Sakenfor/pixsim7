"""Add structured prompt configuration to Generation

Revision ID: 1118genpromptconfig
Revises: 1118promptstrategy
Create Date: 2025-11-18 10:10:00

BREAKING CHANGE: Adds structured prompt configuration to generations.

This migration prepares for mandatory prompt versioning by adding:
- prompt_config: Structured JSON with versionId, familyId, variables
- prompt_source_type: Enum for tracking prompt source (versioned, inline, generated)

Migration path:
1. Add nullable fields
2. Conversion script will populate from existing data
3. Future migration will make prompt_config required
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

revision = '1118genpromptconfig'
down_revision = '1118promptstrategy'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add structured prompt configuration
    op.add_column(
        'generations',
        sa.Column(
            'prompt_config',
            JSON,
            nullable=True,  # Will become NOT NULL after conversion script
            comment='''Structured prompt configuration:
            {
                "versionId": "uuid-v2",      // Specific version
                "familyId": "uuid-family",   // Family with auto-select
                "autoSelectLatest": true,    // Use latest version
                "variables": {...},          // Variable values
                "inlinePrompt": "..."        // DEPRECATED: inline prompt
            }'''
        )
    )

    # Add prompt source type for analytics
    op.add_column(
        'generations',
        sa.Column(
            'prompt_source_type',
            sa.String(20),
            nullable=True,  # Will become NOT NULL after conversion
            comment='Source type: "versioned", "inline", "generated", "unknown"'
        )
    )

    # Add index for querying by prompt version
    op.create_index(
        'idx_generation_prompt_version',
        'generations',
        ['prompt_version_id'],
        postgresql_where=sa.text("prompt_version_id IS NOT NULL")
    )

    # Add index for prompt source type analytics
    op.create_index(
        'idx_generation_prompt_source_type',
        'generations',
        ['prompt_source_type', 'created_at']
    )


def downgrade() -> None:
    # Remove indexes
    op.drop_index('idx_generation_prompt_source_type', table_name='generations')
    op.drop_index('idx_generation_prompt_version', table_name='generations')

    # Remove columns
    op.drop_column('generations', 'prompt_source_type')
    op.drop_column('generations', 'prompt_config')
