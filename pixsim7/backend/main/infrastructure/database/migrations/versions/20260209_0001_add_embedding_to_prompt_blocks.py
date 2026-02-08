"""Add embedding columns to prompt_blocks

Revision ID: 20260209_0001
Revises: 20260207_0002
Create Date: 2026-02-09 00:01:00.000000

Adds vector embedding and embedding_model columns to prompt_blocks table
for semantic similarity search. Uses pgvector Vector(768) type, matching
the Asset.embedding pattern.
"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy import inspect

revision = '20260209_0001'
down_revision = '20260207_0002'
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

    op.add_column(
        block_table,
        sa.Column('embedding', Vector(dim=768), nullable=True)
    )
    op.add_column(
        block_table,
        sa.Column('embedding_model', sa.String(100), nullable=True)
    )
    op.create_index(
        'idx_prompt_block_embedding_model',
        block_table,
        ['embedding_model']
    )


def downgrade() -> None:
    block_table = _resolve_block_table()
    if not block_table:
        return

    op.drop_index('idx_prompt_block_embedding_model', table_name=block_table)
    op.drop_column(block_table, 'embedding_model')
    op.drop_column(block_table, 'embedding')
