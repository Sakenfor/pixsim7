"""Add generation batch item manifests and harden feedback generation linkage.

Revision ID: 20260221_0002
Revises: 20260221_0001
Create Date: 2026-02-21
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260221_0002"
down_revision = "20260221_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "generation_batch_item_manifests",
        sa.Column(
            "asset_id",
            sa.Integer(),
            sa.ForeignKey("assets.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("batch_id", sa.Uuid(), nullable=False),
        sa.Column("item_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("block_template_id", sa.Uuid(), nullable=True),
        sa.Column("template_slug", sa.String(120), nullable=True),
        sa.Column("roll_seed", sa.Integer(), nullable=True),
        sa.Column("slot_results", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("selected_block_ids", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("assembled_prompt", sa.Text(), nullable=True),
        sa.Column("prompt_version_id", sa.Uuid(), nullable=True),
        sa.Column(
            "generation_id",
            sa.Integer(),
            sa.ForeignKey("generations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("manifest_metadata", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_index(
        "idx_generation_batch_item_manifest_batch_item",
        "generation_batch_item_manifests",
        ["batch_id", "item_index"],
        unique=True,
    )
    op.create_index(
        "ix_generation_batch_item_manifests_batch_id",
        "generation_batch_item_manifests",
        ["batch_id"],
        unique=False,
    )
    op.create_index(
        "ix_generation_batch_item_manifests_block_template_id",
        "generation_batch_item_manifests",
        ["block_template_id"],
        unique=False,
    )
    op.create_index(
        "ix_generation_batch_item_manifests_prompt_version_id",
        "generation_batch_item_manifests",
        ["prompt_version_id"],
        unique=False,
    )
    op.create_index(
        "ix_generation_batch_item_manifests_generation_id",
        "generation_batch_item_manifests",
        ["generation_id"],
        unique=False,
    )
    op.create_index(
        "ix_generation_batch_item_manifests_created_at",
        "generation_batch_item_manifests",
        ["created_at"],
        unique=False,
    )

    # Ensure feedback references survive generation row deletion.
    op.execute(
        "ALTER TABLE prompt_variant_feedback "
        "DROP CONSTRAINT IF EXISTS fk_prompt_variant_feedback_generation_id"
    )
    op.execute(
        "ALTER TABLE prompt_variant_feedback "
        "DROP CONSTRAINT IF EXISTS prompt_variant_feedback_generation_id_fkey"
    )
    op.create_foreign_key(
        "fk_prompt_variant_feedback_generation_id",
        "prompt_variant_feedback",
        "generations",
        ["generation_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE prompt_variant_feedback "
        "DROP CONSTRAINT IF EXISTS fk_prompt_variant_feedback_generation_id"
    )
    op.execute(
        "ALTER TABLE prompt_variant_feedback "
        "DROP CONSTRAINT IF EXISTS prompt_variant_feedback_generation_id_fkey"
    )
    op.create_foreign_key(
        "fk_prompt_variant_feedback_generation_id",
        "prompt_variant_feedback",
        "generations",
        ["generation_id"],
        ["id"],
    )

    op.drop_index("ix_generation_batch_item_manifests_created_at", table_name="generation_batch_item_manifests")
    op.drop_index("ix_generation_batch_item_manifests_generation_id", table_name="generation_batch_item_manifests")
    op.drop_index("ix_generation_batch_item_manifests_prompt_version_id", table_name="generation_batch_item_manifests")
    op.drop_index("ix_generation_batch_item_manifests_block_template_id", table_name="generation_batch_item_manifests")
    op.drop_index("ix_generation_batch_item_manifests_batch_id", table_name="generation_batch_item_manifests")
    op.drop_index("idx_generation_batch_item_manifest_batch_item", table_name="generation_batch_item_manifests")
    op.drop_table("generation_batch_item_manifests")
