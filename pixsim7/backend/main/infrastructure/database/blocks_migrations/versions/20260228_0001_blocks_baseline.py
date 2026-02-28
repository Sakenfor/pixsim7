"""Blocks DB baseline — create block_primitives table.

Revision ID: 20260228_0001
Revises: None
Create Date: 2026-02-28
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "20260228_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable pgvector extension for embedding columns
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "block_primitives",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("block_id", sa.String(200), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("tags", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        # Ownership
        sa.Column("owner_id", sa.Uuid(), nullable=True),
        sa.Column("source", sa.String(50), nullable=False, server_default=sa.text("'system'")),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        # Growth
        sa.Column("avg_rating", sa.Float(), nullable=True),
        sa.Column("usage_count", sa.Integer(), nullable=False, server_default="0"),
        # Embedding — added via raw SQL below (pgvector type)
        sa.Column("embedding_model", sa.String(100), nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # Add vector column via raw SQL (pgvector type not natively in SA)
    op.execute("ALTER TABLE block_primitives ADD COLUMN embedding vector(768)")

    # Indexes
    op.create_index("ix_block_primitives_block_id", "block_primitives", ["block_id"], unique=True)
    op.create_index("ix_block_primitives_category", "block_primitives", ["category"])
    op.create_index("ix_block_primitives_is_public", "block_primitives", ["is_public"])
    op.create_index("ix_block_primitives_created_at", "block_primitives", ["created_at"])
    op.create_index(
        "ix_block_primitives_tags",
        "block_primitives",
        ["tags"],
        postgresql_using="gin",
    )


def downgrade() -> None:
    op.drop_table("block_primitives")
    op.execute("DROP EXTENSION IF EXISTS vector")
