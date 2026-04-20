"""Add source column to prompt_family_tag.

Distinguishes manual (user-curated) from ai (auto-suggested) tag links.
AI tags are replaced on each suggestion run; manual tags are never touched
by the AI tagger.

Revision ID: 20260402_0009
Revises: 20260402_0008
Create Date: 2026-04-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260402_0009"
down_revision = "20260402_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "prompt_family_tag",
        sa.Column(
            "source",
            sa.String(10),
            nullable=False,
            server_default="manual",
        ),
    )


def downgrade() -> None:
    op.drop_column("prompt_family_tag", "source")
