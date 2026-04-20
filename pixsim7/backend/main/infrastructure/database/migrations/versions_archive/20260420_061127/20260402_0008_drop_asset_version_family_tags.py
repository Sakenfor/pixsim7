"""Drop asset_version_families.tags JSON column.

AssetVersionFamily is git-like versioning for assets; change descriptions
are captured via version_message on each asset, not family-level tags.
The tags column was never written to by any application code.

Revision ID: 20260402_0008
Revises: 20260402_0007
Create Date: 2026-04-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260402_0008"
down_revision = "20260402_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("asset_version_families", "tags")


def downgrade() -> None:
    op.add_column(
        "asset_version_families",
        sa.Column("tags", sa.JSON(), nullable=True),
    )
