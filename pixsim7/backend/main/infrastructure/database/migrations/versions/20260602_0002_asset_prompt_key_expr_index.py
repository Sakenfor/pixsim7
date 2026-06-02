"""add idx_asset_user_prompt_key — expression index on COALESCE(prompt_family_id, prompt_version_id)

The media-card sibling/cohort counts (``AssetSiblingCountService``) group by a
single "prompt" key, ``COALESCE(prompt_family_id, prompt_version_id)`` — the
family when the prompt has one, else the exact version. That facet's GROUP BY /
``IN`` ran against a bare expression with no matching index, so on a large
library it was a full seq scan: ~2.5s per gallery page (measured at 112k rows),
dwarfing every other facet (which already ride user-scoped column indexes).

This expression index lets ``user_id = ? AND COALESCE(...) IN (...)`` seek
directly, dropping the prompt facet from seconds to milliseconds. Partial on
``COALESCE(...) IS NOT NULL`` since the count query only ever looks up non-null
pivot keys (uploads / no-prompt assets are never grouped).

Note: neighbor/sequence walking now skips cohort counts entirely
(``include_cohort_counts=false``); this index is the fix for the surfaces that
DO render the badge (the gallery).

Revision ID: 20260602_0002
Revises: 20260602_0001
Create Date: 2026-06-02
"""
from alembic import op


revision = "20260602_0002"
down_revision = "20260602_0001"
branch_labels = None
depends_on = None

_INDEX = "idx_asset_user_prompt_key"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE INDEX IF NOT EXISTS {_INDEX}
        ON assets (user_id, COALESCE(prompt_family_id, prompt_version_id))
        WHERE COALESCE(prompt_family_id, prompt_version_id) IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {_INDEX}")
