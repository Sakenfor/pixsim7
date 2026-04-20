"""backfill asset_lineage rows from legacy upload_context.source_asset_id

Historically, assets derived from another asset recorded the link only in
`assets.upload_context->>'source_asset_id'`.  The `has_children` gallery
filter and `AssetLineageService.has_children_map` both carry JSON-path
fallbacks to keep those legacy rows visible, which defeats the lineage
indexes at scale.

This migration turns the implicit links into explicit `asset_lineage` rows
so the fallbacks can be removed.  Idempotent: the ON CONFLICT clause keys
on `uq_asset_lineage_edge` (added in 20260417_0001), so re-running is a
no-op.  Downgrade is intentionally a no-op — after the fact we can't tell
which rows came from this backfill vs real lineage edges.

Revision ID: 20260419_0002
Revises: 20260419_0001
Create Date: 2026-04-19
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260419_0002"
down_revision = "20260419_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    # Insert a `source` edge for every asset whose upload_context still
    # carries a numeric source_asset_id but lacks a matching lineage row.
    #
    #   * Filter `^[0-9]+$` drops malformed values.
    #   * EXISTS(...) avoids FK violations on orphaned parents.
    #   * operation_type falls back to 'image_edit' when the child's own
    #     operation_type isn't one of the known enum values (legacy rows).
    #   * ON CONFLICT uses the uniqueness tuple established by the
    #     uq_asset_lineage_edge index.
    op.execute(
        sa.text(
            """
            INSERT INTO asset_lineage (
                child_asset_id,
                parent_asset_id,
                relation_type,
                operation_type,
                sequence_order,
                created_at
            )
            SELECT
                a.id,
                (a.upload_context->>'source_asset_id')::int,
                'source',
                CASE
                    WHEN COALESCE(a.operation_type, '')
                         = ANY(enum_range(NULL::operationtype)::text[])
                        THEN a.operation_type::operationtype
                    ELSE 'image_edit'::operationtype
                END,
                0,
                COALESCE(a.created_at, NOW())
            FROM assets a
            WHERE a.upload_context IS NOT NULL
              AND a.upload_context->>'source_asset_id' IS NOT NULL
              AND (a.upload_context->>'source_asset_id') ~ '^[0-9]+$'
              AND EXISTS (
                  SELECT 1 FROM assets p
                  WHERE p.id = (a.upload_context->>'source_asset_id')::int
              )
            ON CONFLICT (
                child_asset_id,
                parent_asset_id,
                relation_type,
                sequence_order
            ) DO NOTHING
            """
        )
    )


def downgrade() -> None:
    # No-op: after the fact we cannot distinguish backfilled edges from
    # real ones.  If you need to revert, do it selectively in application
    # code.
    return
