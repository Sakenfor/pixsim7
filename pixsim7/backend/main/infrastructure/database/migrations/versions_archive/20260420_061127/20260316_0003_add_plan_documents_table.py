"""Add plan_documents table for companion/handoff markdown storage.

Revision ID: 20260316_0003
Revises: 20260316_0002
Create Date: 2026-03-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260316_0003"
down_revision = "20260316_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS dev_meta")
    op.create_table(
        "plan_documents",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("plan_id", sa.String(120), sa.ForeignKey("dev_meta.plan_registry.id"), nullable=False, index=True),
        sa.Column("doc_type", sa.String(32), nullable=False, index=True),
        sa.Column("path", sa.String(512), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("markdown", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        schema="dev_meta",
    )
    op.create_index(
        "idx_plan_doc_plan_type",
        "plan_documents",
        ["plan_id", "doc_type"],
        schema="dev_meta",
    )


def downgrade() -> None:
    op.drop_index("idx_plan_doc_plan_type", table_name="plan_documents", schema="dev_meta")
    op.drop_table("plan_documents", schema="dev_meta")
