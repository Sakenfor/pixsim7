"""Add block_image_fits table for ActionBlock-to-asset fit scoring

Revision ID: 1128blockimagefit
Revises: 1127semanticpacks
Create Date: 2025-11-28 00:00:00

This migration creates the block_image_fits table for Task 86.

Features:
- Stores user ratings for how well ActionBlocks fit specific images/assets
- Includes heuristic fit scores based on ontology tag comparison
- Captures snapshots of block and asset tags at rating time
- Supports sequence context (initial, continuation, transition)
- Enables analysis and tuning of block-to-image matching
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON, UUID
from datetime import datetime

revision = '1128blockimagefit'
down_revision = '1127semanticpacks'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create block_image_fits table
    op.create_table(
        'block_image_fits',

        # Primary key
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),

        # Foreign keys
        sa.Column('block_id', UUID(as_uuid=True), sa.ForeignKey('action_blocks.id'), nullable=False, index=True),
        sa.Column('asset_id', sa.Integer(), sa.ForeignKey('assets.id'), nullable=True, index=True),
        sa.Column('generation_id', sa.Integer(), sa.ForeignKey('generations.id'), nullable=True, index=True),

        # Sequence context
        sa.Column('role_in_sequence', sa.String(32), nullable=False, server_default='unspecified'),

        # User and rating
        sa.Column('user_id', sa.Integer(), nullable=True, index=True),
        sa.Column('fit_rating', sa.Integer(), nullable=True),

        # Heuristic score
        sa.Column('heuristic_score', sa.Float(), nullable=True),

        # Tag snapshots
        sa.Column('block_tags_snapshot', JSON, nullable=False, server_default='{}'),
        sa.Column('asset_tags_snapshot', JSON, nullable=False, server_default='{}'),

        # Notes
        sa.Column('notes', sa.Text(), nullable=True),

        # Timestamp
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()'), index=True),
    )

    # Create indexes for efficient queries
    op.create_index('idx_block_fit_block', 'block_image_fits', ['block_id'])
    op.create_index('idx_block_fit_asset', 'block_image_fits', ['asset_id'])
    op.create_index('idx_block_fit_generation', 'block_image_fits', ['generation_id'])
    op.create_index('idx_block_fit_user', 'block_image_fits', ['user_id'])
    op.create_index('idx_block_fit_created', 'block_image_fits', ['created_at'])

    # Composite index for block+asset queries
    op.create_index('idx_block_fit_block_asset', 'block_image_fits', ['block_id', 'asset_id'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('idx_block_fit_block_asset', table_name='block_image_fits')
    op.drop_index('idx_block_fit_created', table_name='block_image_fits')
    op.drop_index('idx_block_fit_user', table_name='block_image_fits')
    op.drop_index('idx_block_fit_generation', table_name='block_image_fits')
    op.drop_index('idx_block_fit_asset', table_name='block_image_fits')
    op.drop_index('idx_block_fit_block', table_name='block_image_fits')

    # Drop table
    op.drop_table('block_image_fits')
