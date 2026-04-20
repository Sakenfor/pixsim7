"""add_missing_log_entry_columns

Revision ID: 20260406_0001
Revises: 20260404_0001
Create Date: 2026-04-06

The LogEntry model drifted from the DB schema:
- artifact_id was renamed to generation_id in the model but never migrated
- domain column was added to the model but never migrated

This migration brings the table in sync.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260406_0001"
down_revision = "20260404_0001"
branch_labels = None
depends_on = None


def _run_on_log_db(statements: list[str]) -> None:
    """Execute statements on the separate log database if configured."""
    try:
        from pixsim7.backend.main.shared.config import settings
    except Exception:
        return

    log_url = settings.log_database_url
    if not log_url or log_url == settings.database_url:
        return

    engine = sa.create_engine(log_url, isolation_level="AUTOCOMMIT")
    try:
        with engine.connect() as conn:
            for stmt in statements:
                conn.execute(sa.text(stmt))
        print("[log_db] Applied log_entries column sync")
    finally:
        engine.dispose()


_UPGRADE_SQL = [
    "ALTER TABLE log_entries RENAME COLUMN artifact_id TO generation_id",
    "ALTER TABLE log_entries ADD COLUMN IF NOT EXISTS domain VARCHAR(30)",
]

_DOWNGRADE_SQL = [
    "ALTER TABLE log_entries DROP COLUMN IF EXISTS domain",
    "ALTER TABLE log_entries RENAME COLUMN generation_id TO artifact_id",
]


def upgrade() -> None:
    # Main DB
    bind = op.get_bind()
    has_table = bind.execute(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
            "WHERE table_name = 'log_entries')"
        )
    ).scalar()
    if has_table:
        # Rename artifact_id -> generation_id
        op.alter_column("log_entries", "artifact_id", new_column_name="generation_id")
        # Add domain column
        op.add_column(
            "log_entries", sa.Column("domain", sa.String(30), nullable=True)
        )
        # Add indexes matching the model
        op.create_index(
            "ix_log_entries_generation_id", "log_entries", ["generation_id"]
        )
        op.create_index("ix_log_entries_domain", "log_entries", ["domain"])
        op.create_index(
            "idx_logs_domain_timestamp", "log_entries", ["domain", "timestamp"]
        )
        # Drop old artifact_id index if it exists
        try:
            op.drop_index("ix_log_entries_artifact_id", table_name="log_entries")
        except Exception:
            pass

    # Separate log DB
    _run_on_log_db(_UPGRADE_SQL)


def downgrade() -> None:
    bind = op.get_bind()
    has_table = bind.execute(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
            "WHERE table_name = 'log_entries')"
        )
    ).scalar()
    if has_table:
        op.drop_index("idx_logs_domain_timestamp", table_name="log_entries")
        op.drop_index("ix_log_entries_domain", table_name="log_entries")
        op.drop_index("ix_log_entries_generation_id", table_name="log_entries")
        op.drop_column("log_entries", "domain")
        op.alter_column(
            "log_entries", "generation_id", new_column_name="artifact_id"
        )
        op.create_index(
            "ix_log_entries_artifact_id", "log_entries", ["artifact_id"]
        )

    _run_on_log_db(_DOWNGRADE_SQL)
