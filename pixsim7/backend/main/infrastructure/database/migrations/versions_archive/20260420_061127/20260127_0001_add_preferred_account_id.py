"""add_preferred_account_id_to_generations

Revision ID: 20260127_0001
Revises: 20260126_0002
Create Date: 2026-01-27 00:00:00.000000

Add preferred_account_id column to generations table for user-selected account preference.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260127_0001"
down_revision = "20260126_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "generations",
        sa.Column("preferred_account_id", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("generations", "preferred_account_id")
