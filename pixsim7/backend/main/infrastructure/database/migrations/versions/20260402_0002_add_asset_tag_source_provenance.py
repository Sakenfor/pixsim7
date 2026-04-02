"""add asset_tag source provenance

Adds provenance tracking for asset-tag assignments.

Revision ID: 20260402_0002
Revises: 20260402_0001
Create Date: 2026-04-02
"""
from alembic import op
import sqlalchemy as sa


revision = "20260402_0002"
down_revision = "20260402_0001"
branch_labels = None
depends_on = None

SOURCE_CHECK_NAME = "ck_asset_tag_source_valid"
SOURCE_INDEX_NAME = "idx_asset_tag_source"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("asset_tag")}

    if "source" not in columns:
        op.add_column(
            "asset_tag",
            sa.Column(
                "source",
                sa.String(length=16),
                nullable=False,
                server_default=sa.text("'unknown'"),
            ),
        )

    # Normalize any null/empty values from partial/manual updates.
    op.execute(
        """
        UPDATE asset_tag
        SET source = 'unknown'
        WHERE source IS NULL OR source = ''
        """
    )

    op.create_check_constraint(
        SOURCE_CHECK_NAME,
        "asset_tag",
        "source IN ('unknown','manual','system','analyzer')",
    )
    op.create_index(SOURCE_INDEX_NAME, "asset_tag", ["source"])

    # New writes default to manual unless caller specifies otherwise.
    op.alter_column(
        "asset_tag",
        "source",
        existing_type=sa.String(length=16),
        server_default=sa.text("'manual'"),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.drop_index(SOURCE_INDEX_NAME, table_name="asset_tag")
    op.drop_constraint(SOURCE_CHECK_NAME, "asset_tag", type_="check")
    op.drop_column("asset_tag", "source")

