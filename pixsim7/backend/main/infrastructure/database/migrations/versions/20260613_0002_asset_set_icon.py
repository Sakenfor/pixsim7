"""asset_set.icon — optional @lib/icons name for set badges / hover toggles

Adds a nullable ``icon`` column to ``asset_set`` so a set can carry its own
glyph (rendered on the media-card hover add-target toggle and the sets panel).
Mirrors the existing ``color`` column. No backfill — nullable, defaults null.

See plan ``sets-multi-target-add`` (checkpoint icon-field-backend).

Revision ID: 20260613_0002
Revises: 20260613_0001
Create Date: 2026-06-13
"""
from alembic import op
import sqlalchemy as sa


revision = "20260613_0002"
down_revision = "20260613_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "asset_set",
        sa.Column("icon", sa.String(length=200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("asset_set", "icon")
