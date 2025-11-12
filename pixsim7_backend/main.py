"""
PixSim7 FastAPI Application

Clean architecture entry point
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from pathlib import Path

from pixsim7_backend.shared.config import settings
from pixsim7_backend.infrastructure.database.session import (
    init_database,
    close_database
)
from pixsim7_backend.infrastructure.logging import setup_logging, get_logger
from pixsim7_backend.infrastructure.redis import close_redis
from pixsim7_backend.api.middleware import RequestIdMiddleware

# Configure structured logging
log_file = os.getenv("LOG_FILE", "data/logs/backend.log")
json_logs = os.getenv("JSON_LOGS", "false").lower() == "true"

setup_logging(
    log_level=settings.log_level,
    log_file=log_file,
    json_logs=json_logs
)

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    logger.info("🚀 Starting PixSim7...")
    
    # Assert secret_key in production
    if not settings.debug and settings.secret_key == "change-this-in-production":
        raise ValueError("SECRET_KEY must be set in production mode. Set DEBUG=true for development or provide a secure SECRET_KEY.")

    # Import all domain models to register them with SQLModel
    from pixsim7_backend.domain import (
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
        Scene,
        SceneAsset,
        SceneConnection,
    )

    # Initialize database
    await init_database()
    logger.info("✅ Database initialized")

    # Initialize Redis
    try:
        from pixsim7_backend.infrastructure.redis import get_redis, check_redis_connection
        redis_available = await check_redis_connection()
        if redis_available:
            logger.info("✅ Redis connected")
        else:
            logger.warning("⚠️ Redis not available - background jobs will not work")
    except Exception as e:
        logger.warning(f"⚠️ Redis initialization failed: {e}")
        logger.warning("⚠️ Background jobs will not work without Redis")

    # Register providers
    from pixsim7_backend.services.provider import register_default_providers
    register_default_providers()
    logger.info("✅ Providers registered")

    # TODO: Initialize event handlers
    # from pixsim7_backend.infrastructure.events.handlers import register_handlers
    # register_handlers()

    logger.info("✅ PixSim7 ready!")

    yield

    # Shutdown
    logger.info("👋 Shutting down PixSim7...")
    await close_redis()
    await close_database()
    logger.info("✅ Cleanup complete")


# Create FastAPI app
app = FastAPI(
    title=settings.api_title,
    version=settings.api_version,
    description="Clean architecture video generation and scene assembly platform",
    lifespan=lifespan,
    debug=settings.debug,
)

# Add request ID middleware for log tracing
app.add_middleware(RequestIdMiddleware)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===== HEALTH CHECK =====

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "PixSim7",
        "version": settings.api_version,
        "status": "running"
    }


@app.get("/health")
async def health():
    """Health check endpoint"""
    from pixsim7_backend.services.provider import registry
    from pixsim7_backend.infrastructure.redis import check_redis_connection
    from sqlalchemy import text
    from pixsim7_backend.infrastructure.database.session import get_async_session

    # Check Redis connection
    redis_status = "connected" if await check_redis_connection() else "disconnected"

    # Check database connection
    db_status = "connected"
    try:
        async with get_async_session() as db:
            await db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"error: {e.__class__.__name__}"

    return {
        "status": "healthy",
        "database": db_status,
        "redis": redis_status,
        "providers": registry.list_provider_ids(),
    }


# ===== API ROUTES =====

from pixsim7_backend.api.v1 import auth, users, jobs, assets, admin, services, accounts, providers, lineage
from pixsim7_backend.api.admin import database_router, migrations_router
app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
app.include_router(users.router, prefix="/api/v1", tags=["users"])
app.include_router(jobs.router, prefix="/api/v1", tags=["jobs"])
app.include_router(assets.router, prefix="/api/v1", tags=["assets"])
app.include_router(admin.router, prefix="/api/v1", tags=["admin"])
app.include_router(services.router, prefix="/api/v1", tags=["services"])
app.include_router(accounts.router, prefix="/api/v1", tags=["accounts"])
app.include_router(providers.router, prefix="/api/v1", tags=["providers"])
app.include_router(lineage.router, prefix="/api/v1", tags=["lineage"])
app.include_router(database_router, prefix="/api", tags=["database"])
app.include_router(migrations_router, prefix="/api", tags=["migrations"])

# TODO: Include more routers (Phase 2)
# from pixsim7_backend.api.v1 import scenes
# app.include_router(scenes.router, prefix="/api/v1", tags=["scenes"])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower()
    )
