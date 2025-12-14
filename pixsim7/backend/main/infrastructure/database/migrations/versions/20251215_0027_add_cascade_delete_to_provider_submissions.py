"""add cascade delete to provider_submissions

Revision ID: 20251215_0027
Revises: (latest)
Create Date: 2025-12-15 00:27:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20251215_0027'
down_revision = '09fe3f945bc7'
branch_labels = None
depends_on = None


def upgrade():
    """Add CASCADE DELETE to provider_submissions.generation_id foreign key.

    This allows generation records to be deleted when their parent asset is deleted,
    which in turn will cascade delete to provider_submissions.
    """
    # Drop the existing foreign key constraint
    op.drop_constraint(
        'fk_provider_submissions_generation_id',
        'provider_submissions',
        type_='foreignkey'
    )

    # Recreate it with CASCADE DELETE
    op.create_foreign_key(
        'fk_provider_submissions_generation_id',
        'provider_submissions',
        'generations',
        ['generation_id'],
        ['id'],
        ondelete='CASCADE'
    )


def downgrade():
    """Remove CASCADE DELETE from provider_submissions.generation_id foreign key."""
    # Drop the CASCADE version
    op.drop_constraint(
        'fk_provider_submissions_generation_id',
        'provider_submissions',
        type_='foreignkey'
    )

    # Recreate it without CASCADE
    op.create_foreign_key(
        'fk_provider_submissions_generation_id',
        'provider_submissions',
        'generations',
        ['generation_id'],
        ['id']
    )
