"""Add npc_expressions table used by game project bundle export/import.

Revision ID: 20260319_0001
Revises: 20260318_0003
Create Date: 2026-03-19
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260319_0001"
down_revision = "20260318_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("npc_expressions"):
        return

    op.create_table(
        "npc_expressions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("npc_id", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(length=64), nullable=False),
        sa.Column("asset_id", sa.Integer(), nullable=False),
        sa.Column("crop", sa.JSON(), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["npc_id"], ["game_npcs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_npc_expressions_npc_id"), "npc_expressions", ["npc_id"], unique=False)
    op.create_index(op.f("ix_npc_expressions_asset_id"), "npc_expressions", ["asset_id"], unique=False)
    op.create_index(
        op.f("ix_npc_expressions_created_at"),
        "npc_expressions",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_npc_expressions_updated_at"),
        "npc_expressions",
        ["updated_at"],
        unique=False,
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("npc_expressions"):
        return

    op.drop_index(op.f("ix_npc_expressions_updated_at"), table_name="npc_expressions")
    op.drop_index(op.f("ix_npc_expressions_created_at"), table_name="npc_expressions")
    op.drop_index(op.f("ix_npc_expressions_asset_id"), table_name="npc_expressions")
    op.drop_index(op.f("ix_npc_expressions_npc_id"), table_name="npc_expressions")
    op.drop_table("npc_expressions")
