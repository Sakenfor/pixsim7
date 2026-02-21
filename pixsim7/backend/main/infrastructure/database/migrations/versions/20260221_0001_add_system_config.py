"""Add system_config table for persisted admin settings.

Revision ID: 20260221_0001
Revises: 20260219_0002
Create Date: 2026-02-21
"""
from alembic import op
import sqlalchemy as sa

revision = "20260221_0001"
down_revision = "20260219_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "system_config",
        sa.Column("namespace", sa.String(100), primary_key=True),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("system_config")
