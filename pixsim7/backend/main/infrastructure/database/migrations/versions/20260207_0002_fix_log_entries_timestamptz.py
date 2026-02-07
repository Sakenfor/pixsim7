"""fix_log_entries_timestamptz

Revision ID: 20260207_0002
Revises: 20260207_0001
Create Date: 2026-02-07 07:00:00.000000

Change log_entries.timestamp and log_entries.created_at from TIMESTAMP to
TIMESTAMPTZ so timezone-aware Python datetimes are accepted by asyncpg.

Handles separate log database: if log_database_url is configured, the ALTER
statements are also executed against the log database directly.

Handles TimescaleDB hypertables with columnstore: disables compression,
decompresses chunks, alters columns, then re-enables compression.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260207_0002"
down_revision = "20260207_0001"
branch_labels = None
depends_on = None

_ALTER_SQL = [
    "ALTER TABLE log_entries ALTER COLUMN timestamp TYPE TIMESTAMPTZ USING timestamp AT TIME ZONE 'UTC'",
    "ALTER TABLE log_entries ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'",
]

_REVERT_SQL = [
    "ALTER TABLE log_entries ALTER COLUMN created_at TYPE TIMESTAMP USING created_at AT TIME ZONE 'UTC'",
    "ALTER TABLE log_entries ALTER COLUMN timestamp TYPE TIMESTAMP USING timestamp AT TIME ZONE 'UTC'",
]


def _run_alter(conn, statements: list[str]) -> None:
    """
    Run ALTER statements on a connection, handling TimescaleDB compressed hypertables.

    If the table has compression enabled, we must:
    1. Remove the compression policy
    2. Decompress all chunks
    3. Disable compression settings
    4. Run the ALTER statements
    5. Re-enable compression settings
    6. Re-add the compression policy
    """
    # Check if TimescaleDB is even installed (pg_extension is always safe to query)
    is_compressed_hypertable = False
    has_timescaledb = conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb')"
    )).scalar()

    if has_timescaledb:
        is_hypertable = conn.execute(sa.text(
            "SELECT EXISTS ("
            "  SELECT 1 FROM timescaledb_information.hypertables"
            "  WHERE hypertable_name = 'log_entries'"
            ")"
        )).scalar()
        if is_hypertable:
            is_compressed_hypertable = conn.execute(sa.text(
                "SELECT EXISTS ("
                "  SELECT 1 FROM timescaledb_information.compression_settings"
                "  WHERE hypertable_name = 'log_entries'"
                ")"
            )).scalar()

    if is_compressed_hypertable:
        print("  [timescaledb] Removing compression policy and decompressing chunks...")
        # 1. Remove compression policy (ignore if not present)
        conn.execute(sa.text(
            "SELECT remove_compression_policy('log_entries', if_exists => true)"
        ))
        # 2. Decompress all compressed chunks
        conn.execute(sa.text(
            "SELECT decompress_chunk(c, if_compressed => true)"
            " FROM show_chunks('log_entries') c"
        ))
        # 3. Disable compression on the hypertable
        conn.execute(sa.text(
            "ALTER TABLE log_entries SET (timescaledb.compress = false)"
        ))
        print("  [timescaledb] Compression disabled, running ALTER...")

    # Run the actual column type changes
    for stmt in statements:
        conn.execute(sa.text(stmt))

    if is_compressed_hypertable:
        # Re-enable compression with original settings
        print("  [timescaledb] Re-enabling compression...")
        conn.execute(sa.text(
            "ALTER TABLE log_entries SET ("
            "  timescaledb.compress,"
            "  timescaledb.compress_segmentby = 'service,level'"
            ")"
        ))
        conn.execute(sa.text(
            "SELECT add_compression_policy('log_entries', INTERVAL '7 days', if_not_exists => true)"
        ))
        print("  [timescaledb] Compression re-enabled with 7-day policy")


def _run_on_log_db(statements: list[str]) -> None:
    """Execute statements on the separate log database if configured."""
    try:
        from pixsim7.backend.main.shared.config import settings
    except Exception:
        return

    log_url = settings.log_database_url
    if not log_url or log_url == settings.database_url:
        # Same database or not configured — already handled by normal Alembic bind
        return

    engine = sa.create_engine(log_url, isolation_level="AUTOCOMMIT")
    try:
        with engine.connect() as conn:
            _run_alter(conn, statements)
        print(f"  [log_db] Applied ALTER statements to log database")
    finally:
        engine.dispose()


def upgrade() -> None:
    # Apply to main DB (where Alembic is bound) — no-op if log_entries isn't here
    bind = op.get_bind()
    has_table = bind.execute(
        sa.text("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'log_entries')")
    ).scalar()
    if has_table:
        _run_alter(bind, _ALTER_SQL)

    # Also apply to separate log DB if configured
    _run_on_log_db(_ALTER_SQL)


def downgrade() -> None:
    bind = op.get_bind()
    has_table = bind.execute(
        sa.text("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'log_entries')")
    ).scalar()
    if has_table:
        _run_alter(bind, _REVERT_SQL)

    _run_on_log_db(_REVERT_SQL)
