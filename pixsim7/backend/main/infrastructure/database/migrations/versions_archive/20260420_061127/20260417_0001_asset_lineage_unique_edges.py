"""Dedup asset_lineage and add unique edge index.

Turns edge uniqueness on (child_asset_id, parent_asset_id, relation_type,
sequence_order) into a DB invariant. Before the index is created we delete
duplicate rows, keeping the oldest `id` per tuple — matches the behavior
app-level dedup would have produced.

Revision ID: 20260417_0001
Revises: 20260409_0001
Create Date: 2026-04-17
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260417_0001"
down_revision = "20260409_0001"
branch_labels = None
depends_on = None

TABLE = "asset_lineage"
INDEX_NAME = "uq_asset_lineage_edge"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())
    if TABLE not in table_names:
        return

    # 1. Dedup: keep the oldest row (min id) per edge tuple.
    op.execute(
        sa.text(
            f"""
            DELETE FROM {TABLE} a
            USING {TABLE} b
            WHERE a.id > b.id
              AND a.child_asset_id = b.child_asset_id
              AND a.parent_asset_id = b.parent_asset_id
              AND a.relation_type = b.relation_type
              AND COALESCE(a.sequence_order, 0) = COALESCE(b.sequence_order, 0)
            """
        )
    )

    # 2. Enforce uniqueness going forward.
    existing_indexes = {ix["name"] for ix in inspector.get_indexes(TABLE)}
    if INDEX_NAME not in existing_indexes:
        op.create_index(
            INDEX_NAME,
            TABLE,
            ["child_asset_id", "parent_asset_id", "relation_type", "sequence_order"],
            unique=True,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())
    if TABLE not in table_names:
        return

    existing_indexes = {ix["name"] for ix in inspector.get_indexes(TABLE)}
    if INDEX_NAME in existing_indexes:
        op.drop_index(INDEX_NAME, table_name=TABLE)
