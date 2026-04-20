"""Add analysis idempotency metadata and durable backfill runs.

Revision ID: 20260303_0003
Revises: 20260303_0002
Create Date: 2026-03-03
"""

from alembic import op
import sqlalchemy as sa


revision = "20260303_0003"
down_revision = "20260303_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "analyzer_definitions",
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
    )
    op.create_index(
        op.f("ix_analyzer_definitions_version"),
        "analyzer_definitions",
        ["version"],
        unique=False,
    )

    op.add_column(
        "asset_analyses",
        sa.Column("analysis_point", sa.String(length=120), nullable=False, server_default="manual"),
    )
    op.add_column(
        "asset_analyses",
        sa.Column("analyzer_definition_version", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "asset_analyses",
        sa.Column("effective_config_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "asset_analyses",
        sa.Column("input_fingerprint", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "asset_analyses",
        sa.Column("dedupe_key", sa.String(length=64), nullable=True),
    )

    op.create_index(
        op.f("ix_asset_analyses_analysis_point"),
        "asset_analyses",
        ["analysis_point"],
        unique=False,
    )
    op.create_index(
        op.f("ix_asset_analyses_analyzer_definition_version"),
        "asset_analyses",
        ["analyzer_definition_version"],
        unique=False,
    )
    op.create_index(
        op.f("ix_asset_analyses_effective_config_hash"),
        "asset_analyses",
        ["effective_config_hash"],
        unique=False,
    )
    op.create_index(
        op.f("ix_asset_analyses_input_fingerprint"),
        "asset_analyses",
        ["input_fingerprint"],
        unique=False,
    )
    op.create_index(
        op.f("ix_asset_analyses_dedupe_key"),
        "asset_analyses",
        ["dedupe_key"],
        unique=False,
    )
    op.create_index(
        "idx_analysis_dedupe_lookup",
        "asset_analyses",
        [
            "asset_id",
            "analysis_point",
            "analyzer_id",
            "effective_config_hash",
            "input_fingerprint",
            "status",
        ],
        unique=False,
    )

    op.create_table(
        "analysis_backfill_runs",
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
                name="_analysis_backfill_status_enum",
                native_enum=False,
                create_constraint=False,
            ),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("media_type", sa.String(length=20), nullable=True),
        sa.Column("analyzer_id", sa.String(length=100), nullable=True),
        sa.Column("analyzer_intent", sa.String(length=100), nullable=True),
        sa.Column("analysis_point", sa.String(length=120), nullable=True),
        sa.Column("prompt", sa.String(), nullable=True),
        sa.Column(
            "params",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::json"),
        ),
        sa.Column("priority", sa.Integer(), nullable=False, server_default=sa.text("5")),
        sa.Column("batch_size", sa.Integer(), nullable=False, server_default=sa.text("100")),
        sa.Column("cursor_asset_id", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("total_assets", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("processed_assets", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_analyses", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("deduped_assets", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("failed_assets", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(op.f("ix_analysis_backfill_runs_user_id"), "analysis_backfill_runs", ["user_id"], unique=False)
    op.create_index(op.f("ix_analysis_backfill_runs_status"), "analysis_backfill_runs", ["status"], unique=False)
    op.create_index(op.f("ix_analysis_backfill_runs_media_type"), "analysis_backfill_runs", ["media_type"], unique=False)
    op.create_index(op.f("ix_analysis_backfill_runs_analyzer_id"), "analysis_backfill_runs", ["analyzer_id"], unique=False)
    op.create_index(
        op.f("ix_analysis_backfill_runs_cursor_asset_id"),
        "analysis_backfill_runs",
        ["cursor_asset_id"],
        unique=False,
    )
    op.create_index(op.f("ix_analysis_backfill_runs_created_at"), "analysis_backfill_runs", ["created_at"], unique=False)
    op.create_index(
        "idx_analysis_backfill_user_status",
        "analysis_backfill_runs",
        ["user_id", "status", "created_at"],
        unique=False,
    )
    op.create_index(
        "idx_analysis_backfill_user_cursor",
        "analysis_backfill_runs",
        ["user_id", "cursor_asset_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_analysis_backfill_user_cursor", table_name="analysis_backfill_runs")
    op.drop_index("idx_analysis_backfill_user_status", table_name="analysis_backfill_runs")
    op.drop_index(op.f("ix_analysis_backfill_runs_created_at"), table_name="analysis_backfill_runs")
    op.drop_index(op.f("ix_analysis_backfill_runs_cursor_asset_id"), table_name="analysis_backfill_runs")
    op.drop_index(op.f("ix_analysis_backfill_runs_analyzer_id"), table_name="analysis_backfill_runs")
    op.drop_index(op.f("ix_analysis_backfill_runs_media_type"), table_name="analysis_backfill_runs")
    op.drop_index(op.f("ix_analysis_backfill_runs_status"), table_name="analysis_backfill_runs")
    op.drop_index(op.f("ix_analysis_backfill_runs_user_id"), table_name="analysis_backfill_runs")
    op.drop_table("analysis_backfill_runs")

    op.drop_index("idx_analysis_dedupe_lookup", table_name="asset_analyses")
    op.drop_index(op.f("ix_asset_analyses_dedupe_key"), table_name="asset_analyses")
    op.drop_index(op.f("ix_asset_analyses_input_fingerprint"), table_name="asset_analyses")
    op.drop_index(op.f("ix_asset_analyses_effective_config_hash"), table_name="asset_analyses")
    op.drop_index(op.f("ix_asset_analyses_analyzer_definition_version"), table_name="asset_analyses")
    op.drop_index(op.f("ix_asset_analyses_analysis_point"), table_name="asset_analyses")
    op.drop_column("asset_analyses", "dedupe_key")
    op.drop_column("asset_analyses", "input_fingerprint")
    op.drop_column("asset_analyses", "effective_config_hash")
    op.drop_column("asset_analyses", "analyzer_definition_version")
    op.drop_column("asset_analyses", "analysis_point")

    op.drop_index(op.f("ix_analyzer_definitions_version"), table_name="analyzer_definitions")
    op.drop_column("analyzer_definitions", "version")
