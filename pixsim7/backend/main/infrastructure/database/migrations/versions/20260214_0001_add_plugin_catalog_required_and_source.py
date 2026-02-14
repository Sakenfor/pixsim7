"""Add is_required and source columns to plugin_catalog.

Revision ID: 20260214_0001
Revises: 20260211_0002
Create Date: 2026-02-14 00:10:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260214_0001"
down_revision = "20260211_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "plugin_catalog",
        sa.Column("is_required", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "plugin_catalog",
        sa.Column("source", sa.String(length=50), nullable=False, server_default="bundle"),
    )

    # Existing built-in scene plugin is source-registered on frontend, not bundle-hosted.
    op.execute(
        sa.text(
            """
            UPDATE plugin_catalog
            SET source = 'source',
                bundle_url = NULL,
                manifest_url = NULL
            WHERE plugin_id = 'scene-view:comic-panels'
            """
        )
    )


def downgrade() -> None:
    op.drop_column("plugin_catalog", "source")
    op.drop_column("plugin_catalog", "is_required")
