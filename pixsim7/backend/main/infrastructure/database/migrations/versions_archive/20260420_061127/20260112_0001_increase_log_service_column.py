"""increase_log_service_column

Revision ID: 20260112_0001
Revises: 20260111_0002
Create Date: 2026-01-12 01:15:00.000000

Increase the service column in log_entries from 50 to 150 characters
to accommodate full Python module paths.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260112_0001"
down_revision = "20260111_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "log_entries",
        "service",
        existing_type=sa.String(length=50),
        type_=sa.String(length=150),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "log_entries",
        "service",
        existing_type=sa.String(length=150),
        type_=sa.String(length=50),
        existing_nullable=False,
    )
