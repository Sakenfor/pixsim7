"""add lifecycle fields to action_blocks table

Adds role, category, analyzer_id, curation_status fields for unified block lifecycle.
Blocks can now be raw (ai_extracted) → reviewed → curated.

Revision ID: c3d4e5f6a7b0
Revises: b2c3d4e5f6a9
Create Date: 2025-12-08 00:02:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'c3d4e5f6a7b0'
down_revision = 'b2c3d4e5f6a9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add role column (PromptSegmentRole enum stored as string)
    op.add_column(
        'action_blocks',
        sa.Column('role', sa.String(20), nullable=True, index=True)
    )

    # Add category column (fine-grained label)
    op.add_column(
        'action_blocks',
        sa.Column('category', sa.String(64), nullable=True, index=True)
    )

    # Add analyzer_id column (who extracted this block)
    op.add_column(
        'action_blocks',
        sa.Column('analyzer_id', sa.String(64), nullable=True)
    )

    # Add curation_status column (lifecycle state)
    op.add_column(
        'action_blocks',
        sa.Column('curation_status', sa.String(20), nullable=False, server_default='curated', index=True)
    )

    # Add composite indexes for common query patterns
    op.create_index(
        'idx_action_block_role_category_status',
        'action_blocks',
        ['role', 'category', 'curation_status']
    )

    op.create_index(
        'idx_action_block_source_extracted',
        'action_blocks',
        ['source_type', 'extracted_from_prompt_version']
    )


def downgrade() -> None:
    # Drop indexes first
    op.drop_index('idx_action_block_source_extracted', table_name='action_blocks')
    op.drop_index('idx_action_block_role_category_status', table_name='action_blocks')

    # Drop columns
    op.drop_column('action_blocks', 'curation_status')
    op.drop_column('action_blocks', 'analyzer_id')
    op.drop_column('action_blocks', 'category')
    op.drop_column('action_blocks', 'role')
