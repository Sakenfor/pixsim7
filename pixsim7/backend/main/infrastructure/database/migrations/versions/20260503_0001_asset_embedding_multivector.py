"""asset_embedding multi-vector table; drop Asset.embedding column

Replaces the single Asset.embedding column with a dedicated
asset_embedding(asset_id, embedder_id, vector, model_id, generated_at)
table. Multiple embedders can coexist per asset.

Also adds:
- provider_instance_configs.embedder_id — names the vector space an
  asset:embedding analyzer instance writes to
- provider_instance_configs.is_primary — marks the default embedder
  used by similarity search when no embedder_id is specified
- asset_analyses.embedder_id — recorded at creation, used by the
  result applier to route vectors to the right asset_embedding row

Revision ID: 20260503_0001
Revises: 20260502_0001
Create Date: 2026-05-03
"""
from alembic import op
import sqlalchemy as sa
import pgvector.sqlalchemy


revision = "20260503_0001"
down_revision = "20260502_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    op.create_table(
        "asset_embedding",
        sa.Column("asset_id", sa.Integer(), nullable=False),
        sa.Column("embedder_id", sa.String(length=100), nullable=False),
        sa.Column("vector", pgvector.sqlalchemy.Vector(dim=1024), nullable=False),
        sa.Column("model_id", sa.String(length=100), nullable=True),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("asset_id", "embedder_id"),
    )

    op.create_index(
        "idx_asset_embedding_embedder_asset",
        "asset_embedding",
        ["embedder_id", "asset_id"],
    )

    if is_pg:
        op.execute("DROP INDEX IF EXISTS idx_asset_embedding_cosine")
        op.execute(
            """
            CREATE INDEX idx_asset_embedding_vector_cosine
            ON asset_embedding
            USING ivfflat (vector vector_cosine_ops)
            WITH (lists = 100)
            """
        )

    op.drop_column("assets", "embedding")
    op.drop_column("assets", "embedding_generated_at")

    op.add_column(
        "provider_instance_configs",
        sa.Column("embedder_id", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "provider_instance_configs",
        sa.Column(
            "is_primary",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.create_index(
        "idx_provider_instance_embedder_id",
        "provider_instance_configs",
        ["embedder_id"],
    )

    op.add_column(
        "asset_analyses",
        sa.Column("embedder_id", sa.String(length=100), nullable=True),
    )
    op.create_index(
        "idx_asset_analyses_embedder_id",
        "asset_analyses",
        ["embedder_id"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    op.drop_index("idx_asset_analyses_embedder_id", table_name="asset_analyses")
    op.drop_column("asset_analyses", "embedder_id")

    op.drop_index(
        "idx_provider_instance_embedder_id",
        table_name="provider_instance_configs",
    )
    op.drop_column("provider_instance_configs", "is_primary")
    op.drop_column("provider_instance_configs", "embedder_id")

    op.add_column(
        "assets",
        sa.Column("embedding_generated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "assets",
        sa.Column("embedding", pgvector.sqlalchemy.Vector(dim=768), nullable=True),
    )

    if is_pg:
        op.execute(
            """
            CREATE INDEX idx_asset_embedding_cosine
            ON assets
            USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 1)
            WHERE embedding IS NOT NULL
            """
        )
        op.execute("DROP INDEX IF EXISTS idx_asset_embedding_vector_cosine")

    op.drop_index("idx_asset_embedding_embedder_asset", table_name="asset_embedding")
    op.drop_table("asset_embedding")
