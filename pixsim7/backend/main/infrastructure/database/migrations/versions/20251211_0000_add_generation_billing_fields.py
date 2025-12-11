"""add billing fields to generations table

Add billing metadata fields to track credit estimation, deduction, and state.

Changes:
- Add account_id (FK to provider_accounts)
- Add estimated_credits, actual_credits (int)
- Add credit_type (varchar)
- Add billing_state enum (pending, charged, skipped, failed)
- Add charged_at (datetime)
- Add billing_error (text)

Revision ID: e5f6a7b8c9d2
Revises: d4e5f6a7b8c1
Create Date: 2025-12-11 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'e5f6a7b8c9d2'
down_revision = 'd4e5f6a7b8c1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create billing_state enum
    billing_state_enum = sa.Enum(
        'pending', 'charged', 'skipped', 'failed',
        name='billing_state_enum'
    )
    billing_state_enum.create(op.get_bind(), checkfirst=True)

    # Add billing fields to generations table
    op.add_column(
        'generations',
        sa.Column('account_id', sa.Integer(), nullable=True)
    )
    op.add_column(
        'generations',
        sa.Column('estimated_credits', sa.Integer(), nullable=True)
    )
    op.add_column(
        'generations',
        sa.Column('actual_credits', sa.Integer(), nullable=True)
    )
    op.add_column(
        'generations',
        sa.Column('credit_type', sa.String(50), nullable=True)
    )
    op.add_column(
        'generations',
        sa.Column('billing_state', sa.Enum(
            'pending', 'charged', 'skipped', 'failed',
            name='billing_state_enum', native_enum=False
        ), nullable=True, server_default='pending')
    )
    op.add_column(
        'generations',
        sa.Column('charged_at', sa.DateTime(), nullable=True)
    )
    op.add_column(
        'generations',
        sa.Column('billing_error', sa.Text(), nullable=True)
    )

    # Create foreign key for account_id
    op.create_foreign_key(
        'fk_generations_account_id',
        'generations',
        'provider_accounts',
        ['account_id'],
        ['id']
    )

    # Create indexes
    op.create_index(
        'ix_generations_account_id',
        'generations',
        ['account_id']
    )
    op.create_index(
        'ix_generations_billing_state',
        'generations',
        ['billing_state']
    )


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_generations_billing_state', table_name='generations')
    op.drop_index('ix_generations_account_id', table_name='generations')

    # Drop foreign key
    op.drop_constraint('fk_generations_account_id', 'generations', type_='foreignkey')

    # Drop columns
    op.drop_column('generations', 'billing_error')
    op.drop_column('generations', 'charged_at')
    op.drop_column('generations', 'billing_state')
    op.drop_column('generations', 'credit_type')
    op.drop_column('generations', 'actual_credits')
    op.drop_column('generations', 'estimated_credits')
    op.drop_column('generations', 'account_id')

    # Drop enum
    sa.Enum(name='billing_state_enum').drop(op.get_bind(), checkfirst=True)
