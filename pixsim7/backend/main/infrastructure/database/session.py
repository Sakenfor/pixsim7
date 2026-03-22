"""
Database session management with SQLModel + AsyncPG

Clean implementation for PixSim7
"""
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy import create_engine, text, event
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timezone
from typing import AsyncGenerator, Generator
import logging
import os

from sqlmodel import SQLModel

from pixsim7.backend.main.shared.config import settings
from pixsim_logging.domains import is_domain_enabled

logger = logging.getLogger(__name__)

# SQL echo controlled via pixsim_logging domain system.
# Enable with: PIXSIM_LOG_DOMAINS=sql:DEBUG
# Legacy fallback: SQL_LOGGING_ENABLED=1
_sql_logging_enabled = (
    is_domain_enabled("sql", at_level="DEBUG")
    if os.getenv("PIXSIM_LOG_DOMAINS")
    else os.getenv("SQL_LOGGING_ENABLED", "0") == "1"
)


# ===== ASYNC ENGINE (Primary - Application Data) =====
# For FastAPI async routes
async_engine = create_async_engine(
    settings.async_database_url,
    echo=_sql_logging_enabled,  # Controlled by SQL_LOGGING_ENABLED env var
    pool_size=20,
    max_overflow=40,
    pool_pre_ping=True,  # Test connections before using
    pool_recycle=3600,   # Recycle connections after 1 hour
)

# Async session factory
AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


# ===== ASYNC ENGINE (Logs - TimescaleDB) =====
# Separate database for log storage
async_log_engine = create_async_engine(
    settings.async_log_database_url,
    echo=_sql_logging_enabled,  # Controlled by SQL_LOGGING_ENABLED env var
    pool_size=10,  # Smaller pool for logs
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=3600,
)

# Async log session factory
AsyncLogSessionLocal = async_sessionmaker(
    async_log_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


# ===== ASYNC ENGINE (Blocks - Block Primitives) =====
# Separate database for composable prompt blocks
async_blocks_engine = create_async_engine(
    settings.async_blocks_database_url,
    echo=_sql_logging_enabled,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=3600,
)

# Async blocks session factory
AsyncBlocksSessionLocal = async_sessionmaker(
    async_blocks_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


# ===== SYNC ENGINE (Secondary) =====
# For Alembic migrations and background workers
sync_engine = create_engine(
    settings.database_url,
    echo=_sql_logging_enabled,  # Controlled by SQL_LOGGING_ENABLED env var
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=3600,
)

# Sync session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=sync_engine,
)


# ===== NAMING CONVENTION =====
# Consistent constraint naming for migrations
naming_convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s"
}
SQLModel.metadata.naming_convention = naming_convention


# ===== UTC DATETIME FIX =====
# PostgreSQL `timestamp without time zone` columns return naive datetimes.
# The backend stores everything in UTC, so tag them as UTC on load.
# This is the single-place fix: every datetime from the DB gets tzinfo=UTC,
# so Pydantic serializes them with "+00:00" and JS interprets them correctly.

def _stamp_utc(target):
    """Mark naive datetime attributes as UTC after loading from DB."""
    for key in target.__class__.model_fields:
        val = target.__dict__.get(key)
        if isinstance(val, datetime) and val.tzinfo is None:
            target.__dict__[key] = val.replace(tzinfo=timezone.utc)


@event.listens_for(SQLModel, "load", propagate=True)
def _stamp_utc_on_load(target, context):
    _stamp_utc(target)


@event.listens_for(SQLModel, "refresh", propagate=True)
def _stamp_utc_on_refresh(target, context, attrs):
    _stamp_utc(target)


@event.listens_for(SQLModel, "refresh_flush", propagate=True)
def _stamp_utc_on_refresh_flush(target, flush_context, attrs):
    _stamp_utc(target)


def _naive_datetimes(params):
    """Strip tzinfo from every datetime in a parameter collection.

    asyncpg is strict: it rejects tz-aware datetimes for TIMESTAMP columns.
    For TIMESTAMPTZ columns asyncpg accepts naive datetimes and assumes UTC,
    so stripping is safe for both column types.

    Handles tuple (positional params) and dict (named params) formats.
    """
    if isinstance(params, dict):
        return {
            k: v.replace(tzinfo=None) if isinstance(v, datetime) and v.tzinfo is not None else v
            for k, v in params.items()
        }
    return tuple(
        p.replace(tzinfo=None) if isinstance(p, datetime) and p.tzinfo is not None else p
        for p in params
    )


