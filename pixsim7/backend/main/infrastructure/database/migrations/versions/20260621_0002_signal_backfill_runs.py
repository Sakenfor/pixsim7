"""signal_backfill_runs — durable signal-scan reprobe runs

Persisted run row for re-probing videos to the current signal SCANNER_VERSION
(computes spectral_flatness, which only a full probe_and_stamp(force=True) can
produce). The resumable, pause/cancel-able twin of analysis_backfill_runs;
both drive off the shared BackfillRunServiceBase state machine.

New table only. Status is a non-native enum (varchar) matching enum_column's
``_<name>`` convention, mirroring analysis_backfill_runs.status.

Revision ID: 20260621_0002
Revises: 20260621_0001
Create Date: 2026-06-21
"""
from alembic import op
import sqlalchemy as sa


revision = "20260621_0002"
down_revision = "20260621_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "signal_backfill_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "running",
                "paused",
                "completed",
                "failed",
                "cancelled",
                name="_signal_backfill_status_enum",
                native_enum=False,
                create_constraint=False,
            ),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("target_scanner_version", sa.String(length=20), nullable=False),
        sa.Column("batch_size", sa.Integer(), nullable=False, server_default=sa.text("100")),
        sa.Column("cursor_asset_id", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("total_assets", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("processed_assets", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("scanned_assets", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("broken_assets", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("skipped_assets", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("failed_assets", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(op.f("ix_signal_backfill_runs_user_id"), "signal_backfill_runs", ["user_id"], unique=False)
    op.create_index(op.f("ix_signal_backfill_runs_status"), "signal_backfill_runs", ["status"], unique=False)
    op.create_index(
        op.f("ix_signal_backfill_runs_cursor_asset_id"),
        "signal_backfill_runs",
        ["cursor_asset_id"],
        unique=False,
    )
    op.create_index(op.f("ix_signal_backfill_runs_created_at"), "signal_backfill_runs", ["created_at"], unique=False)
    op.create_index(
        "idx_signal_backfill_user_status",
        "signal_backfill_runs",
        ["user_id", "status", "created_at"],
        unique=False,
    )
    op.create_index(
        "idx_signal_backfill_user_cursor",
        "signal_backfill_runs",
        ["user_id", "cursor_asset_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_signal_backfill_user_cursor", table_name="signal_backfill_runs")
    op.drop_index("idx_signal_backfill_user_status", table_name="signal_backfill_runs")
    op.drop_index(op.f("ix_signal_backfill_runs_created_at"), table_name="signal_backfill_runs")
    op.drop_index(op.f("ix_signal_backfill_runs_cursor_asset_id"), table_name="signal_backfill_runs")
    op.drop_index(op.f("ix_signal_backfill_runs_status"), table_name="signal_backfill_runs")
    op.drop_index(op.f("ix_signal_backfill_runs_user_id"), table_name="signal_backfill_runs")
    op.drop_table("signal_backfill_runs")
