"""
Create ai_interactions table for AI Hub

Tracks LLM-powered prompt editing operations for audit and analysis.

Revision ID: 20251125aiint
Revises: 20251121apikeys
Create Date: 2025-11-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import Index

# revision identifiers, used by Alembic.
revision = '20251125aiint'
down_revision = '20251121apikeys'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create ai_interactions table"""
    op.create_table(
        'ai_interactions',
        # Primary key
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),

        # Foreign keys
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('generation_id', sa.Integer(), nullable=True),

        # Provider and model
        sa.Column('provider_id', sa.String(length=50), nullable=False),
        sa.Column('model_id', sa.String(length=100), nullable=False),

        # Prompt data
        sa.Column('prompt_before', sa.Text(), nullable=False),
        sa.Column('prompt_after', sa.Text(), nullable=False),

        # Timestamp
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),

        # Foreign key constraints
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_ai_interactions_user_id'),
        sa.ForeignKeyConstraint(['generation_id'], ['generations.id'], name='fk_ai_interactions_generation_id'),

        # Primary key constraint
        sa.PrimaryKeyConstraint('id', name='pk_ai_interactions')
    )

    # Create indexes
    op.create_index('ix_ai_interactions_user_id', 'ai_interactions', ['user_id'])
    op.create_index('ix_ai_interactions_generation_id', 'ai_interactions', ['generation_id'])
    op.create_index('ix_ai_interactions_provider_id', 'ai_interactions', ['provider_id'])
    op.create_index('ix_ai_interactions_user_created', 'ai_interactions', ['user_id', 'created_at'])
    op.create_index('ix_ai_interactions_provider_created', 'ai_interactions', ['provider_id', 'created_at'])


def downgrade() -> None:
    """Drop ai_interactions table"""
    op.drop_index('ix_ai_interactions_provider_created', table_name='ai_interactions')
    op.drop_index('ix_ai_interactions_user_created', table_name='ai_interactions')
    op.drop_index('ix_ai_interactions_provider_id', table_name='ai_interactions')
    op.drop_index('ix_ai_interactions_generation_id', table_name='ai_interactions')
    op.drop_index('ix_ai_interactions_user_id', table_name='ai_interactions')
    op.drop_table('ai_interactions')
