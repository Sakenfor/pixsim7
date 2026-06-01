"""prompt_version_embedding_hnsw — ANN index for prompt similarity search

Backs plan ``embedding-service-generalization`` Phase C/D. ``PromptEmbeddingService``
similarity queries (and the asset-search ``similar_prompt_version_id`` filter that
rides on it) did an exact KNN full scan over every ``prompt_versions.embedding``
row — slow once the table holds ~20k+ vectors. Add an HNSW index with
``vector_cosine_ops`` (the distance op the service uses, ``<=>``) so the resolve
step becomes an approximate index scan.

Mirrors the ``asset_embedding`` ANN-index pattern (that one is IVFFlat); HNSW is
chosen here for better recall/latency and zero ``lists`` tuning as the table grows
(pgvector >= 0.5; this DB is 0.8.1).

Revision ID: 20260531_0001
Revises: 20260529_0001
Create Date: 2026-05-31
"""
from alembic import op


revision = "20260531_0001"
down_revision = "20260529_0001"
branch_labels = None
depends_on = None

_INDEX = "idx_prompt_version_embedding_hnsw"
_TABLE = "prompt_versions"


def upgrade() -> None:
    # HNSW with cosine ops; m / ef_construction left at pgvector defaults (16 / 64),
    # which are well-suited to a ~20k-row, 768-dim set.
    op.execute(
        f"CREATE INDEX IF NOT EXISTS {_INDEX} "
        f"ON {_TABLE} USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {_INDEX}")
