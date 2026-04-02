"""Drop prompt_families.tags JSON column.

Tags are now managed exclusively via the prompt_family_tag join table.
The JSON column was the original implementation and was kept temporarily
for the backfill migration (20260402_0006).  It is no longer read or
written by application code.

Revision ID: 20260402_0007
Revises: 20260402_0006
Create Date: 2026-04-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260402_0007"
down_revision = "20260402_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("prompt_families", "tags")


def downgrade() -> None:
    op.add_column(
        "prompt_families",
        sa.Column("tags", sa.JSON(), nullable=True),
    )
