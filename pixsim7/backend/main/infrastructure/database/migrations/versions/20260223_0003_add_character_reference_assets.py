"""Add reference_assets and surface_assets JSONB columns to characters.

Structured per-asset metadata (kind, shot, view, pose, expression, etc.)
replaces the flat reference_images list for rich reference management.

Revision ID: 20260223_0003
Revises: 20260223_0002
Create Date: 2026-02-23
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = "20260223_0003"
down_revision = "20260223_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "characters",
        sa.Column("reference_assets", JSONB, nullable=False, server_default="[]"),
    )
    op.add_column(
        "characters",
        sa.Column("surface_assets", JSONB, nullable=False, server_default="[]"),
    )


def downgrade() -> None:
    op.drop_column("characters", "surface_assets")
    op.drop_column("characters", "reference_assets")
