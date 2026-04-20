"""add_resolved_params_to_generations

Revision ID: 20260205_0001
Revises: 20260127_0001
Create Date: 2026-02-05 00:00:00.000000

Add resolved_params column to generations table for caching provider-ready params.
This enables retries to skip asset resolution and use cached params directly.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON


# revision identifiers, used by Alembic.
revision = "20260205_0001"
down_revision = "20260127_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "generations",
        sa.Column("resolved_params", JSON, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("generations", "resolved_params")
