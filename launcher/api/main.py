"""
Launcher API - Production REST API for PixSim7 Launcher.

Provides HTTP REST API and WebSocket for managing PixSim7 services.

Uses launcher_core with dependency injection and event bus for
clean, decoupled architecture.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from contextlib import asynccontextmanager
import logging
import os
import sys
from pathlib import Path

# Add project root to path
ROOT = Path(__file__).parent.parent
PROJECT_ROOT = ROOT.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(PROJECT_ROOT))

# Ensure human-readable logs for the launcher API itself
os.environ.setdefault("PIXSIM_LOG_FORMAT", "human")


class _TeeWriter:
    """Write to both the original stream and a log file."""

    def __init__(self, original, log_file_path: str):
        self._original = original
        self._file = open(log_file_path, "a", encoding="utf-8", errors="replace")

    def write(self, text: str) -> int:
        if text and text.strip():
            self._file.write(text if text.endswith("\n") else text + "\n")
            self._file.flush()
        return self._original.write(text)

    def flush(self):
        self._file.flush()
        self._original.flush()

    def fileno(self):
        return self._original.fileno()

    def isatty(self):
        return self._original.isatty()

    def __getattr__(self, name):
        return getattr(self._original, name)


def _setup_logging():
    """Initialize structured logging for launcher-api.

    Uses pixsim_logging for structured console output and tees stdout
    to ``data/logs/console/launcher-api.log`` so the LogManager can
    surface them in the service card.
    """
    from launcher.core.paths import console_log_file, ensure_launcher_runtime_dirs

    ensure_launcher_runtime_dirs()

    # Tee stdout/stderr to the console log file.
    # structlog renders directly to stdout (bypassing stdlib handlers),
    # so a file handler on the root logger won't capture structlog output.
    # Tee-ing stdout captures everything: structlog, print(), uvicorn.
    log_path = str(console_log_file("launcher-api"))
    if not isinstance(sys.stdout, _TeeWriter):
        sys.stdout = _TeeWriter(sys.stdout, log_path)
    if not isinstance(sys.stderr, _TeeWriter):
        sys.stderr = _TeeWriter(sys.stderr, log_path)

    # Structured logging via pixsim_logging (same pipeline as backend + client)
    from pixsim_logging import configure_logging, configure_stdlib_root_logger
    logger = configure_logging("launcher", json=False)
    configure_stdlib_root_logger()

    # Suppress noisy uvicorn access logs (individual requests)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

    return logger


_logger = _setup_logging()

from launcher.core import create_container, __version__
from launcher.core.migrate_settings import maybe_migrate

from .routes import (
    services_router,
    logs_router,
    events_router,
    health_router,
    buildables_router,
    settings_router,
    codegen_router,
    migrations_router,
    databases_router,
    squash_router,
    debug_router,
    identity_router,
    window_router,
)
from .dependencies import set_container


# Global container
_container = None


_token_refresh_task: "asyncio.Task[None] | None" = None


async def _token_refresh_loop(app: FastAPI, check_interval: float = 300):
    """Background loop that refreshes the stored launcher token.

    Checks every *check_interval* seconds (default 5 min) whether the
    token is past its refresh threshold and mints a new one if so.
    Events are emitted so the launcher UI can react.
    """
    import asyncio
    from launcher.core.auth import token_needs_refresh, refresh_stored_token
    from launcher.core.event_bus import get_event_bus, EventTypes

    bus = get_event_bus()

    while True:
        await asyncio.sleep(check_interval)
        identity = getattr(app.state, "launcher_identity", None)
        if not identity:
            continue
        try:
            if token_needs_refresh():
                ok = refresh_stored_token(identity)
                if ok:
                    _logger.info("token_auto_refreshed", backend=identity.backend_url)
                    from launcher.core.auth import get_token_info
                    info = get_token_info()
                    bus.publish_simple(EventTypes.TOKEN_REFRESHED, "auth", {
                        "expires_at": info.get("exp") if info else None,
                    })
                else:
                    _logger.warning("token_auto_refresh_failed")
                    bus.publish_simple(EventTypes.TOKEN_REFRESH_FAILED, "auth")
        except Exception:
            _logger.exception("token_refresh_error")
            bus.publish_simple(EventTypes.TOKEN_REFRESH_FAILED, "auth")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup/shutdown.

    If a container was already injected (e.g. by the GUI's embedded API),
    skip creating a new one — the GUI's facade manages the lifecycle.
    """
    global _container, _token_refresh_task

    from .dependencies import get_container as _get_existing

    # Check if a container was already injected by the GUI
    already_injected = False
    try:
        existing = _get_existing()
        already_injected = True
        _container = existing
        _logger.info("startup_embedded", mode="embedded")
    except Exception:
        pass

    if not already_injected:
        # Standalone mode: create our own container
        _logger.info("startup_standalone", mode="standalone")

        # --- Identity & auth bootstrap ---
        from launcher.core.auth import ensure_identity, get_public_key_b64, refresh_stored_token
        identity = ensure_identity()
        if identity:
            _logger.info("identity_loaded", user=identity.username, keypair=identity.keypair_id)
            # Inject launcher public key so backend trusts launcher-minted tokens
            pub_key_b64 = get_public_key_b64()
            if pub_key_b64:
                os.environ.setdefault("PIXSIM_LAUNCHER_PUBLIC_KEY", pub_key_b64)
            # Refresh stored token if expired (so MCP/bridge have a valid token)
            refreshed = refresh_stored_token(identity)
            if refreshed:
                _logger.info("token_refreshed", backend=identity.backend_url)

            # Start background token refresh loop
            import asyncio
            _token_refresh_task = asyncio.create_task(_token_refresh_loop(app))
        else:
            _logger.info("identity_missing", hint="first-time setup required")
        app.state.launcher_identity = identity

        # Migrate .env → per-service settings on first run
        try:
            maybe_migrate()
        except Exception:
            _logger.exception("settings_migration_error")

        from launcher.core.services import build_services_from_manifests
        from launcher.core.service_converter import convert_service_def

        raw_services = build_services_from_manifests()

        # Apply global exports from per-service settings to os.environ
        # so child processes inherit platform config (DATABASE_URL, etc.)
        try:
            from launcher.core.service_settings import collect_global_exports
            _exports = collect_global_exports(raw_services)
            for k, v in _exports.items():
                if v:
                    os.environ.setdefault(k, v)
        except Exception:
            _logger.exception("global_exports_error")

        services_list = [convert_service_def(sd) for sd in raw_services]
        _logger.info("services_loaded", count=len(services_list))

        # Health tuning from platform settings (PIXSIM_HEALTH_* env, exported by _platform manifest).
        def _env_float(name: str, default: float) -> float:
            raw = os.environ.get(name)
            if not raw:
                return default
            try:
                return float(raw)
            except ValueError:
                return default

        _container = create_container(
            services_list,
            root_dir=ROOT,
            config_overrides={
                'health': {
                    'base_interval': _env_float('PIXSIM_HEALTH_INTERVAL', 2.0),
                    'http_timeout': _env_float('PIXSIM_HEALTH_TIMEOUT', 1.5),
                    'adaptive_enabled': True,
                }
            }
        )

        set_container(_container)
        _container.start_all()
        _logger.info("managers_started")

        # Mark launcher-api as running (we ARE the launcher-api process)
        process_mgr = _container.get_process_manager()
        api_state = process_mgr.get_state("launcher-api")
        if api_state:
            from launcher.core.types import ServiceStatus, HealthStatus
            api_state.status = ServiceStatus.RUNNING
            api_state.health = HealthStatus.HEALTHY
            api_state.pid = os.getpid()

        # Auto-start services that have auto_start AND whose dependencies are met.
        # Only start services whose deps are already running (e.g. launcher-ui
        # depends on launcher-api which we just marked running above).
        # Services with unmet deps (e.g. main-api needs db) are skipped silently.
        for key, state in process_mgr.get_all_states().items():
            defn = state.definition
            if not defn.auto_start or process_mgr.is_running(key):
                continue
            # Check deps are met before attempting
            deps_met = True
            for dep_key in (defn.depends_on or []):
                dep_state = process_mgr.get_state(dep_key)
                if not dep_state or not process_mgr.is_running(dep_key):
                    deps_met = False
                    break
            if deps_met:
                if process_mgr.start(key):
                    _logger.info("auto_started", service=key)
                else:
                    _logger.warning("auto_start_failed", service=key, error=state.last_error)

    yield

    # Cancel token refresh background task
    if _token_refresh_task and not _token_refresh_task.done():
        _token_refresh_task.cancel()
        _token_refresh_task = None

    # Shutdown — only stop managers we created
    if not already_injected and _container:
        _logger.info("shutting_down")
        _container.stop_all()
        _logger.info("shutdown_complete")


