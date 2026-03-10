"""Add prompt_pack_versions table.

Revision ID: 20260310_0002
Revises: 20260310_0001
Create Date: 2026-03-10
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260310_0002"
down_revision = "20260310_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "prompt_pack_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("draft_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("cue_source", sa.Text(), nullable=False),
        sa.Column("compiled_schema_yaml", sa.Text(), nullable=False),
        sa.Column("compiled_manifest_yaml", sa.Text(), nullable=False),
        sa.Column(
            "compiled_blocks_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["draft_id"], ["prompt_pack_drafts.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "draft_id",
            "version",
            name="uq_prompt_pack_version_draft_version",
        ),
    )

    op.create_index(op.f("ix_prompt_pack_versions_draft_id"), "prompt_pack_versions", ["draft_id"], unique=False)
    op.create_index(op.f("ix_prompt_pack_versions_checksum"), "prompt_pack_versions", ["checksum"], unique=False)
    op.create_index(op.f("ix_prompt_pack_versions_created_at"), "prompt_pack_versions", ["created_at"], unique=False)
    op.create_index(
        "idx_prompt_pack_version_draft_created",
        "prompt_pack_versions",
        ["draft_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_prompt_pack_version_draft_created", table_name="prompt_pack_versions")
    op.drop_index(op.f("ix_prompt_pack_versions_created_at"), table_name="prompt_pack_versions")
    op.drop_index(op.f("ix_prompt_pack_versions_checksum"), table_name="prompt_pack_versions")
    op.drop_index(op.f("ix_prompt_pack_versions_draft_id"), table_name="prompt_pack_versions")
    op.drop_table("prompt_pack_versions")

