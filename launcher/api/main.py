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
import sys
from pathlib import Path

# Add project root to path
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from launcher.core import create_container, __version__
from launcher.core.launcher_settings import load_launcher_settings, apply_launcher_settings_to_env

from .routes import (
    services_router,
    logs_router,
    events_router,
    health_router,
    buildables_router,
    settings_router,
    codegen_router,
)
from .dependencies import set_container


# Global container
_container = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup/shutdown.

    Initializes and cleans up the launcher container.
    """
    global _container

    # Startup
    print("=" * 70)
    print("PixSim7 Launcher API")
    print("=" * 70)
    print()

    # Load service definitions from manifests
    try:
        apply_launcher_settings_to_env(load_launcher_settings())
    except Exception:
        pass

    from launcher.gui.services import build_services_from_manifests

    services_list = build_services_from_manifests()
    print(f"Loaded {len(services_list)} service definitions")

    # Create container with config
    _container = create_container(
        services_list,
        root_dir=ROOT,
        config_overrides={
            'health': {
                'base_interval': 2.0,
                'adaptive_enabled': True
            }
        }
    )

    # Set container for dependency injection
    set_container(_container)

    # Start managers
    _container.start_all()
    print("✓ Managers started")
    print()

    yield

    # Shutdown
    print()
    print("Shutting down...")
    _container.stop_all()
    print("✓ Managers stopped")
    print("Goodbye!")


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


@app.get("/", include_in_schema=False)
async def root():
    """Redirect root to docs."""
    return RedirectResponse(url="/docs")


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

    print("=" * 70)
    print("Starting PixSim7 Launcher API")
    print("=" * 70)
    print()
    print("API will be available at:")
    print("  http://localhost:8100")
    print()
    print("Documentation:")
    print("  http://localhost:8100/docs")
    print()
    print("WebSocket:")
    print("  ws://localhost:8100/events/ws")
    print()
    print("=" * 70)
    print()

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8100,
        log_level="info"
    )
