"""
Alembic environment configuration for the Blocks schema.

Connects to BLOCKS_DATABASE_URL (settings.blocks_database_url_resolved) and manages
the block_primitives table independently from the main migration chain.

Uses version_table="alembic_version_blocks" so it does not conflict with the
main or log Alembic chains.
"""
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from alembic import context

from sqlmodel import SQLModel
from pixsim7.backend.main.shared.config import settings

# Import models so their tables are registered in SQLModel.metadata
from pixsim7.backend.main.domain.blocks.models import BlockPrimitive  # noqa: F401
from pixsim7.backend.main.domain.blocks.species_model import SpeciesRecord  # noqa: F401

# Alembic Config object
config = context.config

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override DB URL from settings (BLOCKS_DATABASE_URL, falls back to DATABASE_URL)
config.set_main_option("sqlalchemy.url", settings.blocks_database_url_resolved)

# Target metadata for autogenerate
target_metadata = SQLModel.metadata

# Separate version table for blocks migrations
VERSION_TABLE = "alembic_version_blocks"

# Only manage blocks-related tables
BLOCKS_TABLES = {"block_primitives", "species"}


def include_object(obj, name, type_, reflected, compare_to):
    """Only include blocks-owned tables in autogenerate diffs."""
    if type_ == "table":
        return name in BLOCKS_TABLES
    if hasattr(obj, "table") and hasattr(obj.table, "name"):
        return obj.table.name in BLOCKS_TABLES
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
