"""Add draft fields to game_project_snapshots for autosave/recovery.

Revision ID: 20260214_0003
Revises: 20260214_0002
Create Date: 2026-02-14 02:00:00.000000

Adds:
- is_draft: boolean flag to distinguish drafts from saved snapshots
- draft_source_project_id: links a draft back to its source project
- Indexes on both columns
- Partial unique index: one draft per user per source project
"""

from alembic import op
import sqlalchemy as sa


revision = "20260214_0003"
down_revision = "20260214_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "game_project_snapshots",
        sa.Column("is_draft", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "game_project_snapshots",
        sa.Column("draft_source_project_id", sa.Integer(), nullable=True),
    )

    op.create_index(
        op.f("ix_game_project_snapshots_is_draft"),
        "game_project_snapshots",
        ["is_draft"],
        unique=False,
    )
    op.create_index(
        op.f("ix_game_project_snapshots_draft_source_project_id"),
        "game_project_snapshots",
        ["draft_source_project_id"],
        unique=False,
    )

    # One draft per user per source project (COALESCE handles NULL source).
    op.create_index(
        "uq_one_draft_per_user_per_source",
        "game_project_snapshots",
        ["owner_user_id", sa.text("COALESCE(draft_source_project_id, 0)")],
        unique=True,
        postgresql_where=sa.text("is_draft = true"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_one_draft_per_user_per_source",
        table_name="game_project_snapshots",
    )
    op.drop_index(
        op.f("ix_game_project_snapshots_draft_source_project_id"),
        table_name="game_project_snapshots",
    )
    op.drop_index(
        op.f("ix_game_project_snapshots_is_draft"),
        table_name="game_project_snapshots",
    )
    op.drop_column("game_project_snapshots", "draft_source_project_id")
    op.drop_column("game_project_snapshots", "is_draft")
