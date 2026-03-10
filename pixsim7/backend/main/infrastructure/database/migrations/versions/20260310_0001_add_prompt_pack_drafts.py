"""Add prompt_pack_drafts table.

Revision ID: 20260310_0001
Revises: 20260308_0001
Create Date: 2026-03-10
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260310_0001"
down_revision = "20260308_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "prompt_pack_drafts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), nullable=False),
        sa.Column("namespace", sa.String(length=255), nullable=False),
        sa.Column("pack_slug", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'draft'")),
        sa.Column("cue_source", sa.Text(), nullable=False, server_default=""),
        sa.Column("last_compile_status", sa.String(length=32), nullable=True),
        sa.Column(
            "last_compile_errors",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("last_compiled_at", sa.DateTime(timezone=True), nullable=True),
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
            "namespace",
            "pack_slug",
            name="uq_prompt_pack_draft_owner_namespace_slug",
        ),
    )

    op.create_index(op.f("ix_prompt_pack_drafts_owner_user_id"), "prompt_pack_drafts", ["owner_user_id"], unique=False)
    op.create_index(op.f("ix_prompt_pack_drafts_namespace"), "prompt_pack_drafts", ["namespace"], unique=False)
    op.create_index(op.f("ix_prompt_pack_drafts_pack_slug"), "prompt_pack_drafts", ["pack_slug"], unique=False)
    op.create_index(op.f("ix_prompt_pack_drafts_status"), "prompt_pack_drafts", ["status"], unique=False)
    op.create_index(op.f("ix_prompt_pack_drafts_created_at"), "prompt_pack_drafts", ["created_at"], unique=False)
    op.create_index(op.f("ix_prompt_pack_drafts_updated_at"), "prompt_pack_drafts", ["updated_at"], unique=False)
    op.create_index(
        "idx_prompt_pack_draft_owner_status",
        "prompt_pack_drafts",
        ["owner_user_id", "status"],
        unique=False,
    )
    op.create_index(
        "idx_prompt_pack_draft_owner_updated",
        "prompt_pack_drafts",
        ["owner_user_id", "updated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_prompt_pack_draft_owner_updated", table_name="prompt_pack_drafts")
    op.drop_index("idx_prompt_pack_draft_owner_status", table_name="prompt_pack_drafts")
    op.drop_index(op.f("ix_prompt_pack_drafts_updated_at"), table_name="prompt_pack_drafts")
    op.drop_index(op.f("ix_prompt_pack_drafts_created_at"), table_name="prompt_pack_drafts")
    op.drop_index(op.f("ix_prompt_pack_drafts_status"), table_name="prompt_pack_drafts")
    op.drop_index(op.f("ix_prompt_pack_drafts_pack_slug"), table_name="prompt_pack_drafts")
    op.drop_index(op.f("ix_prompt_pack_drafts_namespace"), table_name="prompt_pack_drafts")
    op.drop_index(op.f("ix_prompt_pack_drafts_owner_user_id"), table_name="prompt_pack_drafts")
    op.drop_table("prompt_pack_drafts")