def _strip_tz_from_params(conn, cursor, statement, parameters, context, executemany):
    """Ensure all datetime query parameters are naive (UTC) for asyncpg."""
    if parameters:
        if executemany:
            # Traditional executemany: parameters is a list of row-tuples/dicts.
            # SQLAlchemy 2.x insertmanyvalues: parameters may be a flat tuple of
            # scalar values even with executemany=True.  Detect which format we
            # received by checking whether the first element is itself a collection.
            first = parameters[0] if isinstance(parameters, (list, tuple)) and parameters else None
            if isinstance(first, (tuple, list, dict)):
                parameters = [_naive_datetimes(p) if p is not None else p for p in parameters]
            else:
                parameters = _naive_datetimes(parameters)
        else:
            parameters = _naive_datetimes(parameters)
    return statement, parameters


# Register tz-stripping on all async engines
for _engine in (async_engine, async_blocks_engine):
    event.listen(_engine.sync_engine, "before_cursor_execute", _strip_tz_from_params, retval=True)


# ===== DEPENDENCY INJECTION =====

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency for database sessions

    Usage:
        @app.get("/items")
        async def get_items(db: AsyncSession = Depends(get_db)):
            result = await db.execute(select(Item))
            return result.scalars().all()
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


@asynccontextmanager
async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Context manager for async database sessions

    Usage:
        async with get_async_session() as db:
            result = await db.execute(select(Item))
            items = result.scalars().all()
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


@contextmanager
def get_sync_session() -> Generator[Session, None, None]:
    """
    Context manager for sync database sessions

    Usage (background workers):
        with get_sync_session() as db:
            result = db.execute(select(Item))
            items = result.scalars().all()
    """
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


# ===== LOG DATABASE SESSIONS =====

async def get_log_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency for log database sessions

    Usage:
        @app.post("/logs/ingest")
        async def ingest_log(db: AsyncSession = Depends(get_log_db)):
            # This uses the separate logs database
            ...
    """
    async with AsyncLogSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


@asynccontextmanager
async def get_async_log_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Context manager for async log database sessions

    Usage:
        async with get_async_log_session() as db:
            result = await db.execute(select(LogEntry))
            logs = result.scalars().all()
    """
    async with AsyncLogSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


# ===== BLOCKS DATABASE SESSIONS =====

async def get_blocks_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for blocks database sessions."""
    async with AsyncBlocksSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


@asynccontextmanager
async def get_async_blocks_session() -> AsyncGenerator[AsyncSession, None]:
    """Context manager for async blocks database sessions."""
    async with AsyncBlocksSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


# ===== LIFECYCLE =====

async def init_database():
    """
    Initialize database connection and verify migrations

    Call this on application startup (after importing all models).
    Tables are managed via Alembic migrations, not created here.

    Usage:
        @app.on_event("startup")
        async def startup():
            # Import all models first
            from domain import Asset, Job, ...
            # Then initialize
            await init_database()
    """
    # Verify database connection
    async with async_engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    
    logger.info("✅ Database connection verified")
    
    # Optional: Check if migrations are current (development safety)
    # Uncomment to enforce migration state on startup
    # await _check_migration_status()


async def _check_migration_status():
    """
    Check if database migrations are current
    
    Raises RuntimeError if migrations are pending.
    Enable by uncommenting the call in init_database().
    """
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory
        from alembic.runtime.migration import MigrationContext
        
        # Get current database revision
        async with async_engine.connect() as conn:
            context = await conn.run_sync(
                lambda sync_conn: MigrationContext.configure(sync_conn).get_current_revision()
            )
            current_revision = context
        
        # Get latest revision from migration scripts
        alembic_cfg = Config("pixsim7/backend/main/infrastructure/database/alembic.ini")
        script = ScriptDirectory.from_config(alembic_cfg)
        head_revision = script.get_current_head()
        
        if current_revision != head_revision:
            raise RuntimeError(
                f"Database migrations are out of date. "
                f"Current: {current_revision}, Latest: {head_revision}. "
                f"Run 'alembic upgrade head' to apply pending migrations."
            )
        
        logger.info(f"✅ Database migrations current: {current_revision}")
        
    except ImportError:
        logger.warning("⚠️ Alembic not available, skipping migration check")
    except Exception as e:
        logger.warning(f"⚠️ Could not verify migration status: {e}")


async def drop_database():
    """
    Drop all database tables (USE WITH CAUTION!)

    Only for testing/development
    """
    if not settings.debug:
        raise RuntimeError("Cannot drop database in production mode!")

    async with async_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
        logger.warning("⚠️ Database tables dropped")


async def close_database():
    """
    Close database connections

    Call this on application shutdown

    Usage:
        @app.on_event("shutdown")
        async def shutdown():
            await close_database()
    """
    await async_engine.dispose()
    await async_log_engine.dispose()
    await async_blocks_engine.dispose()
    sync_engine.dispose()
    logger.info("✅ Database connections closed")
