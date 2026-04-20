"""optimize asset json columns and add text search index

- Convert assets.media_metadata and assets.provider_uploads from JSON to JSONB
  so operator-based queries (->>, @>) can be indexed.
- Add a targeted expression index for the hot
  media_metadata->>'provider_flagged' filter used by gallery search.
- Add a generic jsonb_path_ops GIN index on media_metadata for future ad-hoc
  path queries (last_frame_asset_id, generation_context.*, etc.).
- Add a GIN tsvector index on assets.prompt for full-text search.

Revision ID: 20260419_0001
Revises: 20260417_0001
Create Date: 2026-04-19
"""
from __future__ import annotations

from alembic import op


revision = "20260419_0001"
down_revision = "20260417_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    # 1. media_metadata JSON -> JSONB.  Existing values are valid JSON, so the
    #    explicit cast is always safe.
    op.execute(
        """
        ALTER TABLE assets
        ALTER COLUMN media_metadata TYPE jsonb
        USING media_metadata::jsonb
        """
    )

    # 2. provider_uploads JSON -> JSONB.
    op.execute(
        """
        ALTER TABLE assets
        ALTER COLUMN provider_uploads TYPE jsonb
        USING provider_uploads::jsonb
        """
    )

    # 3. Targeted expression index for the provider_flagged filter
    #    (services/asset/_search.py).  Partial so only flagged rows are
    #    indexed — cheap, selective, and directly hits the dominant query.
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_media_metadata_provider_flagged
        ON assets (
            user_id,
            is_archived,
            asset_kind,
            searchable,
            ((media_metadata->>'provider_flagged')),
            created_at DESC
        )
        WHERE media_metadata IS NOT NULL
          AND (media_metadata->>'provider_flagged') IS NOT NULL
        """
    )

    # 4. Generic jsonb_path_ops GIN on media_metadata for future ad-hoc
    #    path queries.  jsonb_path_ops is smaller and faster for @> /
    #    exact-path lookups than the default operator class.
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_media_metadata_gin
        ON assets USING gin (media_metadata jsonb_path_ops)
        WHERE media_metadata IS NOT NULL
        """
    )

    # 5. Full-text search over prompt for gallery search bar.
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_prompt_fts
        ON assets USING gin (to_tsvector('english', COALESCE(prompt, '')))
        WHERE prompt IS NOT NULL
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute("DROP INDEX IF EXISTS idx_asset_prompt_fts")
    op.execute("DROP INDEX IF EXISTS idx_asset_media_metadata_gin")
    op.execute("DROP INDEX IF EXISTS idx_asset_media_metadata_provider_flagged")

    op.execute(
        """
        ALTER TABLE assets
        ALTER COLUMN provider_uploads TYPE json
        USING provider_uploads::json
        """
    )
    op.execute(
        """
        ALTER TABLE assets
        ALTER COLUMN media_metadata TYPE json
        USING media_metadata::json
        """
    )
