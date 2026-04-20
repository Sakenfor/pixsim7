"""Add block_templates table for reusable prompt composition recipes.

Revision ID: 20260218_0001
Revises: 20260217_0002
Create Date: 2026-02-18
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260218_0001"
down_revision = "20260217_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "block_templates",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("slots", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("composition_strategy", sa.String(50), nullable=False, server_default="sequential"),
        sa.Column("package_name", sa.String(100), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_by", sa.String(100), nullable=True),
        sa.Column("roll_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("template_metadata", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_index("ix_block_templates_slug", "block_templates", ["slug"], unique=True)
    op.create_index("idx_block_template_package_public", "block_templates", ["package_name", "is_public"])
    op.create_index("idx_block_template_created", "block_templates", ["created_at"])


def downgrade() -> None:
    op.drop_index("idx_block_template_created", table_name="block_templates")
    op.drop_index("idx_block_template_package_public", table_name="block_templates")
    op.drop_index("ix_block_templates_slug", table_name="block_templates")
    op.drop_table("block_templates")