# Create FastAPI app
app = FastAPI(
    title="PixSim7 Launcher API",
    description="""
    Production REST API for managing PixSim7 services.

    ## Features

    - **Service Management**: Start, stop, restart services
    - **Real-time Events**: WebSocket for live updates
    - **Log Management**: Query and stream service logs
    - **Health Monitoring**: Service health checks
    - **Statistics**: System and service statistics

    ## Architecture

    Built on launcher_core with dependency injection and event bus
    for clean, testable, reusable code.

    ## Usage

    ### Start a service:
    ```
    POST /services/backend/start
    ```

    ### Get service status:
    ```
    GET /services/backend
    ```

    ### Stream events (WebSocket):
    ```
    WS /events/ws
    ```

    ### Get logs:
    ```
    GET /logs/backend?tail=100
    ```
    """,
    version=__version__,
    lifespan=lifespan
)

# CORS middleware (allow all origins for development)
# In production, restrict to specific origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Change to specific origins in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include routers
app.include_router(services_router)
app.include_router(logs_router)
app.include_router(events_router)
app.include_router(health_router)
app.include_router(buildables_router)
app.include_router(settings_router)
app.include_router(codegen_router)
app.include_router(migrations_router)
app.include_router(databases_router)
app.include_router(squash_router)
app.include_router(debug_router)
app.include_router(identity_router)
app.include_router(window_router)

# Debug control endpoint — runtime log level/domain changes without restart
try:
    from pixsim_logging.debug_endpoint import create_debug_router
    app.include_router(create_debug_router(), prefix="/_debug")
except ImportError:
    pass


# The launcher UI is served by Vite (launcher-ui service on port 3100).
# API root redirects there so bookmarks/habits for :8100 still work.
@app.get("/", include_in_schema=False)
async def root():
    """Redirect to launcher UI."""
    return RedirectResponse(url="http://localhost:3100")


@app.get("/api", include_in_schema=False)
async def api_root():
    """API info."""
    return {
        "name": "PixSim7 Launcher API",
        "version": __version__,
        "docs": "/docs",
        "health": "/health",
        "websocket": "/events/ws"
    }


if __name__ == "__main__":
    import uvicorn

    _logger.info("starting", api="http://localhost:8100", docs="/docs", ws="/events/ws")

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8100,
        log_level="warning",  # structlog handles our logging; suppress uvicorn's default
    )
