"""Add prompt tool preset review workflow columns.

Revision ID: 20260310_0005
Revises: 20260310_0004
Create Date: 2026-03-10
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260310_0005"
down_revision = "20260310_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "prompt_tool_presets",
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'draft'"),
        ),
    )
    op.add_column(
        "prompt_tool_presets",
        sa.Column("approved_by_user_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "prompt_tool_presets",
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "prompt_tool_presets",
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "prompt_tool_presets",
        sa.Column("rejection_reason", sa.Text(), nullable=True),
    )

    op.create_foreign_key(
        "fk_prompt_tool_presets_approved_by_user_id_users",
        "prompt_tool_presets",
        "users",
        ["approved_by_user_id"],
        ["id"],
    )
    op.create_index(
        op.f("ix_prompt_tool_presets_status"),
        "prompt_tool_presets",
        ["status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prompt_tool_presets_approved_by_user_id"),
        "prompt_tool_presets",
        ["approved_by_user_id"],
        unique=False,
    )

    # Backfill legacy shared rows into approved workflow state.
    op.execute(
        sa.text(
            """
            UPDATE prompt_tool_presets
            SET status = 'approved',
                approved_at = COALESCE(approved_at, now())
            WHERE is_public = true
            """
        )
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_prompt_tool_presets_approved_by_user_id"),
        table_name="prompt_tool_presets",
    )
    op.drop_index(
        op.f("ix_prompt_tool_presets_status"),
        table_name="prompt_tool_presets",
    )
    op.drop_constraint(
        "fk_prompt_tool_presets_approved_by_user_id_users",
        "prompt_tool_presets",
        type_="foreignkey",
    )

    op.drop_column("prompt_tool_presets", "rejection_reason")
    op.drop_column("prompt_tool_presets", "rejected_at")
    op.drop_column("prompt_tool_presets", "approved_at")
    op.drop_column("prompt_tool_presets", "approved_by_user_id")
    op.drop_column("prompt_tool_presets", "status")
