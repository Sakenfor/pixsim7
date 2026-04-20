"""add_params_to_job_and_account_id_to_submission

Revision ID: daa977a0bfa9
Revises: 7425b92ac62e
Create Date: 2025-11-11 22:54:20.736794

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import sqlmodel


# revision identifiers, used by Alembic.
revision = 'daa977a0bfa9'
down_revision = '7425b92ac62e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Add params JSON column to jobs table
    Add account_id foreign key to provider_submissions table
    """
    # Add params column to jobs table (stores generation parameters)
    # Set server_default to empty JSON object for existing rows
    op.add_column('jobs',
        sa.Column('params', postgresql.JSON(astext_type=sa.Text()),
                  nullable=False,
                  server_default='{}')
    )

    # Add account_id column to provider_submissions table
    # Initially nullable to handle existing records
    op.add_column('provider_submissions',
        sa.Column('account_id', sa.Integer(), nullable=True)
    )

    # Update existing records: set account_id to first matching provider account
    # Best-effort migration - review manually if needed
    conn = op.get_bind()
    conn.execute(sa.text("""
        UPDATE provider_submissions
        SET account_id = (
            SELECT id FROM provider_accounts
            WHERE provider_accounts.provider_id = provider_submissions.provider_id
            ORDER BY id
            LIMIT 1
        )
        WHERE account_id IS NULL
    """))

    # Now make account_id NOT NULL (after populating existing records)
    op.alter_column('provider_submissions', 'account_id', nullable=False)

    # Add foreign key constraint for account_id
    op.create_foreign_key(
        'fk_provider_submissions_account_id',
        'provider_submissions',
        'provider_accounts',
        ['account_id'],
        ['id']
    )

    # Add index on account_id for faster queries
    op.create_index(
        'ix_provider_submissions_account_id',
        'provider_submissions',
        ['account_id']
    )


def downgrade() -> None:
    """
    Remove params and account_id columns
    """
    # Drop index first
    op.drop_index('ix_provider_submissions_account_id', table_name='provider_submissions')

    # Drop foreign key constraint
    op.drop_constraint('fk_provider_submissions_account_id', 'provider_submissions', type_='foreignkey')

    # Drop columns
    op.drop_column('provider_submissions', 'account_id')
    op.drop_column('jobs', 'params')
