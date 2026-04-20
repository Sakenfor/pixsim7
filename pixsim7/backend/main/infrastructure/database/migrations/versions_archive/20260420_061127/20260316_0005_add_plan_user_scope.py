"""Add user_id and scope to plan_registry for unified task model.

Plans become user-scoped: dev plans have scope='plan', user tasks
have scope='user'. user_id=NULL means system/shared (legacy dev plans).

Revision ID: 20260316_0005
Revises: 20260316_0004
Create Date: 2026-03-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260316_0005"
down_revision = "20260316_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "plan_registry",
        sa.Column("user_id", sa.Integer(), nullable=True, index=True),
        schema="dev_meta",
    )
    op.add_column(
        "plan_registry",
        sa.Column("task_scope", sa.String(32), nullable=False, server_default="plan"),
        schema="dev_meta",
    )
    op.create_index(
        "idx_plan_registry_scope_user",
        "plan_registry",
        ["task_scope", "user_id"],
        schema="dev_meta",
    )


def downgrade() -> None:
    op.drop_index("idx_plan_registry_scope_user", table_name="plan_registry", schema="dev_meta")
    op.drop_column("plan_registry", "task_scope", schema="dev_meta")
    op.drop_column("plan_registry", "user_id", schema="dev_meta")
