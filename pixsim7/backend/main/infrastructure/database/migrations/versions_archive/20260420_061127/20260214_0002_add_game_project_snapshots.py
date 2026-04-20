"""Add game_project_snapshots table for DB-backed authored project storage.

Revision ID: 20260214_0002
Revises: 20260214_0001
Create Date: 2026-02-14 01:20:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260214_0002"
down_revision = "20260214_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "game_project_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), nullable=False),
        sa.Column("source_world_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("bundle", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["source_world_id"], ["game_worlds.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_game_project_snapshots_owner_user_id"),
        "game_project_snapshots",
        ["owner_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_game_project_snapshots_source_world_id"),
        "game_project_snapshots",
        ["source_world_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_game_project_snapshots_created_at"),
        "game_project_snapshots",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_game_project_snapshots_updated_at"),
        "game_project_snapshots",
        ["updated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_game_project_snapshots_updated_at"), table_name="game_project_snapshots")
    op.drop_index(op.f("ix_game_project_snapshots_created_at"), table_name="game_project_snapshots")
    op.drop_index(op.f("ix_game_project_snapshots_source_world_id"), table_name="game_project_snapshots")
    op.drop_index(op.f("ix_game_project_snapshots_owner_user_id"), table_name="game_project_snapshots")
    op.drop_table("game_project_snapshots")
