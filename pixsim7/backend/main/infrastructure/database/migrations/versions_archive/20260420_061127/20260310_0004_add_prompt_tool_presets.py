"""Add prompt_tool_presets table.

Revision ID: 20260310_0004
Revises: 20260310_0003
Create Date: 2026-03-10
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260310_0004"
down_revision = "20260310_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "prompt_tool_presets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), nullable=False),
        sa.Column("preset_id", sa.String(length=120), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("category", sa.String(length=32), nullable=False, server_default=sa.text("'rewrite'")),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("requires", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("defaults", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("owner_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "owner_user_id",
            "preset_id",
            name="uq_prompt_tool_preset_owner_preset_id",
        ),
    )

    op.create_index(op.f("ix_prompt_tool_presets_owner_user_id"), "prompt_tool_presets", ["owner_user_id"], unique=False)
    op.create_index(op.f("ix_prompt_tool_presets_preset_id"), "prompt_tool_presets", ["preset_id"], unique=False)
    op.create_index(op.f("ix_prompt_tool_presets_category"), "prompt_tool_presets", ["category"], unique=False)
    op.create_index(op.f("ix_prompt_tool_presets_created_at"), "prompt_tool_presets", ["created_at"], unique=False)
    op.create_index(op.f("ix_prompt_tool_presets_updated_at"), "prompt_tool_presets", ["updated_at"], unique=False)
    op.create_index("idx_prompt_tool_preset_owner_public", "prompt_tool_presets", ["owner_user_id", "is_public"], unique=False)
    op.create_index("idx_prompt_tool_preset_public_updated", "prompt_tool_presets", ["is_public", "updated_at"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_prompt_tool_preset_public_updated", table_name="prompt_tool_presets")
    op.drop_index("idx_prompt_tool_preset_owner_public", table_name="prompt_tool_presets")
    op.drop_index(op.f("ix_prompt_tool_presets_updated_at"), table_name="prompt_tool_presets")
    op.drop_index(op.f("ix_prompt_tool_presets_created_at"), table_name="prompt_tool_presets")
    op.drop_index(op.f("ix_prompt_tool_presets_category"), table_name="prompt_tool_presets")
    op.drop_index(op.f("ix_prompt_tool_presets_preset_id"), table_name="prompt_tool_presets")
    op.drop_index(op.f("ix_prompt_tool_presets_owner_user_id"), table_name="prompt_tool_presets")
    op.drop_table("prompt_tool_presets")
