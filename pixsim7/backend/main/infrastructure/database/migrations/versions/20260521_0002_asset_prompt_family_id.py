"""assets.prompt_family_id — denormalized "same prompt family" grouping key

Adds a nullable ``prompt_family_id`` column to ``assets`` (plan
``media-card-sibling-badges``, checkpoint ``be-prompt-family``).

Denormalized from ``PromptVersion.family_id`` (resolved via the asset's
``prompt_version_id`` at creation) so "same prompt, all versions" grouping —
the sibling-count badge and the mini-gallery filter — need no join. Null for
one-off prompts not in a family and for non-generated assets (uploads). No DB
FK, matching ``prompt_version_id``'s cross-domain-separation convention.

Access is user-scoped, so the column gets a composite partial index
``idx_asset_user_prompt_family``.

Existing rows are backfilled out-of-band by
``tools/backfill_prompt_family_id.py --apply`` (data-only, per the
alembic-vs-tools convention).

Revision ID: 20260521_0002
Revises: 20260521_0001
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID


revision = "20260521_0002"
down_revision = "20260521_0001"
branch_labels = None
depends_on = None

_TABLE = "assets"


def upgrade() -> None:
    op.add_column(
        _TABLE,
        sa.Column("prompt_family_id", PG_UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "idx_asset_user_prompt_family",
        _TABLE,
        ["user_id", "prompt_family_id"],
        unique=False,
        postgresql_where=sa.text("prompt_family_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("idx_asset_user_prompt_family", table_name=_TABLE)
    op.drop_column(_TABLE, "prompt_family_id")
