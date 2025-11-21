"""
Database session management with SQLModel + AsyncPG

Clean implementation for PixSim7
"""
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy import create_engine, text
from contextlib import asynccontextmanager, contextmanager
from typing import AsyncGenerator, Generator
import logging

from sqlmodel import SQLModel

from pixsim7.backend.main.shared.config import settings

logger = logging.getLogger(__name__)


# ===== ASYNC ENGINE (Primary - Application Data) =====
# For FastAPI async routes
async_engine = create_async_engine(
    settings.async_database_url,
    echo=settings.debug,
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
    echo=settings.debug,
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


# ===== SYNC ENGINE (Secondary) =====
# For Alembic migrations and background workers
sync_engine = create_engine(
    settings.database_url,
    echo=settings.debug,
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
    sync_engine.dispose()
    logger.info("✅ Database connections closed")
