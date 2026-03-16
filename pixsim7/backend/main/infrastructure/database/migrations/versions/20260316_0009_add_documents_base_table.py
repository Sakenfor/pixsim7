"""Add documents base table.

Base entity for all structured content: docs, audits, decisions, guides.
Plans will eventually get a document_id FK to this table, but for now
they coexist independently.

Revision ID: 20260316_0009
Revises: 20260316_0008
Create Date: 2026-03-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260316_0009"
down_revision = "20260316_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "documents",
        sa.Column("id", sa.String(120), primary_key=True),
        sa.Column("doc_type", sa.String(32), nullable=False, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft", index=True),
        sa.Column("owner", sa.String(120), nullable=False, server_default="unassigned"),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("markdown", sa.Text(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True, index=True),
        sa.Column("visibility", sa.String(32), nullable=False, server_default="private"),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("extra", sa.JSON(), nullable=True),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        schema="dev_meta",
    )
    # Shares for documents (same pattern as plan_shares)
    op.create_table(
        "document_shares",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("document_id", sa.String(120), sa.ForeignKey("dev_meta.documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(32), nullable=False, server_default="viewer"),
        sa.Column("granted_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        schema="dev_meta",
    )
    op.create_index("idx_doc_shares_doc_user", "document_shares", ["document_id", "user_id"], unique=True, schema="dev_meta")
    op.create_index("idx_doc_shares_user", "document_shares", ["user_id"], schema="dev_meta")
    # Events for documents
    op.create_table(
        "document_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("document_id", sa.String(120), sa.ForeignKey("dev_meta.documents.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("field", sa.String(64), nullable=True),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("actor", sa.String(120), nullable=True),
        sa.Column("timestamp", sa.DateTime(), nullable=False, index=True),
        schema="dev_meta",
    )


def downgrade() -> None:
    op.drop_table("document_events", schema="dev_meta")
    op.drop_index("idx_doc_shares_user", table_name="document_shares", schema="dev_meta")
    op.drop_index("idx_doc_shares_doc_user", table_name="document_shares", schema="dev_meta")
    op.drop_table("document_shares", schema="dev_meta")
    op.drop_table("documents", schema="dev_meta")
