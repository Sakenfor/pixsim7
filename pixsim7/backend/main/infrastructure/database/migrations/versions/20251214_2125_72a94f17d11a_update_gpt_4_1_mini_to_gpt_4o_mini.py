"""update gpt-4.1-mini to gpt-4o-mini

Revision ID: 72a94f17d11a
Revises: b4eb3f4d276c
Create Date: 2025-12-14 21:25:37.680957

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic
# NOTE: Use hash-based revision IDs (auto-generated) for consistency
# Avoid custom revision names to prevent conflicts in version chain
revision = '72a94f17d11a'
down_revision = 'b4eb3f4d276c'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Apply migration: update gpt-4.1-mini to gpt-4o-mini"""
    # Update ai_model_defaults table to use correct OpenAI model ID
    op.execute("""
        UPDATE ai_model_defaults
        SET model_id = 'openai:gpt-4o-mini'
        WHERE model_id = 'openai:gpt-4.1-mini'
    """)


def downgrade() -> None:
    """Revert migration: update gpt-4.1-mini to gpt-4o-mini

    ⚠️ WARNING: This may result in data loss!
    Ensure you have a verified backup before running.
    """
    # Revert to old model ID (for rollback purposes only)
    op.execute("""
        UPDATE ai_model_defaults
        SET model_id = 'openai:gpt-4.1-mini'
        WHERE model_id = 'openai:gpt-4o-mini'
    """)
