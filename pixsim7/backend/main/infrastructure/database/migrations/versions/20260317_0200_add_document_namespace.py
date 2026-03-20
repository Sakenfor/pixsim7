"""Add namespace to documents.

Revision ID: 20260317_0200
Revises: ebfc1db150af
Create Date: 2026-03-17
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260317_0200"
down_revision = "ebfc1db150af"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("namespace", sa.String(length=255), nullable=True),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_documents_namespace",
        "documents",
        ["namespace"],
        unique=False,
        schema=SCHEMA,
    )

    op.execute(
        sa.text(
            f"""
            UPDATE {SCHEMA}.documents
            SET namespace = 'dev/plans'
            WHERE doc_type = 'plan' AND (namespace IS NULL OR namespace = '')
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_documents_namespace", table_name="documents", schema=SCHEMA)
    op.drop_column("documents", "namespace", schema=SCHEMA)
