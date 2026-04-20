"""drop generations.raw_params column

Retirement finale for the ``raw_params`` blob.  All backend readers have been
switched to ``canonical_params`` / ``run_context`` / ``final_prompt``, the
retry flow rebuilds from canonical via
``rehydrate_structured_from_canonical``, and the frontend no longer reads it.

Revision ID: 20260419_0004
Revises: 20260419_0003
Create Date: 2026-04-19
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260419_0004"
down_revision = "20260419_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("generations", "raw_params")


def downgrade() -> None:
    op.add_column(
        "generations",
        sa.Column(
            "raw_params",
            postgresql.JSON(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::json"),
        ),
    )
    # Remove the default after backfill so application code controls writes.
    op.alter_column("generations", "raw_params", server_default=None)
