"""add denormalized video-health columns on assets

The Video Health (signal-scan) maintenance dashboard counts videos by
scanner-version / score / override. Those fields live inside the large
``media_metadata`` JSONB blob (avg ~3.6 KB, TOAST-stored), so the coverage
aggregate had to de-TOAST and decompress every video's blob — an ~18s full
scan that made the tab slow to open.

These flat columns mirror ``media_metadata.signal_metrics`` so the aggregate
reads tiny non-TOASTed values instead. The JSON stays the source of truth;
SignalAnalysisService and the override endpoint keep the columns in sync. A
partial index (videos, non-archived) lets the coverage counts run as an
index-only scan.

NULL on every existing row until the backfill (tools/backfill_asset_signal_columns.py)
populates them from the JSON; the dashboard simply reads them as unscanned
until then.

See plan ``signal-scan-recalibration``.

Revision ID: 20260614_0001
Revises: 20260613_0002
Create Date: 2026-06-14
"""
from alembic import op


revision = "20260614_0001"
down_revision = "20260613_0002"
branch_labels = None
depends_on = None

_INDEX = "ix_assets_signal_health"


def upgrade() -> None:
    op.execute("ALTER TABLE assets ADD COLUMN IF NOT EXISTS signal_score SMALLINT")
    op.execute("ALTER TABLE assets ADD COLUMN IF NOT EXISTS signal_scanner_version VARCHAR(16)")
    op.execute("ALTER TABLE assets ADD COLUMN IF NOT EXISTS signal_override VARCHAR(16)")
    op.execute(
        f"CREATE INDEX IF NOT EXISTS {_INDEX} ON assets "
        "(signal_scanner_version, signal_score, signal_override) "
        "WHERE media_type = 'VIDEO' AND is_archived = false"
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {_INDEX}")
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS signal_override")
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS signal_scanner_version")
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS signal_score")
