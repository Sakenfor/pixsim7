"""Add cosine similarity index on prompt_blocks.embedding

Revision ID: 20260209_0002
Revises: 20260209_0001
Create Date: 2026-02-09 00:02:00.000000

Adds an IVFFlat index for cosine distance on prompt_blocks.embedding,
partial-filtered to rows where embedding IS NOT NULL.
Improves ORDER BY embedding <=> :query performance.
"""
from alembic import op

revision = '20260209_0002'
down_revision = '20260209_0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Partial index: only rows that actually have an embedding.
    # Uses cosine ops (vector_cosine_ops) matching the <=> operator used in queries.
    # IVFFlat with lists=1 degrades to exact brute-force scan but still lets
    # Postgres use the index for ORDER BY ... LIMIT k.  When row count grows
    # past ~10k, increase lists via CREATE INDEX CONCURRENTLY.
    op.execute(
        """
        CREATE INDEX idx_prompt_block_embedding_cosine
            ON prompt_blocks
            USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 1)
            WHERE embedding IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_index('idx_prompt_block_embedding_cosine', table_name='prompt_blocks')
