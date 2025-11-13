"""
Alembic environment configuration for PixSim7
"""
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from alembic import context

# Import SQLModel and settings
from sqlmodel import SQLModel
from pixsim7_backend.shared.config import settings

# Import all models to ensure they're registered with SQLModel metadata
from pixsim7_backend.domain import (
    # Core models
    User,
    UserSession,
    UserQuotaUsage,
    Workspace,
    Asset,
    AssetVariant,
    Job,
    ProviderSubmission,
    ProviderAccount,
    ProviderCredit,
    # Asset metadata
    Asset3DMetadata,
    AssetAudioMetadata,
    AssetTemporalSegment,
    AssetAdultMetadata,
    # Asset lineage
    AssetLineage,
    AssetBranch,
    AssetBranchVariant,
    AssetClip,
    # Scene models
    Scene,
    SceneAsset,
    SceneConnection,
)

# Import automation models so Alembic sees these tables
from pixsim7_backend.domain.automation import (
    AndroidDevice,
    AppActionPreset,
    AutomationExecution,
    ExecutionLoop,
    ExecutionLoopHistory,
)

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
