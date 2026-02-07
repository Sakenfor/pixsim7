"""add_error_code_to_generations

Revision ID: 20260206_0001
Revises: 20260205_0001
Create Date: 2026-02-06 00:00:00.000000

Add error_code column to generations table for structured error categorisation.
Stores GenerationErrorCode enum values as plain strings (validated in Python).
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260206_0001"
down_revision = "20260205_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "generations",
        sa.Column("error_code", sa.String(60), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("generations", "error_code")
