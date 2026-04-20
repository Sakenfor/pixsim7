"""add user ai settings table

Revision ID: 09fe3f945bc7
Revises: 72a94f17d11a
Create Date: 2025-12-14 22:10:35.781662

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic
# NOTE: Use hash-based revision IDs (auto-generated) for consistency
# Avoid custom revision names to prevent conflicts in version chain
revision = '09fe3f945bc7'
down_revision = '72a94f17d11a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Apply migration: add user ai settings table"""
    op.create_table(
        'user_ai_settings',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('openai_api_key', sa.String(length=500), nullable=True),
        sa.Column('anthropic_api_key', sa.String(length=500), nullable=True),
        sa.Column('llm_provider', sa.String(length=50), nullable=False, server_default='anthropic'),
        sa.Column('llm_default_model', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id')
    )


def downgrade() -> None:
    """Revert migration: add user ai settings table

    ⚠️ WARNING: This may result in data loss!
    Ensure you have a verified backup before running.
    """
    op.drop_table('user_ai_settings')
