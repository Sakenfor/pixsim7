"""Add markdown and plan_path columns to plan_registry.

Makes DB the primary store for plan content. Filesystem markdown
becomes a convenience export committed to git for searchability.

Revision ID: 20260316_0002
Revises: 20260316_0001
Create Date: 2026-03-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260316_0002"
down_revision = "20260316_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "plan_registry",
        sa.Column("markdown", sa.Text(), nullable=True),
        schema="dev_meta",
    )
    op.add_column(
        "plan_registry",
        sa.Column("plan_path", sa.String(length=512), nullable=True),
        schema="dev_meta",
    )


def downgrade() -> None:
    op.drop_column("plan_registry", "plan_path", schema="dev_meta")
    op.drop_column("plan_registry", "markdown", schema="dev_meta")
