"""Add plan_shares table for targeted sharing.

Allows sharing plans with specific users. Works alongside visibility:
- private + no shares = only owner
- private + shares = owner + specific users
- shared = all authenticated (shares table ignored)
- public = everyone (shares table ignored)

Revision ID: 20260316_0007
Revises: 20260316_0006
Create Date: 2026-03-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260316_0007"
down_revision = "20260316_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plan_shares",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("plan_id", sa.String(120), sa.ForeignKey("dev_meta.plan_registry.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(32), nullable=False, server_default="viewer"),
        sa.Column("granted_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        schema="dev_meta",
    )
    op.create_index(
        "idx_plan_shares_plan_user",
        "plan_shares",
        ["plan_id", "user_id"],
        unique=True,
        schema="dev_meta",
    )
    op.create_index(
        "idx_plan_shares_user",
        "plan_shares",
        ["user_id"],
        schema="dev_meta",
    )


def downgrade() -> None:
    op.drop_index("idx_plan_shares_user", table_name="plan_shares", schema="dev_meta")
    op.drop_index("idx_plan_shares_plan_user", table_name="plan_shares", schema="dev_meta")
    op.drop_table("plan_shares", schema="dev_meta")
