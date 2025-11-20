"""
Generation API - Separate microservice for AI generation

Provides:
- Image/asset generation endpoints
- Prompt management and versioning
- Provider configuration

This service can be scaled independently from the main backend.
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
import sys
from pathlib import Path

# Add project root to path for imports
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

# Import shared backend infrastructure
from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.shared.database import engine, Base
from pixsim7.backend.main.infrastructure.events.bus import get_event_bus

# Import routes from main backend (re-use existing code)
from pixsim7.backend.main.api.v1.generations import router as generations_router
from pixsim7.backend.main.api.v1.prompts import (
    operations_router,
    analytics_router,
    variants_router,
    families_router,
)

# Lightweight routes for chrome extension support
from pixsim7.backend.main.api.v1.auth import router as auth_router
from pixsim7.backend.main.api.v1.users import router as users_router
from pixsim7.backend.main.api.v1.accounts import router as accounts_router
from pixsim7.backend.main.api.v1.providers import router as providers_router

# Import for architecture introspection
from pixsim7.backend.main.api.v1.dev_architecture import (
    discover_routes,
    discover_services,
    calculate_metrics,
)

app = FastAPI(
    title="PixSim7 Generation API",
    description="""
    AI Generation and Prompt Management Microservice

    ## Features

    - **Generation**: Create and manage image/asset generations
    - **Prompts**: Prompt versioning, variants, and families
    - **Providers**: AI provider configuration
    - **Analytics**: Generation metrics and statistics
    - **Chrome Extension**: Auth, accounts, and provider management

    ## Architecture

    This is a lightweight API for development, containing generation capabilities
    and chrome extension support, while excluding heavy game engine features.

    Perfect for development when you only need generation + chrome extension.
    """,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
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
            "original_location": "pixsim7_backend (split out)",
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
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        health_status["database"] = "connected"
    except Exception as e:
        health_status["status"] = "unhealthy"
        health_status["database"] = "disconnected"
        health_status["error"] = str(e)
        return JSONResponse(content=health_status, status_code=503)

    # Check event bus
    try:
        event_bus = get_event_bus()
        health_status["event_bus"] = "available" if event_bus else "unavailable"
    except Exception:
        health_status["event_bus"] = "unavailable"

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


# ===== STARTUP/SHUTDOWN EVENTS =====

@app.on_event("startup")
async def startup():
    """Initialize database tables and resources."""
    try:
        # Tables are already created by main backend
        # Just verify connection
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        # Register providers (needed for chrome extension)
        from pixsim7.backend.main.services.provider import register_default_providers
        register_default_providers()

        print("=" * 70)
        print("Generation API started successfully")
        print(f"Port: {os.getenv('GENERATION_API_PORT', 8001)}")
        print(f"Docs: http://localhost:{os.getenv('GENERATION_API_PORT', 8001)}/docs")
        print(f"Chrome Extension: Supported (auth, accounts, providers)")
        print("=" * 70)
    except Exception as e:
        print(f"Startup error: {e}")
        raise


@app.on_event("shutdown")
async def shutdown():
    """Cleanup on shutdown."""
    print("Generation API shutting down...")


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
