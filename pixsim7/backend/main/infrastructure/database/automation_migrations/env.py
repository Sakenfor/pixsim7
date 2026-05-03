"""
Alembic environment configuration for the Automation schema.

Connects to AUTOMATION_DATABASE_URL (settings.automation_database_url_resolved)
and manages the automation tables independently from the main, log, and blocks
migration chains.

Uses version_table="alembic_version_automation" so it does not conflict with
other Alembic chains.

Plan: automation-package-extraction Phase 2c — automation tables now live
under this chain. The full domain registry is loaded so cross-DB FK references
that survive in the SQLModel metadata (e.g. android_devices model declared
account_id without FK constraint) resolve cleanly during autogenerate; the
include_object filter restricts emitted diffs to AUTOMATION_TABLES.
"""
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from alembic import context

from sqlmodel import SQLModel
from pixsim7.backend.main.shared.config import settings

# Load the full domain registry so any remaining cross-DB metadata refs resolve
# during autogenerate's table-sort step. The include_object filter below
# restricts emitted diffs to AUTOMATION_TABLES regardless.
from pixsim7.backend.main.infrastructure.domain_registry import init_domain_registry

_domain_registry = init_domain_registry("pixsim7/backend/main/domain_models")

# Alembic Config object
config = context.config

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override DB URL from settings (AUTOMATION_DATABASE_URL, falls back to DATABASE_URL)
config.set_main_option("sqlalchemy.url", settings.automation_database_url_resolved)

# Target metadata for autogenerate
target_metadata = SQLModel.metadata

# Separate version table for automation migrations
VERSION_TABLE = "alembic_version_automation"

# Only manage automation-owned tables
AUTOMATION_TABLES = {
    "android_devices",
    "app_action_presets",
    "automation_executions",
    "device_agents",
    "execution_loop_history",
    "execution_loops",
    "pairing_requests",
}


def include_object(obj, name, type_, reflected, compare_to):
    """Only include automation-owned tables in autogenerate diffs."""
    if type_ == "table":
        return name in AUTOMATION_TABLES
    if hasattr(obj, "table") and hasattr(obj.table, "name"):
        return obj.table.name in AUTOMATION_TABLES
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
