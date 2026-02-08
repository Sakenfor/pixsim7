"""add_model_to_assets

Revision ID: 20260207_0001
Revises: 20260206_0001
Create Date: 2026-02-07 00:00:00.000000

Add model column to assets table to store the provider model used for generation.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260207_0001"
down_revision = "20260206_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "assets",
        sa.Column("model", sa.String(64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("assets", "model")
