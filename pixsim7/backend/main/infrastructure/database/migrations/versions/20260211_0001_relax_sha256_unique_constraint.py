"""Relax per-user SHA256 unique constraint to non-unique index

Revision ID: 20260211_0001
Revises: 20260209_0002
Create Date: 2026-02-11 00:01:00.000000

Allows multiple assets per user with the same content hash. This is needed
because duplicate generations (same prompt/model) can produce identical files,
and each generation should have its own Asset record. Content deduplication
is handled at the storage layer via content-addressed keys and ContentBlob.
"""

from alembic import op
import sqlalchemy as sa


revision = "20260211_0001"
down_revision = "20260209_0002"
branch_labels = None
depends_on = None


def _index_exists(bind, index_name: str) -> bool:
    row = bind.execute(
        sa.text(
            """
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND indexname = :index_name
            LIMIT 1
            """
        ),
        {"index_name": index_name},
    ).first()
    return row is not None


def upgrade() -> None:
    bind = op.get_bind()

    # Drop the existing UNIQUE partial index
    if _index_exists(bind, "idx_asset_user_sha256"):
        op.drop_index("idx_asset_user_sha256", table_name="assets")

    # Re-create as a plain (non-unique) index for query performance
    op.create_index(
        "idx_asset_user_sha256",
        "assets",
        ["user_id", "sha256"],
        unique=False,
        postgresql_where=sa.text("sha256 IS NOT NULL"),
    )


def downgrade() -> None:
    bind = op.get_bind()

    if _index_exists(bind, "idx_asset_user_sha256"):
        op.drop_index("idx_asset_user_sha256", table_name="assets")

    # Restore unique partial index — may fail if duplicate hashes exist
    op.create_index(
        "idx_asset_user_sha256",
        "assets",
        ["user_id", "sha256"],
        unique=True,
        postgresql_where=sa.text("sha256 IS NOT NULL"),
    )
