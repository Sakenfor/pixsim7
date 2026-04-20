"""Add primitive evaluator tables.

Revision ID: 20260316_0001
Revises: 20260315_0001
Create Date: 2026-03-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "20260316_0001"
down_revision = "20260315_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "primitive_contributions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("generation_id", sa.Integer(), nullable=True),
        sa.Column("primitive_id", sa.String(length=200), nullable=False),
        sa.Column("target_key", sa.String(length=200), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("plan_hash", sa.String(length=64), nullable=True),
        sa.Column("outcome", sa.String(length=32), nullable=False, server_default="'pending'"),
        sa.Column("outcome_signal", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_primitive_contributions_run_id", "primitive_contributions", ["run_id"])
    op.create_index("ix_primitive_contributions_primitive_id", "primitive_contributions", ["primitive_id"])
    op.create_index("ix_primitive_contributions_outcome", "primitive_contributions", ["outcome"])
    op.create_index("ix_primitive_contributions_created_at", "primitive_contributions", ["created_at"])
    op.create_index("ix_primitive_contributions_generation_id", "primitive_contributions", ["generation_id"])

    op.create_table(
        "primitive_effectiveness_scores",
        sa.Column("primitive_id", sa.String(length=200), nullable=False),
        sa.Column("sample_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("success_rate", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("avg_weight", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("last_updated", sa.DateTime(timezone=True), nullable=False),
        sa.Column("score_metadata", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.PrimaryKeyConstraint("primitive_id"),
    )
    op.create_index(
        "ix_primitive_effectiveness_scores_confidence",
        "primitive_effectiveness_scores",
        [sa.text("confidence DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_primitive_effectiveness_scores_confidence", table_name="primitive_effectiveness_scores")
    op.drop_table("primitive_effectiveness_scores")
    op.drop_index("ix_primitive_contributions_generation_id", table_name="primitive_contributions")
    op.drop_index("ix_primitive_contributions_created_at", table_name="primitive_contributions")
    op.drop_index("ix_primitive_contributions_outcome", table_name="primitive_contributions")
    op.drop_index("ix_primitive_contributions_primitive_id", table_name="primitive_contributions")
    op.drop_index("ix_primitive_contributions_run_id", table_name="primitive_contributions")
    op.drop_table("primitive_contributions")
