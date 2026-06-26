"""add mode column to signal_backfill_runs

The durable signal-scan runner gained a second mode: alongside the full ffmpeg
``reprobe`` (capture chroma_fp + audio/visual metrics), a cheap ``rescore`` that
re-applies the fingerprint matcher + scoring over ALREADY-STORED metrics with no
decode — the pass you repeat as you curate ``signalref:*`` references or retune
thresholds. The run row remembers which it is so it survives worker restarts.

Existing rows default to 'reprobe' (the only mode that existed before).

See plan ``signal-scan-recalibration``.

Revision ID: 20260626_0001
Revises: 20260621_0005
Create Date: 2026-06-26
"""
from alembic import op


revision = "20260626_0001"
down_revision = "20260621_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE signal_backfill_runs "
        "ADD COLUMN IF NOT EXISTS mode VARCHAR(16) NOT NULL DEFAULT 'reprobe'"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE signal_backfill_runs DROP COLUMN IF EXISTS mode")
