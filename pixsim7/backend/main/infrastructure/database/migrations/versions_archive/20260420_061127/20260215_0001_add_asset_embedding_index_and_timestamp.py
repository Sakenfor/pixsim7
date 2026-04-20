"""Add IVFFlat index on assets.embedding and embedding_generated_at column.

Revision ID: 20260215_0001
Revises: 20260214_0004
Create Date: 2026-02-15

Adds:
- IVFFlat index on assets.embedding using vector_cosine_ops for similarity search
- embedding_generated_at TIMESTAMP column to track embedding generation status
"""

from alembic import op
import sqlalchemy as sa


revision = "20260215_0001"
down_revision = "20260214_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add embedding_generated_at timestamp column
    op.add_column(
        "assets",
        sa.Column("embedding_generated_at", sa.DateTime(), nullable=True),
    )

    # Create IVFFlat index for cosine similarity search on the embedding column.
    # lists=1 is appropriate for small datasets; increase when row count grows
    # (rule of thumb: lists ~= sqrt(num_rows)).
    # Uses raw SQL because Alembic doesn't have native pgvector index support.
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_asset_embedding_cosine
        ON assets
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 1)
        WHERE embedding IS NOT NULL
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_asset_embedding_cosine")
    op.drop_column("assets", "embedding_generated_at")
