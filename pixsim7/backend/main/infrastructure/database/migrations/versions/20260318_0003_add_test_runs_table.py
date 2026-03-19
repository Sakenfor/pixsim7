"""Add test_runs table for storing eval/test run results.

Revision ID: 20260318_0003
Revises: 20260318_0002
Create Date: 2026-03-18
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260318_0003"
down_revision = "20260318_0002"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"


def upgrade() -> None:
    op.create_table(
        "test_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("suite_id", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("summary", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("environment", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["suite_id"],
            [f"{SCHEMA}.test_suites.id"],
            ondelete="CASCADE",
        ),
        schema=SCHEMA,
    )
    op.create_index("ix_test_runs_suite_id", "test_runs", ["suite_id"], schema=SCHEMA)
    op.create_index("ix_test_runs_status", "test_runs", ["status"], schema=SCHEMA)
    op.create_index("ix_test_runs_started_at", "test_runs", ["started_at"], schema=SCHEMA)


def downgrade() -> None:
    op.drop_index("ix_test_runs_started_at", table_name="test_runs", schema=SCHEMA)
    op.drop_index("ix_test_runs_status", table_name="test_runs", schema=SCHEMA)
    op.drop_index("ix_test_runs_suite_id", table_name="test_runs", schema=SCHEMA)
    op.drop_table("test_runs", schema=SCHEMA)
