"""diagnostic_runs — durable history of admin diagnostic runs

Backs the admin diagnostics runner (plan ``testing-diagnostics-runner``).
The live run manager keeps active runs in process memory for streaming;
this table is the durable mirror so history survives a reload/restart and
is visible from any client.  One row per run; ``events`` holds the full
typed-event stream as JSON, written when the run reaches a terminal state.

Model: ``pixsim7.backend.main.domain.diagnostics.DiagnosticRunRecord``.

Revision ID: 20260522_0001
Revises: 20260521_0002
Create Date: 2026-05-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260522_0001"
down_revision = "20260521_0002"
branch_labels = None
depends_on = None

_TABLE = "diagnostic_runs"


def upgrade() -> None:
    op.create_table(
        _TABLE,
        sa.Column("run_id", sa.String(length=64), nullable=False),
        sa.Column("diagnostic_id", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("started_by", sa.String(length=64), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("event_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("params", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("events", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("run_id"),
    )
    op.create_index(op.f("ix_diagnostic_runs_diagnostic_id"), _TABLE, ["diagnostic_id"])
    op.create_index(op.f("ix_diagnostic_runs_started_at"), _TABLE, ["started_at"])
    op.create_index("idx_diagnostic_runs_diag_started", _TABLE, ["diagnostic_id", "started_at"])


def downgrade() -> None:
    op.drop_index("idx_diagnostic_runs_diag_started", table_name=_TABLE)
    op.drop_index(op.f("ix_diagnostic_runs_started_at"), table_name=_TABLE)
    op.drop_index(op.f("ix_diagnostic_runs_diagnostic_id"), table_name=_TABLE)
    op.drop_table(_TABLE)
