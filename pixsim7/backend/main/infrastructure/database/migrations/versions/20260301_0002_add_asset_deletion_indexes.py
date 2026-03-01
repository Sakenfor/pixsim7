"""Add indexes on stored_key and local_path for faster asset deletion.

Revision ID: 20260301_0002
Revises: 20260301_0001
Create Date: 2026-03-01

The asset deletion flow checks if other assets share the same stored_key
or local_path before cleaning up files. Without indexes these are full
table scans (~5s each on large tables).
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text


revision = "20260301_0002"
down_revision = "20260301_0001"
branch_labels = None
depends_on = None


def _index_exists(index_name: str) -> bool:
    conn = op.get_bind()
    row = conn.execute(
        text(
            """
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = current_schema()
              AND indexname = :index_name
            LIMIT 1
            """
        ),
        {"index_name": index_name},
    ).first()
    return row is not None


def upgrade() -> None:
    if not _index_exists("idx_asset_stored_key"):
        op.execute(
            "CREATE INDEX idx_asset_stored_key ON assets (stored_key) "
            "WHERE stored_key IS NOT NULL"
        )
    if not _index_exists("idx_asset_local_path"):
        op.execute(
            "CREATE INDEX idx_asset_local_path ON assets (local_path) "
            "WHERE local_path IS NOT NULL"
        )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_asset_local_path")
    op.execute("DROP INDEX IF EXISTS idx_asset_stored_key")
