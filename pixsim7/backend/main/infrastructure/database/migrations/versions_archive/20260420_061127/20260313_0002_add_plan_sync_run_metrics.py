"""Add duration and changed-field metrics to plan_sync_runs.

Revision ID: 20260313_0002
Revises: 20260313_0001
Create Date: 2026-03-13
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260313_0002"
down_revision = "20260313_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("plan_sync_runs", sa.Column("duration_ms", sa.Integer(), nullable=True))
    op.add_column("plan_sync_runs", sa.Column("changed_fields", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("plan_sync_runs", "changed_fields")
    op.drop_column("plan_sync_runs", "duration_ms")
