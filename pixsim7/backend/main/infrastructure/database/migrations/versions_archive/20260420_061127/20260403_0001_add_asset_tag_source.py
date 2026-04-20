"""Add source column to asset_tag and backfill analysis tags.

Mirrors prompt_family_tag.source. Values:
  'manual'   — user-curated via UI
  'analysis' — derived from prompt analyzer (tags_flat / tags)
  'auto'     — rule-based auto-tags (provider, operation, source type)

Backfill: marks existing asset_tag rows as 'analysis' when the tag slug
matches an entry in the asset's prompt_analysis.tags_flat array.
Remaining rows keep the 'manual' default (covers both user-curated and
auto tags which are indistinguishable retroactively).

Also adds a composite index on (source, tag_id) for the analysis_tags
filter option query and an index on (asset_id, source) for per-asset
source filtering.

Drops the GIN index on prompt_analysis JSONB (idx_asset_prompt_analysis_gin)
since analysis tag filtering now uses the asset_tag join table.

Revision ID: 20260403_0001
Revises: 20260402_0011
Create Date: 2026-04-03
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260403_0001"
down_revision = "20260402_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add source column with default 'manual' (idempotent)
    op.execute(sa.text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'asset_tag' AND column_name = 'source'
            ) THEN
                ALTER TABLE asset_tag
                    ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'manual';
            END IF;
        END $$;
    """))

    # 2. Indexes for filtering by source (idempotent via IF NOT EXISTS)
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS idx_asset_tag_source ON asset_tag (source)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS idx_asset_tag_asset_source ON asset_tag (asset_id, source)"
    ))

    # 3. Drop any auto-generated check constraint that restricts source values
    #    (SQLModel may create one from old model definitions).
    op.execute(sa.text(
        "ALTER TABLE asset_tag DROP CONSTRAINT IF EXISTS ck_asset_tag_ck_asset_tag_source_valid"
    ))
    op.execute(sa.text(
        "ALTER TABLE asset_tag DROP CONSTRAINT IF EXISTS ck_asset_tag_source_valid"
    ))

    # 4. Backfill: mark rows whose tag slug appears in the asset's
    #    prompt_analysis->'tags_flat' array as source='analysis'.
    #    Uses a single UPDATE ... FROM join to avoid row-by-row processing.
    #    Only touches rows still at 'manual' to be re-runnable.
    #    Note: uses exec_driver_sql to bypass SQLAlchemy text() parameter
    #    parsing which conflicts with PostgreSQL :: cast and ? operators.
    op.get_bind().exec_driver_sql("""
        UPDATE asset_tag
        SET source = 'analysis'
        FROM assets a, tag t
        WHERE asset_tag.asset_id = a.id
          AND asset_tag.tag_id = t.id
          AND asset_tag.source = 'manual'
          AND a.prompt_analysis IS NOT NULL
          AND (a.prompt_analysis::jsonb) ? 'tags_flat'
          AND jsonb_typeof((a.prompt_analysis::jsonb)->'tags_flat') = 'array'
          AND (a.prompt_analysis::jsonb)->'tags_flat' ? t.slug
    """)

    # 5. Drop the GIN index on prompt_analysis JSONB — no longer queried
    #    for analysis tag filtering (now uses asset_tag join table).
    op.execute(sa.text(
        "DROP INDEX IF EXISTS idx_asset_prompt_analysis_gin"
    ))


def downgrade() -> None:
    op.drop_index("idx_asset_tag_asset_source", table_name="asset_tag")
    op.drop_index("idx_asset_tag_source", table_name="asset_tag")
    op.drop_column("asset_tag", "source")
