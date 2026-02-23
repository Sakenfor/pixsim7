"""Add generation_chains and chain_executions tables.

New first-class entities for sequential generation orchestration.
See docs/design/SEQUENTIAL_GENERATION_DESIGN.md.

Revision ID: 20260223_0002
Revises: 20260223_0001
Create Date: 2026-02-23
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260223_0002"
down_revision = "20260223_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- generation_chains ---
    op.create_table(
        "generation_chains",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("steps", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("tags", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("chain_metadata", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_by", sa.String(100), nullable=True),
        sa.Column("execution_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_index("idx_generation_chain_created", "generation_chains", ["created_at"])
    op.create_index("idx_generation_chain_public", "generation_chains", ["is_public"])

    # --- chain_executions ---
    op.create_table(
        "chain_executions",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("chain_id", sa.Uuid(), nullable=False),
        sa.Column("steps_snapshot", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("step_states", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("current_step_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("execution_metadata", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index("idx_chain_execution_chain", "chain_executions", ["chain_id"])
    op.create_index("idx_chain_execution_status", "chain_executions", ["status"])
    op.create_index("idx_chain_execution_user", "chain_executions", ["user_id"])


def downgrade() -> None:
    op.drop_table("chain_executions")
    op.drop_table("generation_chains")
