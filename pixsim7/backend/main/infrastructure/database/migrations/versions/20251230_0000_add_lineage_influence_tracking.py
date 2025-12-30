"""add lineage influence tracking fields

Adds influence tracking to asset_lineage for multi-image edit operations:
- influence_type: how parent contributed (content/style/structure/mask/blend/replacement/reference)
- influence_weight: estimated contribution weight 0.0-1.0
- influence_region: affected region (full/foreground/background/subject:<id>/mask:<label>)
- prompt_ref_name: prompt reference token for round-trip tracking

Revision ID: 20251230_0000
Revises: 20251229_0000
Create Date: 2025-12-30
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = '20251230_0000'
down_revision = '20251229_0000'
branch_labels = None
depends_on = None


def _table_exists(conn, table_name: str) -> bool:
    return table_name in inspect(conn).get_table_names()


def upgrade() -> None:
    """Add influence tracking columns to asset_lineage"""
    conn = op.get_bind()

    if not _table_exists(conn, "asset_lineage"):
        return

    # Influence tracking fields
    op.add_column(
        "asset_lineage",
        sa.Column(
            "influence_type",
            sa.String(length=32),
            nullable=True,
            comment="How parent contributed: content, style, structure, mask, blend, replacement, reference",
        ),
    )
    op.add_column(
        "asset_lineage",
        sa.Column(
            "influence_weight",
            sa.Float(),
            nullable=True,
            comment="Estimated contribution weight 0.0-1.0",
        ),
    )
    op.add_column(
        "asset_lineage",
        sa.Column(
            "influence_region",
            sa.String(length=64),
            nullable=True,
            comment="Affected region: full, foreground, background, subject:<id>, mask:<label>",
        ),
    )

    # Prompt reference binding
    op.add_column(
        "asset_lineage",
        sa.Column(
            "prompt_ref_name",
            sa.String(length=64),
            nullable=True,
            comment="Prompt reference token: image_1, woman_ref, animal_source",
        ),
    )

    # Index for influence queries
    op.create_index(
        "idx_lineage_influence",
        "asset_lineage",
        ["child_asset_id", "influence_type"],
    )


def downgrade() -> None:
    """Remove influence tracking columns from asset_lineage"""
    conn = op.get_bind()

    if not _table_exists(conn, "asset_lineage"):
        return

    op.drop_index("idx_lineage_influence", table_name="asset_lineage")
    op.drop_column("asset_lineage", "prompt_ref_name")
    op.drop_column("asset_lineage", "influence_region")
    op.drop_column("asset_lineage", "influence_weight")
    op.drop_column("asset_lineage", "influence_type")
