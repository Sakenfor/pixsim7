"""Add visibility field to plan_registry for sharing control.

visibility values:
- 'private': only owner can see (default for user tasks)
- 'shared': visible to all authenticated users
- 'public': visible to everyone (default for dev plans)

Revision ID: 20260316_0006
Revises: 20260316_0005
Create Date: 2026-03-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260316_0006"
down_revision = "20260316_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "plan_registry",
        sa.Column("visibility", sa.String(32), nullable=False, server_default="public"),
        schema="dev_meta",
    )
    # Default user tasks to private
    op.execute("""
        UPDATE dev_meta.plan_registry
        SET visibility = 'private'
        WHERE task_scope = 'user' AND visibility = 'public'
    """)


def downgrade() -> None:
    op.drop_column("plan_registry", "visibility", schema="dev_meta")
