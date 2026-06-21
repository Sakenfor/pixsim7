"""resource_grants.expires_at — optional time-boxed grants

Adds a nullable expiry to the generic grant primitive. Past ``expires_at`` a
grant is treated as inactive (like a soft revoke) by visibility / cap / list
logic. NULL = never expires.

Additive (ALTER ADD COLUMN), backward-compatible: existing code that doesn't
reference the column keeps working.

Revision ID: 20260621_0004
Revises: 20260621_0003
Create Date: 2026-06-21
"""
from alembic import op
import sqlalchemy as sa


revision = "20260621_0004"
down_revision = "20260621_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "resource_grants",
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("resource_grants", "expires_at")
