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

revision = '20260209_0001'
down_revision = '20260207_0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'prompt_blocks',
        sa.Column('embedding', Vector(dim=768), nullable=True)
    )
    op.add_column(
        'prompt_blocks',
        sa.Column('embedding_model', sa.String(100), nullable=True)
    )
    op.create_index(
        'idx_prompt_block_embedding_model',
        'prompt_blocks',
        ['embedding_model']
    )


def downgrade() -> None:
    op.drop_index('idx_prompt_block_embedding_model', table_name='prompt_blocks')
    op.drop_column('prompt_blocks', 'embedding_model')
    op.drop_column('prompt_blocks', 'embedding')
