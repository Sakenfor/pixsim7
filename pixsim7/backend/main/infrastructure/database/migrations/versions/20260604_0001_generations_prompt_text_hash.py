"""add generations.prompt_text_hash + index — prompt-only stats grouping key

The prompt-stats chip (per-prompt render-moderation success rate) needs to seek
a single prompt's generation history fast. The first cut matched on
``canonical_params->>'prompt'``, which has no index and full-scanned all 150k+
rows (~120s/call); fired every few seconds by the chip it drained the DB
connection pool and lagged the whole app.

This adds a nullable ``prompt_text_hash`` column (SHA256 of the stripped prompt
text) plus a plain btree index, so the stats query becomes an index seek. The
column is populated at generation creation (real + synthetic paths) and
backfilled for existing rows by ``tools/backfill_prompt_text_hash.py``.

NOTE: prompt-ONLY hash — distinct from the workers' seed-agnostic full-request
group hash (prompt + inputs + params).

Revision ID: 20260604_0001
Revises: 20260602_0002
Create Date: 2026-06-04
"""
from alembic import op


revision = "20260604_0001"
down_revision = "20260602_0002"
branch_labels = None
depends_on = None

_INDEX = "ix_generations_prompt_text_hash"


def upgrade() -> None:
    op.execute(
        "ALTER TABLE generations ADD COLUMN IF NOT EXISTS prompt_text_hash VARCHAR(64)"
    )
    op.execute(
        f"CREATE INDEX IF NOT EXISTS {_INDEX} ON generations (prompt_text_hash)"
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {_INDEX}")
    op.execute("ALTER TABLE generations DROP COLUMN IF EXISTS prompt_text_hash")
