"""Add cosine similarity index on prompt_blocks.embedding

Revision ID: 20260209_0002
Revises: 20260209_0001
Create Date: 2026-02-09 00:02:00.000000

Adds an IVFFlat index for cosine distance on prompt_blocks.embedding,
partial-filtered to rows where embedding IS NOT NULL.
Improves ORDER BY embedding <=> :query performance.
"""
from alembic import op
from sqlalchemy import inspect

revision = '20260209_0002'
down_revision = '20260209_0001'
branch_labels = None
depends_on = None


def _resolve_block_table() -> str | None:
    """Resolve prompt block table name across legacy/current schemas."""
    conn = op.get_bind()
    tables = set(inspect(conn).get_table_names())
    if "prompt_blocks" in tables:
        return "prompt_blocks"
    if "action_blocks" in tables:
        return "action_blocks"
    return None


def upgrade() -> None:
    block_table = _resolve_block_table()
    if not block_table:
        return

    # Partial index: only rows that actually have an embedding.
    # Uses cosine ops (vector_cosine_ops) matching the <=> operator used in queries.
    # IVFFlat with lists=1 degrades to exact brute-force scan but still lets
    # Postgres use the index for ORDER BY ... LIMIT k.  When row count grows
    # past ~10k, increase lists via CREATE INDEX CONCURRENTLY.
    op.execute(
        """
        CREATE INDEX idx_prompt_block_embedding_cosine
            ON {block_table}
            USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 1)
            WHERE embedding IS NOT NULL
        """.format(block_table=block_table)
    )


def downgrade() -> None:
    block_table = _resolve_block_table()
    if not block_table:
        return
    op.drop_index('idx_prompt_block_embedding_cosine', table_name=block_table)
