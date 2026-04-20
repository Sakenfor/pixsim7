"""Add clip sequence tables.

Revision ID: 20260112_0002
Revises: 20260112_0001
Create Date: 2026-01-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260112_0002"
down_revision = "20260112_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "clip_sequences",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("character_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("npc_id", sa.Integer(), nullable=True),
        sa.Column("concept_refs", sa.JSON(), nullable=True),
        sa.Column("loop_mode", sa.String(length=16), nullable=False, server_default="loop"),
        sa.Column("loop_start_order", sa.Integer(), nullable=True),
        sa.Column("loop_end_order", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["character_id"], ["characters.id"]),
        sa.ForeignKeyConstraint(["npc_id"], ["game_npcs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_clip_sequences_name"), "clip_sequences", ["name"], unique=False)
    op.create_index(op.f("ix_clip_sequences_character_id"), "clip_sequences", ["character_id"], unique=False)
    op.create_index(op.f("ix_clip_sequences_npc_id"), "clip_sequences", ["npc_id"], unique=False)

    op.create_table(
        "clip_sequence_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("sequence_id", sa.Integer(), nullable=False),
        sa.Column("clip_id", sa.Integer(), nullable=True),
        sa.Column("asset_id", sa.Integer(), nullable=True),
        sa.Column("branch_id", sa.Integer(), nullable=True),
        sa.Column("sequence_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("entry_type", sa.String(length=16), nullable=False),
        sa.Column("duration_sec", sa.Float(), nullable=True),
        sa.Column("concept_refs", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"]),
        sa.ForeignKeyConstraint(["branch_id"], ["asset_branches.id"]),
        sa.ForeignKeyConstraint(["clip_id"], ["asset_clips.id"]),
        sa.ForeignKeyConstraint(["sequence_id"], ["clip_sequences.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_clip_sequence_entries_sequence_id"), "clip_sequence_entries", ["sequence_id"], unique=False)
    op.create_index(op.f("ix_clip_sequence_entries_created_at"), "clip_sequence_entries", ["created_at"], unique=False)
    op.create_index(
        "idx_clip_sequence_entry_order",
        "clip_sequence_entries",
        ["sequence_id", "sequence_order"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("idx_clip_sequence_entry_order", table_name="clip_sequence_entries")
    op.drop_index(op.f("ix_clip_sequence_entries_created_at"), table_name="clip_sequence_entries")
    op.drop_index(op.f("ix_clip_sequence_entries_sequence_id"), table_name="clip_sequence_entries")
    op.drop_table("clip_sequence_entries")

    op.drop_index(op.f("ix_clip_sequences_npc_id"), table_name="clip_sequences")
    op.drop_index(op.f("ix_clip_sequences_character_id"), table_name="clip_sequences")
    op.drop_index(op.f("ix_clip_sequences_name"), table_name="clip_sequences")
    op.drop_table("clip_sequences")
