"""
PixSim7 FastAPI Application

Clean architecture entry point
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import os
import sys
from pathlib import Path

# Fix Windows asyncio subprocess support
if sys.platform == 'win32':
    import asyncio
    # Set ProactorEventLoop policy for Windows to support subprocess operations
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

# Load .env file BEFORE any other imports that need env vars
from dotenv import load_dotenv
load_dotenv()

from pixsim7_backend.shared.config import settings
from pixsim7_backend.infrastructure.database.session import (
    init_database,
    close_database
)
from pixsim7_backend.infrastructure.redis import close_redis
from pixsim7_backend.api.middleware import RequestIdMiddleware

# Configure structured logging using pixsim_logging
from pixsim_logging import configure_logging

logger = configure_logging("api")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        from time import time as _time
        start = _time()
        response = await call_next(request)
        duration_ms = int((_time() - start) * 1000)
        try:
            logger.info(
                "http_request",
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                duration_ms=duration_ms,
            )
        except Exception:
            pass
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    logger.info("Starting PixSim7...")
    
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
        LogEntry,
    )
    # Register automation domain models
    from pixsim7_backend.domain.automation import (
        AndroidDevice,
        AppActionPreset,
        AutomationExecution,
        ExecutionLoop,
        ExecutionLoopHistory,
    )
    # Register game domain models
    from pixsim7_backend.domain.game import (
        GameScene,
        GameSceneNode,
        GameSceneEdge,
        GameSession,
        GameSessionEvent,
        GameLocation,
        GameNPC,
        NPCSchedule,
        NPCState,
    )

    # Initialize database
    await init_database()
    logger.info("Database initialized")

    # Seed default presets
    try:
        from pixsim7_backend.seeds.default_presets import seed_default_presets
        from pixsim7_backend.infrastructure.database.session import get_async_session
        async with get_async_session() as db:
            await seed_default_presets(db)
        logger.info("Default presets seeded")
    except Exception as e:
        logger.warning(f"Failed to seed default presets: {e}")

    # Initialize Redis
    try:
        from pixsim7_backend.infrastructure.redis import get_redis, check_redis_connection
        redis_available = await check_redis_connection()
        if redis_available:
            logger.info("Redis connected")
        else:
            logger.warning("Redis not available - background jobs will not work")
    except Exception as e:
        logger.warning(f"Redis initialization failed: {e}")
        logger.warning("Background jobs will not work without Redis")

    # Register providers
    from pixsim7_backend.services.provider import register_default_providers
    register_default_providers()
    logger.info("Providers registered")

    # Initialize event handlers (metrics, webhooks, etc.)
    from pixsim7_backend.infrastructure.events.handlers import register_handlers
    register_handlers()

    logger.info("PixSim7 ready!")

    yield

    # Shutdown
    logger.info("Shutting down PixSim7...")
    await close_redis()
    await close_database()
    logger.info("Cleanup complete")


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
app.add_middleware(RequestLoggingMiddleware)

# CORS middleware - must be added last (first in execution chain)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
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

from pixsim7_backend.api.v1 import auth, users, jobs, assets, admin, services, accounts, providers, lineage, logs, automation, device_agents, game_scenes, game_sessions, game_locations, game_npcs, game_worlds, game_dialogue, game_stealth
from pixsim7_backend.api.admin import database_router, migrations_router
app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
app.include_router(users.router, prefix="/api/v1", tags=["users"])
app.include_router(jobs.router, prefix="/api/v1", tags=["jobs"])
app.include_router(assets.router, prefix="/api/v1", tags=["assets"])
app.include_router(admin.router, prefix="/api/v1", tags=["admin"])
app.include_router(services.router, prefix="/api/v1", tags=["services"])
app.include_router(accounts.router, prefix="/api/v1", tags=["accounts"])
app.include_router(automation.router, prefix="/api/v1", tags=["automation"])
app.include_router(device_agents.router, prefix="/api/v1", tags=["device-agents"])
app.include_router(providers.router, prefix="/api/v1", tags=["providers"])
app.include_router(lineage.router, prefix="/api/v1", tags=["lineage"])
app.include_router(logs.router, prefix="/api/v1/logs", tags=["logs"])
app.include_router(game_scenes.router, prefix="/api/v1/game/scenes", tags=["game-scenes"])
app.include_router(game_sessions.router, prefix="/api/v1/game/sessions", tags=["game-sessions"])
app.include_router(game_locations.router, prefix="/api/v1/game/locations", tags=["game-locations"])
app.include_router(game_npcs.router, prefix="/api/v1/game/npcs", tags=["game-npcs"])
app.include_router(game_worlds.router, prefix="/api/v1/game/worlds", tags=["game-worlds"])
app.include_router(game_dialogue.router, prefix="/api/v1/game/dialogue", tags=["game-dialogue"])
app.include_router(game_stealth.router, prefix="/api/v1", tags=["game-stealth"])
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
        # Limit hot-reload to backend sources and ignore data/logs and build outputs
        reload_dirs=[str(Path(__file__).parent)],
        reload_includes=["*.py"],
        reload_excludes=[
            "data/*",
            "data/**",
            "**/*.log",
            "**/logs/**",
            "**/node_modules/**",
            "**/.svelte-kit/**",
            "**/dist/**",
            "**/.venv/**",
            "**/__pycache__/**",
        ],
        log_level=settings.log_level.lower()
    )
