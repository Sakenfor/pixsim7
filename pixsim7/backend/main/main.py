"""
PixSim7 FastAPI Application

Clean architecture entry point
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
import os
import sys
from pathlib import Path

# Fix Windows asyncio compatibility
if sys.platform == 'win32':
    import asyncio
    # Use ProactorEventLoop for subprocess support (needed by Playwright)
    # SQLAlchemy with asyncpg works fine with ProactorEventLoop
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

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
    """
    Application lifespan - orchestrates startup and shutdown.

    This function is intentionally short and focused on orchestration.
    All complex logic is extracted into testable helpers in startup.py.
    """
    from pixsim7.backend.main.startup import (
        validate_settings,
        setup_domain_registry,
        setup_database_and_seed,
        setup_redis,
        setup_providers,
        setup_ai_models,
        setup_event_handlers,
        setup_ecs_components,
        setup_stat_packages,
        setup_plugins,
        setup_behavior_registry_lock,
        configure_admin_diagnostics,
        setup_middleware_lifecycle,
    )
    from pixsim7.backend.main.infrastructure.plugins import set_plugin_manager
    from pixsim7.backend.main.infrastructure.middleware.manager import middleware_manager

    # ===== STARTUP =====
    logger.info("pixsim7_startup_begin")

    # Validate settings (fail-fast if invalid)
    validate_settings(settings)

    # Setup domain registry
    domain_registry = setup_domain_registry(settings.domain_models_dir)
    app.state.domain_registry = domain_registry
    logger.info("domain_registry_attached", count=len(domain_registry.registered_models))

    # Setup database and seed defaults
    await setup_database_and_seed()

    # Setup Redis (optional - degraded mode without it)
    redis_available = await setup_redis()
    app.state.redis_available = redis_available

    # Setup providers, AI models, events, and ECS
    setup_providers()
    setup_ai_models()
    setup_event_handlers()
    ecs_count = setup_ecs_components()

    # Setup stat packages
    stat_packages_count = setup_stat_packages()

    # Setup plugins
    plugin_manager, routes_manager = await setup_plugins(
        app,
        settings.feature_plugins_dir,
        settings.route_plugins_dir,
        fail_fast=settings.debug
    )

    # Attach managers to app.state for request-context access
    app.state.plugin_manager = plugin_manager
    app.state.routes_manager = routes_manager
    app.state.middleware_manager = middleware_manager

    # Also set global plugin manager for backward compatibility
    set_plugin_manager(plugin_manager)

    # Lock behavior registry
    stats = setup_behavior_registry_lock(plugin_manager, routes_manager)

    # Configure admin diagnostics
    configure_admin_diagnostics(plugin_manager, routes_manager)

    # Enable middleware lifecycle hooks
    await setup_middleware_lifecycle(app)

    logger.info("pixsim7_ready")

    yield

    # ===== SHUTDOWN =====
    logger.info("pixsim7_shutdown_begin")

    # Disable middleware
    if middleware_manager:
        await middleware_manager.disable_all()

    # Disable plugins
    await routes_manager.disable_all()
    await plugin_manager.disable_all()

    # Close connections
    await close_redis()
    await close_database()

    logger.info("pixsim7_shutdown_complete")


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


# ===== HEALTH AND READINESS ENDPOINTS =====

# Import health router (provides /, /health, /ready)
from pixsim7.backend.main.api.health import router as health_router
app.include_router(health_router)


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
