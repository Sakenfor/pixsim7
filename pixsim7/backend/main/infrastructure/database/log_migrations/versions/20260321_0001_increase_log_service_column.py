"""Increase service column from varchar(50) to varchar(150).

Mirrors main DB migration 20260112_0001. The log DB was using a separate
migration chain so this change was never applied.

TimescaleDB with columnstore/compression blocks ALTER COLUMN, so we
temporarily disable compression, alter, then re-enable.

Revision ID: 20260321_0001
Revises: 20260307_0003
Create Date: 2026-03-21
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text
import sqlalchemy as sa


revision = "20260321_0001"
down_revision = "20260307_0003"
branch_labels = None
depends_on = None


def _is_compressed_hypertable(conn, table: str) -> bool:
    """Check if the table is a compressed TimescaleDB hypertable."""
    row = conn.execute(
        text(
            "SELECT EXISTS ("
            "  SELECT 1 FROM timescaledb_information.compression_settings"
            "  WHERE hypertable_name = :table"
            ")"
        ),
        {"table": table},
    ).scalar()
    return bool(row)


def upgrade() -> None:
    conn = op.get_bind()

    compressed = False
    try:
        compressed = _is_compressed_hypertable(conn, "log_entries")
    except Exception:
        pass

    if compressed:
        # Remove compression policy, decompress existing chunks, disable columnstore
        try:
            conn.execute(text("SELECT remove_compression_policy('log_entries', if_exists => true)"))
        except Exception:
            pass
        try:
            conn.execute(text("SELECT decompress_chunk(c, if_compressed => true) FROM show_chunks('log_entries') c"))
        except Exception:
            pass
        conn.execute(text("ALTER TABLE log_entries SET (timescaledb.compress = false)"))

    op.alter_column(
        "log_entries",
        "service",
        existing_type=sa.String(length=50),
        type_=sa.String(length=150),
        existing_nullable=False,
    )

    if compressed:
        conn.execute(
            text(
                "ALTER TABLE log_entries SET ("
                "  timescaledb.compress,"
                "  timescaledb.compress_segmentby = 'service,level'"
                ")"
            )
        )
        try:
            conn.execute(
                text("SELECT add_compression_policy('log_entries', INTERVAL '7 days', if_not_exists => true)")
            )
        except Exception:
            pass


def downgrade() -> None:
    conn = op.get_bind()

    compressed = False
    try:
        compressed = _is_compressed_hypertable(conn, "log_entries")
    except Exception:
        pass

    if compressed:
        try:
            conn.execute(text("SELECT remove_compression_policy('log_entries', if_exists => true)"))
        except Exception:
            pass
        try:
            conn.execute(text("SELECT decompress_chunk(c, if_compressed => true) FROM show_chunks('log_entries') c"))
        except Exception:
            pass
        conn.execute(text("ALTER TABLE log_entries SET (timescaledb.compress = false)"))

    op.alter_column(
        "log_entries",
        "service",
        existing_type=sa.String(length=150),
        type_=sa.String(length=50),
        existing_nullable=False,
    )

    if compressed:
        conn.execute(
            text(
                "ALTER TABLE log_entries SET ("
                "  timescaledb.compress,"
                "  timescaledb.compress_segmentby = 'service,level'"
                ")"
            )
        )
        try:
            conn.execute(
                text("SELECT add_compression_policy('log_entries', INTERVAL '7 days', if_not_exists => true)")
            )
        except Exception:
            pass
