"""Add parent_id to plan_registry for plan hierarchy.

Allows plans to form parent-child trees. An initiative/epic plan
can have sub-plans, with status rollup and tree navigation.

Revision ID: 20260316_0011
Revises: 20260316_0010
Create Date: 2026-03-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260316_0011"
down_revision = "20260316_0010"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"


def upgrade() -> None:
    op.add_column(
        "plan_registry",
        sa.Column(
            "parent_id",
            sa.String(120),
            sa.ForeignKey("dev_meta.plan_registry.id", ondelete="SET NULL"),
            nullable=True,
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "idx_plan_registry_parent_id",
        "plan_registry",
        ["parent_id"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_index("idx_plan_registry_parent_id", table_name="plan_registry", schema=SCHEMA)
    op.drop_column("plan_registry", "parent_id", schema=SCHEMA)
