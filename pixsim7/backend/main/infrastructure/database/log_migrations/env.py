"""
Alembic environment configuration for the Log schema (TimescaleDB).

Connects to LOG_DATABASE_URL (settings.log_database_url_resolved) and manages
the log_entries table independently from the main migration chain.

Uses version_table="alembic_version_logs" so it does not conflict with the
main or game Alembic chains.
"""
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from alembic import context

from sqlmodel import SQLModel
from pixsim7.backend.main.shared.config import settings

# Import LogEntry so its table is registered in SQLModel.metadata
from pixsim7.backend.main.domain.log_entry import LogEntry  # noqa: F401

# Alembic Config object
config = context.config

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override DB URL from settings (LOG_DATABASE_URL, falls back to DATABASE_URL)
config.set_main_option("sqlalchemy.url", settings.log_database_url_resolved)

# Target metadata for autogenerate
target_metadata = SQLModel.metadata

# Separate version table for log migrations
VERSION_TABLE = "alembic_version_logs"

# Only manage log-related tables
LOG_TABLES = {"log_entries"}


def include_object(obj, name, type_, reflected, compare_to):
    """Only include log-owned tables in autogenerate diffs."""
    if type_ == "table":
        return name in LOG_TABLES
    if hasattr(obj, "table") and hasattr(obj.table, "name"):
        return obj.table.name in LOG_TABLES
    return True


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        version_table=VERSION_TABLE,
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        version_table=VERSION_TABLE,
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (sync)."""
    from sqlalchemy import engine_from_config

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        do_run_migrations(connection)

    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
