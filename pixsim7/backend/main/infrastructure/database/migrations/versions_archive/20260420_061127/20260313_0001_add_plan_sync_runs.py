"""Add plan_sync_runs table and link plan_events to sync runs.

Revision ID: 20260313_0001
Revises: 20260312_0003
Create Date: 2026-03-13
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260313_0001"
down_revision = "20260312_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plan_sync_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'running'")),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("commit_sha", sa.String(length=64), nullable=True),
        sa.Column("actor", sa.String(length=120), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("updated", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("removed", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("unchanged", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("events", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(op.f("ix_plan_sync_runs_status"), "plan_sync_runs", ["status"], unique=False)
    op.create_index(op.f("ix_plan_sync_runs_started_at"), "plan_sync_runs", ["started_at"], unique=False)
    op.create_index(op.f("ix_plan_sync_runs_finished_at"), "plan_sync_runs", ["finished_at"], unique=False)

    op.add_column("plan_events", sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_plan_events_run_id_plan_sync_runs",
        "plan_events",
        "plan_sync_runs",
        ["run_id"],
        ["id"],
    )
    op.create_index(op.f("ix_plan_events_run_id"), "plan_events", ["run_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_plan_events_run_id"), table_name="plan_events")
    op.drop_constraint("fk_plan_events_run_id_plan_sync_runs", "plan_events", type_="foreignkey")
    op.drop_column("plan_events", "run_id")

    op.drop_index(op.f("ix_plan_sync_runs_finished_at"), table_name="plan_sync_runs")
    op.drop_index(op.f("ix_plan_sync_runs_started_at"), table_name="plan_sync_runs")
    op.drop_index(op.f("ix_plan_sync_runs_status"), table_name="plan_sync_runs")
    op.drop_table("plan_sync_runs")
