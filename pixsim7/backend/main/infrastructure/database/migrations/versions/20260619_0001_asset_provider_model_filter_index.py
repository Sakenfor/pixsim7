"""expression index for the gallery Model filter's loose-index scan

Opening the gallery filter bar enumerates each filter's distinct option
values. The Model filter offered ``<provider>:<model>`` options by doing a
``GROUP BY`` over every asset row (~140k) just to surface ~12 distinct pairs —
~1.9s, one of the last full-table scans gating the filter-bar load.

This expression index mirrors the option value
``lower(provider_id) || ':' || model`` so the no-context option load can run a
recursive-CTE *loose index scan* (skip scan): ~12 index seeks instead of a
140k-row group, ~3ms. The effective-provider fallback (upload_method →
provider) is intentionally NOT indexed — no row in the data has an empty
provider_id, so it never fires; the loader keeps the full GROUP BY for the
counts / active-context paths where that edge could matter.

See plan ``viewer-media-memory`` sibling work / the asset filter registry
(``_load_provider_model_options``).

Revision ID: 20260619_0001
Revises: 20260615_0001
Create Date: 2026-06-19
"""
from alembic import op


revision = "20260619_0001"
down_revision = "20260615_0001"
branch_labels = None
depends_on = None

_INDEX = "idx_asset_provider_model_value"


def upgrade() -> None:
    op.execute(
        f"CREATE INDEX IF NOT EXISTS {_INDEX} ON assets "
        "((lower(btrim(provider_id)) || ':' || model)) "
        "WHERE provider_id IS NOT NULL AND btrim(provider_id) <> '' "
        "AND model IS NOT NULL AND model <> ''"
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {_INDEX}")
