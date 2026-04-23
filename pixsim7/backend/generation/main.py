"""
Generation API - Lightweight microservice for AI generation.

Bundles: generations, prompts, providers, analytics, auth, accounts, automation.

Runs standalone. Its lifespan runs only the startup steps that the included
routers actually need (DB init + content seed, providers, optional Redis +
analyzer definitions). The heavy main-api setups are deliberately skipped:
plugin discovery, ECS, stat/composition/link/behavior systems, authoring
workflow / meta-contract plugin hooks, AI-model registry, event handlers,
middleware lifecycle manager.

Trade-off: no in-memory analyzer plugins (only DB-backed analyzer definitions),
no authoring-workflow or meta-contract registries. Endpoints that depend on
those return degraded (empty registry) results. Run main-api alongside if you
need full plugin-based behavior.
"""
from contextlib import asynccontextmanager
import os
import sys
from pathlib import Path

# __file__ = .../pixsim7/pixsim7/backend/generation/main.py → project root is 4 levels up
ROOT = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(ROOT))

# Load .env before any setting reads
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.infrastructure.database.session import sync_engine

# Structured logging (same pipeline as main-api)
from pixsim_logging import configure_logging, configure_stdlib_root_logger
logger = configure_logging("generation-api")
configure_stdlib_root_logger()

# Route modules re-used from main-api
from pixsim7.backend.main.api.v1.generations import router as generations_router
from pixsim7.backend.main.api.v1.prompts import (
    operations_router,
    analytics_router,
    variants_router,
    families_router,
)
from pixsim7.backend.main.api.v1.auth import router as auth_router
from pixsim7.backend.main.api.v1.users import router as users_router
from pixsim7.backend.main.api.v1.accounts import router as accounts_router
from pixsim7.backend.main.api.v1.providers import router as providers_router
from pixsim7.backend.main.api.v1.automation import router as automation_router

