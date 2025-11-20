"""
Alembic environment configuration for PixSim7

Uses the domain model registry for consistent model discovery.
This ensures alignment with main.py and provides a single source of truth.
"""
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from alembic import context

# Import SQLModel and settings
from sqlmodel import SQLModel
from pixsim7.backend.main.shared.config import settings

# Use domain registry to auto-discover and register all models
# This replaces manual imports and ensures consistency with main.py
from pixsim7.backend.main.infrastructure.domain_registry import init_domain_registry

# Initialize domain registry to import all models
# All domain models are now registered with SQLModel.metadata
_domain_registry = init_domain_registry("pixsim7/backend/main/domain_models")

# this is the Alembic Config object
config = context.config

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set database URL from settings (overrides alembic.ini)
config.set_main_option("sqlalchemy.url", settings.database_url)

# Target metadata for 'autogenerate' support
target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    Run migrations in 'online' mode (sync).

    Use sync engine for migrations (psycopg2 driver).
    """
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
