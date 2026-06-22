"""link asset analyses to their backfill run (downstream-failure rollup)

Analysis backfills are fire-and-enqueue: the run reaches COMPLETED once every
analysis is *created*, but the embeddings (and any 409 model_not_served) execute
later in the analysis worker. With no back-reference, a model-mismatch backfill
showed COMPLETED / 0 failed while every embedding silently failed downstream.

This adds a nullable, indexed soft link so the backfill API can lazily reconcile
the real per-analysis outcomes (pending / completed / failed) for a run. No FK
constraint on purpose — it's an observability tag, not a lifecycle dependency.

Revision ID: 20260621_0005
Revises: 20260621_0004
Create Date: 2026-06-22
"""
import sqlalchemy as sa
from alembic import op


revision = "20260621_0005"
down_revision = "20260621_0004"
branch_labels = None
depends_on = None

_INDEX = "idx_asset_analysis_backfill_run"


def upgrade() -> None:
    op.add_column(
        "asset_analyses",
        sa.Column("backfill_run_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        _INDEX, "asset_analyses", ["backfill_run_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(_INDEX, table_name="asset_analyses")
    op.drop_column("asset_analyses", "backfill_run_id")
