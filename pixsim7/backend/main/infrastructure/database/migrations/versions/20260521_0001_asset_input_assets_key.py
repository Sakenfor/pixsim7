"""assets.input_assets_key — "same input assets" sibling grouping key

Adds a nullable ``input_assets_key`` column to ``assets`` (plan
``media-card-sibling-badges``, checkpoint ``be-input-assets-key``).

The value is a SHA256 hex digest over the sorted, de-duplicated set of
source asset IDs that fed the generation (``media_metadata.generation_context
.source_asset_ids``). It groups every output that started from the *same set
of input assets*, regardless of other params or seed — looser than
``reproducible_hash`` (which also folds in params). Null when the generation
had no input assets (text-to-* generations) and for non-generated assets
(uploads have no generation_context).

Access is always user-scoped (sibling-count GROUP BY per gallery page), so the
column gets a composite partial index ``idx_asset_user_input_key`` rather than
a standalone one.

Existing rows are backfilled out-of-band by
``tools/backfill_input_assets_key.py --apply`` (data-only, not in this
schema migration per the alembic-vs-tools convention).

Revision ID: 20260521_0001
Revises: 20260518_0001
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa


revision = "20260521_0001"
down_revision = "20260518_0001"
branch_labels = None
depends_on = None

_TABLE = "assets"


def upgrade() -> None:
    op.add_column(
        _TABLE,
        sa.Column("input_assets_key", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "idx_asset_user_input_key",
        _TABLE,
        ["user_id", "input_assets_key"],
        unique=False,
        postgresql_where=sa.text("input_assets_key IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("idx_asset_user_input_key", table_name=_TABLE)
    op.drop_column(_TABLE, "input_assets_key")
