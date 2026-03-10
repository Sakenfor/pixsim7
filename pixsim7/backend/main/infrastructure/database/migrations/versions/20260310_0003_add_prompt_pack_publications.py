"""Add prompt_pack_publications table.

Revision ID: 20260310_0003
Revises: 20260310_0002
Create Date: 2026-03-10
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260310_0003"
down_revision = "20260310_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "prompt_pack_publications",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("visibility", sa.String(length=32), nullable=False, server_default=sa.text("'private'")),
        sa.Column("review_status", sa.String(length=32), nullable=False, server_default=sa.text("'draft'")),
        sa.Column("reviewed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_notes", sa.Text(), nullable=True),
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
        sa.ForeignKeyConstraint(["version_id"], ["prompt_pack_versions.id"]),
        sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "version_id",
            name="uq_prompt_pack_publication_version",
        ),
    )

    op.create_index(
        op.f("ix_prompt_pack_publications_version_id"),
        "prompt_pack_publications",
        ["version_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prompt_pack_publications_visibility"),
        "prompt_pack_publications",
        ["visibility"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prompt_pack_publications_review_status"),
        "prompt_pack_publications",
        ["review_status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prompt_pack_publications_reviewed_by_user_id"),
        "prompt_pack_publications",
        ["reviewed_by_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prompt_pack_publications_created_at"),
        "prompt_pack_publications",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prompt_pack_publications_updated_at"),
        "prompt_pack_publications",
        ["updated_at"],
        unique=False,
    )
    op.create_index(
        "idx_prompt_pack_publication_visibility_review",
        "prompt_pack_publications",
        ["visibility", "review_status"],
        unique=False,
    )
    op.create_index(
        "idx_prompt_pack_publication_reviewed_by",
        "prompt_pack_publications",
        ["reviewed_by_user_id", "reviewed_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_prompt_pack_publication_reviewed_by", table_name="prompt_pack_publications")
    op.drop_index("idx_prompt_pack_publication_visibility_review", table_name="prompt_pack_publications")
    op.drop_index(op.f("ix_prompt_pack_publications_updated_at"), table_name="prompt_pack_publications")
    op.drop_index(op.f("ix_prompt_pack_publications_created_at"), table_name="prompt_pack_publications")
    op.drop_index(op.f("ix_prompt_pack_publications_reviewed_by_user_id"), table_name="prompt_pack_publications")
    op.drop_index(op.f("ix_prompt_pack_publications_review_status"), table_name="prompt_pack_publications")
    op.drop_index(op.f("ix_prompt_pack_publications_visibility"), table_name="prompt_pack_publications")
    op.drop_index(op.f("ix_prompt_pack_publications_version_id"), table_name="prompt_pack_publications")
    op.drop_table("prompt_pack_publications")
