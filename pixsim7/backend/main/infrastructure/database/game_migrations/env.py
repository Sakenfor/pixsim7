"""
Alembic environment configuration for the Game schema.

Uses a separate version table (alembic_version_game) so the game migration
chain is tracked independently from the main chain.

The include_object filter restricts autogenerate to game-owned tables only,
as defined in GAME_TABLES from check_cross_domain_fks.py.
"""
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from alembic import context

from sqlmodel import SQLModel
from pixsim7.backend.main.shared.config import settings

# Use domain registry to auto-discover and register all models
# (full registry needed for metadata completeness)
from pixsim7.backend.main.infrastructure.domain_registry import init_domain_registry

_domain_registry = init_domain_registry("pixsim7/backend/main/domain_models")

# Import GAME_TABLES from the boundary checker
from pixsim7.backend.main.scripts.check_cross_domain_fks import GAME_TABLES

# Alembic Config object
config = context.config

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override DB URL from settings
config.set_main_option("sqlalchemy.url", settings.database_url)

# Target metadata for autogenerate
target_metadata = SQLModel.metadata

# Separate version table for game migrations
VERSION_TABLE = "alembic_version_game"


def include_object(obj, name, type_, reflected, compare_to):
    """Only include game-owned tables in autogenerate diffs."""
    if type_ == "table":
        return name in GAME_TABLES
    # Include columns/indexes/constraints belonging to game tables
    if hasattr(obj, "table") and hasattr(obj.table, "name"):
        return obj.table.name in GAME_TABLES
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