# Standalone middleware (no dependency on main-api's middleware manager)
from pixsim7.backend.main.middleware.request_id.manifest import RequestIdMiddleware
from pixsim7.backend.main.middleware.request_logging.manifest import RequestLoggingMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Standalone lifespan covering the routes this app exposes.

    Required: setup_database_and_seed (tables + seeded tags/presets), setup_providers.
    Recommended: setup_redis (ARQ + caching; degrades if unavailable),
    setup_analyzer_definitions (DB-stored analyzers — lightweight alternative to the
    plugin-based `setup_analyzer_plugins`, which only registers listeners that fire
    during `setup_plugins`, and we deliberately skip full plugin discovery).
    """
    from pixsim7.backend.main.startup import (
        setup_database_and_seed,
        setup_providers,
        setup_redis,
        setup_analyzer_definitions,
    )

    logger.info("generation_api_startup_begin")
    try:
        await setup_database_and_seed()
        setup_providers()

        # Bind capability implementations (analyzer_registry, etc.).
        from pixsim7.backend.main.infrastructure.plugins.capabilities.locator import (
            bind_default_capabilities,
        )
        bind_default_capabilities()

        # Optional: Redis (arq + caching). Degraded mode if unavailable.
        try:
            await setup_redis()
        except Exception:
            logger.warning("redis_unavailable_degraded_mode", exc_info=True)

        # Optional: DB-backed analyzer definitions (prompt operations router).
        try:
            await setup_analyzer_definitions()
        except Exception:
            logger.warning("analyzer_definitions_load_failed", exc_info=True)

        logger.info(
            "generation_api_ready",
            port=int(os.getenv("GENERATION_API_PORT", 8001)),
        )
    except Exception:
        logger.exception("generation_api_startup_failed")
        raise
    yield
    logger.info("generation_api_shutdown")

app = FastAPI(
    title="PixSim7 Generation API",
    description=(
        "Lightweight FastAPI bundle over the main backend's generation, prompt, "
        "provider, auth, account, and automation routers. Boots without the "
        "main-api's plugin discovery and content seeding — see module docstring "
        "for known coupling."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Middleware (added in reverse-execution order — last added runs first)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===== SERVICE INFO ENDPOINT (for launcher discovery) =====

@app.get("/dev/info")
async def service_info():
    """
    Service metadata for multi-service discovery.

    This endpoint allows the launcher to discover this service's capabilities
    and integrate it into the architecture panel.
    """
    port = int(os.getenv("GENERATION_API_PORT", settings.port if hasattr(settings, 'port') else 8001))

    return {
        "service_id": "generation-api",
        "name": "PixSim7 Generation API",
        "version": "1.0.0",
        "type": "backend",
        "port": port,

        # Service endpoints
        "endpoints": {
            "health": "/health",
            "docs": "/docs",
            "redoc": "/redoc",
            "openapi": "/openapi.json",
            "architecture": "/dev/architecture/map",
            "info": "/dev/info",
        },

        # What this service provides
        "provides": [
            "generations",     # Image/asset generation
            "prompts",         # Prompt management
            "providers",       # AI provider config
            "analytics",       # Generation analytics
            "auth",            # Authentication (for chrome extension)
            "accounts",        # Account management (for chrome extension)
            "automation",      # Device management, execution loops, presets
        ],

        # Dependencies
        "dependencies": [
            "db",              # PostgreSQL database
            "redis",           # Redis cache (optional)
        ],

        # Service categorization
        "tags": ["api", "generation", "ai", "microservice"],

        # Environment info
        "environment": {
            "debug": settings.debug if hasattr(settings, 'debug') else False,
            "host": "0.0.0.0",
            "port": port,
        },

        # Architecture metadata
        "architecture": {
            "pattern": "microservice",
            "original_location": "pixsim7.backend.main (split out)",
            "layers": ["routes", "services", "domain", "orm"],
            "features": [
                "generation-pipeline",
                "prompt-versioning",
                "social-context",
                "rate-limiting",
            ],
        },
    }


# ===== HEALTH CHECK =====

@app.get("/health")
async def health():
    """
    Health check endpoint.

    Verifies database connectivity and service availability.
    """
    health_status = {
        "status": "healthy",
        "service": "generation-api",
        "version": "1.0.0",
    }

    # Check database connection
    try:
        from sqlalchemy import text
        with sync_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        health_status["database"] = "connected"
    except Exception as e:
        health_status["status"] = "unhealthy"
        health_status["database"] = "disconnected"
        health_status["error"] = str(e)
        return JSONResponse(content=health_status, status_code=503)

    return health_status


# ===== ARCHITECTURE INTROSPECTION =====

@app.get("/dev/architecture/map")
async def architecture_map():
    """
    Backend architecture introspection for Generation API.

    Returns metadata about routes, services, and capabilities for
    display in the launcher's Architecture panel.
    """
    # Discover routes from this app
    routes_data = []
    for route in app.routes:
        if hasattr(route, "methods") and hasattr(route, "path"):
            # Skip internal routes
            if route.path.startswith("/openapi") or route.path == "/":
                continue

            routes_data.append({
                "path": route.path,
                "methods": list(route.methods) if hasattr(route, "methods") else [],
                "name": route.name if hasattr(route, "name") else "",
                "tags": list(getattr(route, "tags", [])),
            })

    # Service composition (generation API has its own services)
    services_data = {
        "generation_service": {
            "description": "Core generation pipeline",
            "sub_services": [
                "creation_service",
                "lifecycle_service",
                "query_service",
                "retry_service",
            ],
            "location": "services/generation/",
            "lines": 1500,
        },
        "prompt_service": {
            "description": "Prompt versioning and management",
            "sub_services": [
                "operations_service",
                "analytics_service",
                "variant_service",
                "family_service",
                "version_service",
            ],
            "location": "services/prompts/",
            "lines": 800,
        },
    }

    # Calculate metrics
    metrics = {
        "total_routes": len(routes_data),
        "total_services": len(services_data),
        "total_sub_services": sum(len(s.get("sub_services", [])) for s in services_data.values()),
        "avg_sub_service_lines": 200,  # Approximate
    }

    return {
        "version": "1.0",
        "service_id": "generation-api",
        "routes": routes_data,
        "services": services_data,
        "capabilities": [
            "Image Generation",
            "Prompt Versioning",
            "Analytics",
            "Provider Management",
        ],
        "metrics": metrics,
    }


# ===== INCLUDE ROUTERS =====

# Generations (main generation endpoints)
app.include_router(
    generations_router,
    prefix="",
    tags=["generations"]
)

# Prompts (prompt management)
app.include_router(
    operations_router,
    prefix="/prompts",
    tags=["prompts"]
)

app.include_router(
    analytics_router,
    prefix="/prompts",
    tags=["prompts", "analytics"]
)

app.include_router(
    variants_router,
    prefix="/prompts",
    tags=["prompts", "variants"]
)

app.include_router(
    families_router,
    prefix="/prompts",
    tags=["prompts", "families"]
)

# Chrome Extension Support (lightweight routes)
app.include_router(
    auth_router,
    prefix="/api/v1",
    tags=["auth"]
)

app.include_router(
    users_router,
    prefix="/api/v1",
    tags=["users"]
)

app.include_router(
    accounts_router,
    prefix="/api/v1",
    tags=["accounts"]
)

app.include_router(
    providers_router,
    prefix="/api/v1",
    tags=["providers"]
)

# Automation (device management, execution loops, presets)
app.include_router(
    automation_router,
    prefix="/api/v1",
    tags=["automation"]
)


# ===== ROOT ENDPOINT =====

@app.get("/", include_in_schema=False)
async def root():
    """Root endpoint redirects to docs."""
    return {
        "service": "generation-api",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "info": "/dev/info",
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("GENERATION_API_PORT", 8001))

    print("=" * 70)
    print("Starting Generation API")
    print("=" * 70)
    print()
    print(f"API: http://localhost:{port}")
    print(f"Docs: http://localhost:{port}/docs")
    print(f"Health: http://localhost:{port}/health")
    print()
    print("=" * 70)
    print()

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )
