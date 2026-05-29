"""add idx_manifest_roll_seed

The "same seed" media-card badge counts, per gallery page, how many of the
user's assets share each asset's generation ``roll_seed``. That count query
groups ``generation_batch_item_manifests`` by ``roll_seed`` (joined to
``assets`` for user scoping) filtered on ``roll_seed IN (:page_seeds)``.

``roll_seed`` was unindexed, so every gallery page forced a full scan of the
manifest table to resolve the ``IN`` filter — the source of the long badge
waits. ``roll_seed`` is high-cardinality (effectively random per roll), so a
plain b-tree index turns the filter into a cheap index seek returning only the
handful of rows that share each seed.

The index name and shape match what ``index=True`` on
``GenerationBatchItemManifest.roll_seed`` autogenerates, so alembic drift checks
stay clean.

Revision ID: 20260527_0001
Revises: 20260523_0001
Create Date: 2026-05-27
"""
from alembic import op


revision = "20260527_0001"
down_revision = "20260523_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_generation_batch_item_manifests_roll_seed
        ON generation_batch_item_manifests (roll_seed)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_generation_batch_item_manifests_roll_seed")
