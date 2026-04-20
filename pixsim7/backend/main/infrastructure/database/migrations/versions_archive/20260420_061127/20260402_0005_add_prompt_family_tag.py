"""Add prompt_family_tag join table.

Links PromptFamily records to the shared tag catalog (same pattern as asset_tag).
Replaces the PromptFamily.tags JSON list for structured, queryable tagging.

Revision ID: 20260402_0005
Revises: 20260402_0004
Create Date: 2026-04-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260402_0005"
down_revision = "20260402_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("prompt_family_tag"):
        return

    op.create_table(
        "prompt_family_tag",
        sa.Column("family_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("family_id", "tag_id"),
        sa.ForeignKeyConstraint(["family_id"], ["prompt_families.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tag.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_prompt_family_tag_family", "prompt_family_tag", ["family_id"])
    op.create_index("idx_prompt_family_tag_tag", "prompt_family_tag", ["tag_id"])
    op.create_index("idx_prompt_family_tag_created", "prompt_family_tag", ["created_at"])


def downgrade() -> None:
    op.drop_index("idx_prompt_family_tag_created", table_name="prompt_family_tag")
    op.drop_index("idx_prompt_family_tag_tag", table_name="prompt_family_tag")
    op.drop_index("idx_prompt_family_tag_family", table_name="prompt_family_tag")
    op.drop_table("prompt_family_tag")
