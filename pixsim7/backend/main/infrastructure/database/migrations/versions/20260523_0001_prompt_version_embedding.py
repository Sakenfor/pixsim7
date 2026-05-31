"""prompt_version_embedding — add semantic embedding columns to prompt_versions

Backs plan ``embedding-service-generalization`` Phase C: gives PromptVersion a
single primary text embedding (768-dim pgvector) + the model id that produced
it, mirroring the BlockPrimitive layout so ``PromptEmbeddingService`` can ride
the generic ``PerRowStorage`` path.

Revision ID: 20260523_0001
Revises: 20260522_0001
Create Date: 2026-05-23
"""
from alembic import op
import sqlalchemy as sa
import pgvector.sqlalchemy


revision = "20260523_0001"
down_revision = "20260522_0001"
branch_labels = None
depends_on = None

_TABLE = "prompt_versions"


def upgrade() -> None:
    # pgvector extension already enabled by earlier asset/block migrations, but
    # keep this idempotent so the table can be stood up in isolation.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.add_column(
        _TABLE,
        sa.Column("embedding", pgvector.sqlalchemy.Vector(dim=768), nullable=True),
    )
    op.add_column(
        _TABLE,
        sa.Column("embedding_model", sa.String(length=100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column(_TABLE, "embedding_model")
    op.drop_column(_TABLE, "embedding")
