"""Add test_suites table for DB-backed test registry.

Revision ID: 20260318_0002
Revises: 20260318_0001
Create Date: 2026-03-18
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260318_0002"
down_revision = "20260318_0001"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"


def upgrade() -> None:
    op.create_table(
        "test_suites",
        sa.Column("id", sa.String(length=120), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("path", sa.String(length=512), nullable=False),
        sa.Column("layer", sa.String(length=32), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=True),
        sa.Column("category", sa.String(length=120), nullable=True),
        sa.Column("subcategory", sa.String(length=120), nullable=True),
        sa.Column("covers", sa.JSON(), nullable=True),
        sa.Column("order", sa.Float(), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="discovered"),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        schema=SCHEMA,
    )
    op.create_index("ix_test_suites_layer", "test_suites", ["layer"], schema=SCHEMA)
    op.create_index("ix_test_suites_kind", "test_suites", ["kind"], schema=SCHEMA)
    op.create_index("ix_test_suites_category", "test_suites", ["category"], schema=SCHEMA)
    op.create_index("ix_test_suites_created_at", "test_suites", ["created_at"], schema=SCHEMA)


def downgrade() -> None:
    op.drop_index("ix_test_suites_created_at", table_name="test_suites", schema=SCHEMA)
    op.drop_index("ix_test_suites_category", table_name="test_suites", schema=SCHEMA)
    op.drop_index("ix_test_suites_kind", table_name="test_suites", schema=SCHEMA)
    op.drop_index("ix_test_suites_layer", table_name="test_suites", schema=SCHEMA)
    op.drop_table("test_suites", schema=SCHEMA)
