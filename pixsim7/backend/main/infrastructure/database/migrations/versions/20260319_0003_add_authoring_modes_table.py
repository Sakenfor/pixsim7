"""Add authoring_modes table for DB-persisted prompt authoring modes.

Revision ID: 20260319_0003
Revises: 20260319_0002
Create Date: 2026-03-19
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260319_0003"
down_revision = "20260319_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("authoring_modes"):
        return

    op.create_table(
        "authoring_modes",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("sequence_role", sa.String(50), nullable=True),
        sa.Column("generation_hints", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("recommended_tags", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("required_fields", sa.JSON(), nullable=False, server_default='["prompt_text"]'),
        sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("authoring_modes")
