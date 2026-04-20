"""Add structured plan fields: plan_type, target, and checkpoints.

Moves plans from pure markdown toward canonical structure.
- plan_type: proposal | feature | bugfix | refactor | exploration | task
- target: JSON describing what the plan is about
- checkpoints: JSON array of structured milestones

Revision ID: 20260316_0008
Revises: 20260316_0007
Create Date: 2026-03-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260316_0008"
down_revision = "20260316_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "plan_registry",
        sa.Column("plan_type", sa.String(32), nullable=False, server_default="feature"),
        schema="dev_meta",
    )
    op.add_column(
        "plan_registry",
        sa.Column("target", sa.JSON(), nullable=True),
        schema="dev_meta",
    )
    op.add_column(
        "plan_registry",
        sa.Column("checkpoints", sa.JSON(), nullable=True),
        schema="dev_meta",
    )
    op.create_index(
        "idx_plan_registry_type",
        "plan_registry",
        ["plan_type"],
        schema="dev_meta",
    )


def downgrade() -> None:
    op.drop_index("idx_plan_registry_type", table_name="plan_registry", schema="dev_meta")
    op.drop_column("plan_registry", "checkpoints", schema="dev_meta")
    op.drop_column("plan_registry", "target", schema="dev_meta")
    op.drop_column("plan_registry", "plan_type", schema="dev_meta")
