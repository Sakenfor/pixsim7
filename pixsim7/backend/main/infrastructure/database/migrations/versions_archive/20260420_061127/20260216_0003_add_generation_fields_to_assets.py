"""Add denormalized generation fields to assets table.

Revision ID: 20260216_0003
Revises: 20260216_0002
Create Date: 2026-02-16

Denormalizes operation_type, reproducible_hash, and prompt_version_id from
the generations table onto assets.  This eliminates the Generation JOIN on
all hot-path queries (gallery search, grouping, full-text search).
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID


revision = "20260216_0003"
down_revision = "20260216_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "assets",
        sa.Column("operation_type", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "assets",
        sa.Column("reproducible_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "assets",
        sa.Column("prompt_version_id", PG_UUID(as_uuid=True), nullable=True),
    )

    op.create_index("ix_assets_operation_type", "assets", ["operation_type"])
    op.create_index("ix_assets_reproducible_hash", "assets", ["reproducible_hash"])
    op.create_index("ix_assets_prompt_version_id", "assets", ["prompt_version_id"])

    # Backfill from generations table
    op.execute(
        """
        UPDATE assets a
        SET
            operation_type = g.operation_type::text,
            reproducible_hash = g.reproducible_hash,
            prompt_version_id = g.prompt_version_id
        FROM generations g
        WHERE a.source_generation_id = g.id
          AND (a.operation_type IS NULL
               OR a.reproducible_hash IS NULL
               OR a.prompt_version_id IS NULL)
        """
    )


def downgrade() -> None:
    op.drop_index("ix_assets_prompt_version_id", table_name="assets")
    op.drop_index("ix_assets_reproducible_hash", table_name="assets")
    op.drop_index("ix_assets_operation_type", table_name="assets")
    op.drop_column("assets", "prompt_version_id")
    op.drop_column("assets", "reproducible_hash")
    op.drop_column("assets", "operation_type")
