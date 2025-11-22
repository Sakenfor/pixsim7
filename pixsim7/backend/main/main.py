"""
PixSim7 FastAPI Application

Clean architecture entry point
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
import os
import sys
from pathlib import Path

# Fix Windows asyncio + asyncpg compatibility
if sys.platform == 'win32':
    import asyncio
    # Use SelectorEventLoop for asyncpg compatibility on Windows
    # Note: ProactorEventLoop has issues with asyncpg connections
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Load .env file BEFORE any other imports that need env vars
from dotenv import load_dotenv
load_dotenv()

from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.infrastructure.database.session import (
    init_database,
    close_database
)
from pixsim7.backend.main.infrastructure.redis import close_redis
from pixsim7.backend.main.infrastructure.plugins import init_plugin_manager
from pixsim7.backend.main.infrastructure.middleware import init_middleware_manager

# Configure structured logging using pixsim_logging
from pixsim_logging import configure_logging

logger = configure_logging("api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    logger.info("Starting PixSim7...")
    
    # Assert secret_key in production
    if not settings.debug and settings.secret_key == "change-this-in-production":
        raise ValueError("SECRET_KEY must be set in production mode. Set DEBUG=true for development or provide a secure SECRET_KEY.")

    # Auto-register domain models with SQLModel
    from pixsim7.backend.main.infrastructure.domain_registry import init_domain_registry
    domain_registry = init_domain_registry(str(settings.domain_models_dir))
    logger.info(
        f"Registered {len(domain_registry.registered_models)} domain models",
        domain_models_dir=str(settings.domain_models_dir)
    )

    # Initialize database
    await init_database()
    logger.info("Database initialized")

    # Seed default presets
    try:
        from pixsim7.backend.main.seeds.default_presets import seed_default_presets
        from pixsim7.backend.main.infrastructure.database.session import get_async_session
        async with get_async_session() as db:
            await seed_default_presets(db)
        logger.info("Default presets seeded")
    except Exception as e:
        logger.warning(f"Failed to seed default presets: {e}")

    # Initialize Redis
    try:
        from pixsim7.backend.main.infrastructure.redis import get_redis, check_redis_connection
        redis_available = await check_redis_connection()
        if redis_available:
            logger.info("Redis connected")
        else:
            logger.warning("Redis not available - background jobs will not work")
    except Exception as e:
        logger.warning(f"Redis initialization failed: {e}")
        logger.warning("Background jobs will not work without Redis")

    # Register providers
    from pixsim7.backend.main.services.provider import register_default_providers
    register_default_providers()
    logger.info("Providers registered")

    # Initialize event handlers (metrics, webhooks, etc.)
    from pixsim7.backend.main.infrastructure.events.handlers import register_handlers
    register_handlers()

    # Initialize WebSocket event handlers
    from pixsim7.backend.main.infrastructure.events.websocket_handler import register_websocket_handlers
    register_websocket_handlers()

    # Register core ECS components (Task 27, Phase 27.2)
    # This must happen before plugins are loaded so plugins can see core components
    from pixsim7.backend.main.domain.game.ecs import register_core_components
    core_components_count = register_core_components()
    logger.info(f"Registered {core_components_count} core ECS components")

    # Initialize plugin system (feature plugins)
    plugin_manager = init_plugin_manager(
        app,
        str(settings.feature_plugins_dir),
        fail_fast=settings.debug  # Fail fast in dev/CI if required plugins fail
    )
    logger.info(
        f"Loaded {len(plugin_manager.list_plugins())} feature plugins",
        feature_plugins_dir=str(settings.feature_plugins_dir)
    )

    # Initialize route plugin system (core API routes)
    routes_manager = init_plugin_manager(
        app,
        str(settings.route_plugins_dir),
        fail_fast=settings.debug  # Fail fast in dev/CI if required plugins fail
    )
    logger.info(
        f"Loaded {len(routes_manager.list_plugins())} core routes",
        route_plugins_dir=str(settings.route_plugins_dir)
    )

    # Register plugin managers for dependency injection (Phase 16.3)
    from pixsim7.backend.main.infrastructure.plugins import set_plugin_manager
    # Set the feature plugin manager as primary (routes can use same pattern)
    set_plugin_manager(plugin_manager)
    logger.info("Plugin dependency injection configured")

    # Enable all plugins
    await plugin_manager.enable_all()
    await routes_manager.enable_all()

    # Lock behavior extension registry (Phase 16.4)
    # After all plugins are loaded, prevent runtime registration
    from pixsim7.backend.main.infrastructure.plugins.behavior_registry import behavior_registry
    behavior_registry.lock()
    stats = behavior_registry.get_stats()
    logger.info(
        "Behavior extension registry locked",
        conditions=stats['conditions']['total'],
        effects=stats['effects']['total'],
        simulation_configs=stats['simulation_configs']['total'],
    )

    # Configure admin plugin diagnostics endpoint (Phase 16.5)
    from pixsim7.backend.main.api.v1.admin_plugins import set_plugin_managers
    set_plugin_managers(plugin_manager, routes_manager)
    logger.info("Admin plugin diagnostics configured")

    # Enable all middleware (call lifecycle hooks)
    # Note: Middleware was already registered before lifespan, this just calls hooks
    from pixsim7.backend.main.infrastructure.middleware.manager import middleware_manager
    if middleware_manager:
        await middleware_manager.enable_all()

    logger.info("PixSim7 ready!")

    yield

    # Shutdown
    logger.info("Shutting down PixSim7...")

    # Disable middleware
    if middleware_manager:
        await middleware_manager.disable_all()

    # Disable plugins
    await routes_manager.disable_all()
    await plugin_manager.disable_all()

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

# Initialize middleware plugin system
# Middleware is loaded and registered here (before app startup)
init_middleware_manager(app, str(settings.middleware_dir))
logger.info(
    "Middleware plugin system initialized",
    middleware_dir=str(settings.middleware_dir)
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
    from pixsim7.backend.main.services.provider import registry
    from pixsim7.backend.main.infrastructure.redis import check_redis_connection
    from sqlalchemy import text
    from pixsim7.backend.main.infrastructure.database.session import get_async_session

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

# All API routes are now loaded via the plugin system
# See pixsim7/backend/main/routes/ for core API route plugins
# See pixsim7/backend/main/plugins/ for feature plugins (game mechanics, etc.)
#
# Routes are auto-discovered and registered during app startup (see lifespan function above)


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
