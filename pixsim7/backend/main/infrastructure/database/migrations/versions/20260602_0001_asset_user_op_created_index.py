"""add idx_asset_user_op_created (user_id, operation_type, created_at)

Time-cohort neighbor walking (the input-slot ‹ › chevrons and other
``useAssetSequence`` consumers) lists assets near a pivot filtered by the
pivot's own operation type, ordered by ``created_at``. That filter now targets
the denormalized ``Asset.operation_type`` COLUMN (``asset_operation_type`` in
the search request) instead of a correlated ``EXISTS`` over ``asset_lineage``.

Without a composite index the planner scanned the whole ``created_at`` timeline
and re-checked the operation per row, so walking forward into a sparse cohort
took ~2-3s per batch. This index lets a created_at-ordered range scan stay
DENSE within a single ``(user_id, operation_type)`` cohort — turning the walk
into an index seek regardless of how far forward the next match is.

Partial on ``operation_type IS NOT NULL``: the column is only set for generated
assets, and the filter is only applied when present, so NULL rows would just
bloat the index.

Revision ID: 20260602_0001
Revises: 20260531_0001
Create Date: 2026-06-02
"""
from alembic import op


revision = "20260602_0001"
down_revision = "20260531_0001"
branch_labels = None
depends_on = None

_INDEX = "idx_asset_user_op_created"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE INDEX IF NOT EXISTS {_INDEX}
        ON assets (user_id, operation_type, created_at)
        WHERE operation_type IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {_INDEX}")
