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

    # Silence the Windows ProactorEventLoop cleanup race for forcibly-closed
    # peers (browser WS drops, cancelled health polls, subprocess pipe close).
    # asyncio's connection_lost path does socket.shutdown() on an already-dead
    # socket, raising WinError 10054/10053. Harmless but spammy.
    if sys.platform == 'win32':
        _loop = asyncio.get_running_loop()
        _default_handler = _loop.get_exception_handler() or _loop.default_exception_handler

        def _silence_proactor_disconnect(loop, context):
            exc = context.get("exception")
            if isinstance(exc, (ConnectionResetError, ConnectionAbortedError)):
                if getattr(exc, "winerror", None) in (10053, 10054):
                    return
            _default_handler(context)

        _loop.set_exception_handler(_silence_proactor_disconnect)

    # Validate settings (fail-fast if invalid)
    validate_settings(settings)

    # Bind capability implementations into the runtime locator. Routes that use
    # Depends(get_<capability>) read from this. See manifest-runtime-binding plan.
    from pixsim7.backend.main.infrastructure.plugins.capabilities.locator import (
        bind_default_capabilities,
    )
    bind_default_capabilities()

    # Bind sibling-package capabilities (automation, embedding, ...) registered
    # for this host. Single source of truth: backend/main/capability_registry.py.
    from pixsim7.backend.main.capability_registry import bind_for_host
    bind_for_host("fastapi")

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
                    run_id=hb.run_id,
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

    # Best-effort: push the embedding hosted set (derived from the enabled
    # asset:embedding instances) to the daemon so its served models track the
    # instances after a restart. Backgrounded so a warming/absent daemon never
    # delays readiness; the per-instance write hook keeps it fresh thereafter.
    async def _sync_embedding_daemon_bg() -> None:
        try:
            from pixsim7.backend.main.services.embedding.daemon_sync import (
                sync_embedding_daemon_models,
            )
            async with get_async_session() as sync_db:
                await sync_embedding_daemon_models(sync_db)
        except Exception:  # noqa: BLE001 — advisory; never affect startup
            pass

    # Best-effort: push the text daemon's served model (resolved from the
    # prompt:embedding analyzer config) to its /config so it warm-swaps to the
    # active embedder after a restart, without a card restart. No DB needed — the
    # model comes from the in-memory analyzer registry.
    async def _sync_text_embedding_daemon_bg() -> None:
        try:
            from pixsim7.backend.main.services.embedding.daemon_sync import (
                sync_text_embedding_daemon,
            )
            await sync_text_embedding_daemon()
        except Exception:  # noqa: BLE001 — advisory; never affect startup
            pass

    import asyncio as _asyncio
    _asyncio.create_task(_sync_embedding_daemon_bg())
    _asyncio.create_task(_sync_text_embedding_daemon_bg())

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

    # Tear down sibling-package capabilities bound for this host (symmetric
    # with bind_for_host("fastapi") at startup; no-op for capabilities that
    # never spawned a resource, e.g. the lazy embedding image daemon).
    from pixsim7.backend.main.capability_registry import shutdown_for_host
    await shutdown_for_host("fastapi")

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

# Debug control endpoint — runtime log level/domain changes without restart
try:
    from pixsim_logging.debug_endpoint import create_debug_router
    app.include_router(create_debug_router(), prefix="/_debug")
except ImportError:
    pass


# ===== API ROUTES =====

# All API routes are now loaded via the plugin system
# See pixsim7/backend/main/routes/ for core API route plugins
# See pixsim7/backend/main/plugins/ for feature plugins (game mechanics, etc.)
#
# Routes are auto-discovered and registered during app startup (see lifespan function above)


if __name__ == "__main__":
    import uvicorn

    repo_root = Path(__file__).resolve().parents[3]
    reload_dirs = [
        path for path in (
            Path(__file__).parent,
            repo_root / "pixsim7" / "common",
            repo_root / "pixsim7" / "automation",
            repo_root / "pixsim7" / "embedding",
            repo_root / "pixsim7" / "codegen",
            repo_root / "pixsim_logging",
            repo_root / "pixsim_settings",
            repo_root / "libs" / "pixverse-py" / "pixverse",
        )
        if path.is_dir()
    ]

    uvicorn.run(
        "pixsim7.backend.main.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        # Limit hot-reload to backend sources and ignore local runtime/build outputs
        reload_dirs=[str(path) for path in reload_dirs],
        reload_includes=["*.py"],
        reload_excludes=[
            "tests/*",
            "tests/**",
            "pixsim7/backend/tests/*",
            "pixsim7/backend/tests/**",
            "data/*",
            "data/**",
            "docs/*",
            "docs/**",
            "examples/*",
            "examples/**",
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
        log_level=settings.log_level.lower(),
        access_log=False,  # Disable uvicorn's access log — RequestLoggingMiddleware handles this with richer context
    )
