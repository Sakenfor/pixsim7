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
from pixsim_logging import configure_logging, configure_stdlib_root_logger
import logging as stdlib_logging

logger = configure_logging("api")
configure_stdlib_root_logger()

# Log the effective log level for diagnostics
effective_level = stdlib_logging.getLogger().level
level_name = stdlib_logging.getLevelName(effective_level)
logger.info(
    "logging_configured",
    level=level_name,
    log_level_env=os.getenv("LOG_LEVEL", "not set"),
    msg=f"Logging initialized at {level_name} level (root logger configured for all modules)"
)


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
        setup_analyzer_plugins,
        setup_authoring_workflow_plugins,
        setup_meta_contract_plugins,
        setup_registry_cleanup_hooks,
        setup_analyzer_presets,
        setup_event_handlers,
        setup_ecs_components,
        setup_stat_packages,
        setup_composition_packages,
        setup_link_system,
        setup_behavior_builtins,
        setup_plugins,
        setup_behavior_registry_lock,
        configure_admin_diagnostics,
        setup_middleware_lifecycle,
    )
    from pixsim7.backend.main.infrastructure.events.redis_bridge import (
        start_event_bus_bridge,
        stop_event_bus_bridge,
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

    # Register model-level audit hooks (after all models are imported)
    from pixsim7.backend.main.services.audit import register_audit_hooks
    register_audit_hooks()

    # Setup database and seed all registered content loaders
    # (presets, tags, plugins, content packs, primitives, system config,
    #  analyzer definitions, authoring modes — all via content loader registry)
    await setup_database_and_seed()

    # Wire agent heartbeat persistence (DB must be ready)
    from pixsim7.backend.main.services.meta.agent_sessions import agent_session_registry
    from pixsim7.backend.main.services.meta.agent_sessions import CanonicalHeartbeat as _CHB
    from pixsim7.backend.main.domain.docs.models import AgentActivityLog
    from pixsim7.backend.main.infrastructure.database.session import get_async_session

    async def _persist_heartbeat(hb: _CHB) -> None:
        try:
            async with get_async_session() as db:
                db.add(AgentActivityLog(
                    session_id=hb.session_id,
                    agent_type=hb.agent_type,
                    status=hb.status,
                    contract_id=hb.contract_id,
                    plan_id=hb.plan_id,
                    action=hb.action,
                    detail=hb.detail or None,
                    endpoint=hb.endpoint,
                    extra=dict(hb.metadata) if hb.metadata else None,
                    timestamp=hb.timestamp,
                ))
                await db.commit()
        except Exception:
            pass  # non-critical — in-memory state is the primary

    agent_session_registry.set_persist(_persist_heartbeat)

    # Setup Redis (optional - degraded mode without it)
    redis_available = await setup_redis()
    app.state.redis_available = redis_available

    # Setup providers, AI models, events, and ECS
    setup_providers()
    setup_ai_models()
    setup_analyzer_plugins()
    setup_authoring_workflow_plugins()
    setup_meta_contract_plugins()
    setup_registry_cleanup_hooks()
    setup_event_handlers()
    event_bridge = await start_event_bus_bridge(role="api")
    app.state.event_bridge = event_bridge
    ecs_count = setup_ecs_components()

    # Setup stat packages
    stat_packages_count = setup_stat_packages()

    # Setup composition packages
    composition_packages_count = setup_composition_packages()

    # Setup link system
    link_stats = setup_link_system()

    # Setup built-in game behaviors (BEFORE plugins so they can extend/override)
    behavior_stats = setup_behavior_builtins()

    # Setup plugins (core and external)
    plugin_manager, routes_manager = await setup_plugins(
        app,
        settings.feature_plugins_dir,
        settings.route_plugins_dir,
        fail_fast=settings.debug,
        external_plugins_dir=settings.external_plugins_dir
    )

    # Load approved analyzer presets after plugins (ensures plugin analyzers exist)
    await setup_analyzer_presets()

    # Attach managers to app.state for request-context access
    app.state.plugin_manager = plugin_manager
    app.state.routes_manager = routes_manager
    app.state.middleware_manager = middleware_manager

    # Register both plugin managers for PluginContext dependency injection
    set_plugin_manager(plugin_manager, namespace="feature")
    set_plugin_manager(routes_manager, namespace="route")

    # Lock behavior registry
    stats = setup_behavior_registry_lock(plugin_manager, routes_manager)

    # Configure admin diagnostics
    configure_admin_diagnostics(plugin_manager, routes_manager)

    # Enable middleware lifecycle hooks
    await setup_middleware_lifecycle(app)

    # Start registry-driven content watchers (auto-reloads YAML on change)
    from pixsim7.backend.main.services.content.watcher import (
        start_content_watchers,
        stop_content_watchers,
    )
    start_content_watchers()

    # Run all TTL-gated syncs (test suites, etc.) so DB is fresh at startup
    from pixsim7.backend.main.services.sync import run_startup_syncs
    from pixsim7.backend.main.infrastructure.database.session import get_async_session
    async with get_async_session() as db:
        await run_startup_syncs(db)

    logger.info("pixsim7_ready")

    yield

    # ===== SHUTDOWN =====
    logger.info("pixsim7_shutdown_begin")

    # Stop content watchers
    await stop_content_watchers()

    # Disable middleware
    if middleware_manager:
        await middleware_manager.disable_all()

    # Disable plugins
    await routes_manager.disable_all()
    await plugin_manager.disable_all()

    # Close connections
    await close_redis()
    await close_database()
    await stop_event_bus_bridge()

    logger.info("pixsim7_shutdown_complete")


# Create FastAPI app
app = FastAPI(
    title=settings.api_title,
    version=settings.api_version,
    description="Clean architecture video generation and scene assembly platform",
    lifespan=lifespan,
    debug=settings.debug,
)

# Register global exception handlers for consistent error responses
from pixsim7.backend.main.api.exception_handlers import register_exception_handlers
register_exception_handlers(app)

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
        # Limit hot-reload to backend sources and ignore local runtime/build outputs
        reload_dirs=[str(Path(__file__).parent)],
        reload_includes=["*.py"],
        reload_excludes=[
            "data/*",
            "data/**",
            ".pixsim/*",
            ".pixsim/**",
            ".pixsim7/*",
            ".pixsim7/**",
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
