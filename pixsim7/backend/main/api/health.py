"""
Health and readiness endpoints

Provides liveness, health, and readiness probes for orchestration platforms.

Endpoints:
- GET / - Liveness probe (lightweight, always 200)
- GET /health - Health check (always 200, detailed status)
- GET /ready - Readiness probe (503 if DB down, 200 otherwise)

See docs/BACKEND_STARTUP.md for semantics and usage in k8s/ECS.
"""
from fastapi import APIRouter, Response, Request, status as http_status
from pydantic import BaseModel
from typing import Literal

from pixsim7.backend.main.shared.config import settings

router = APIRouter(tags=["Health"])


class HealthResponse(BaseModel):
    """Health check response model."""
    status: Literal["healthy", "degraded"]
    database: str
    redis: str
    providers: list[str]


class ReadinessResponse(BaseModel):
    """Readiness check response model."""
    status: Literal["ready", "degraded", "unavailable"]
    database: str
    redis: str
    plugins_loaded: bool


@router.get("/")
async def liveness():
    """
    Liveness probe - is the process running?

    This is a lightweight endpoint that always returns 200 OK
    unless the process is completely wedged.

    Use this for:
    - Kubernetes livenessProbe
    - ECS healthCheck (if you don't need dependency checks)
    - Load balancer health checks (simple monitoring)

    Returns:
        dict: Basic app info with status "running"
    """
    return {
        "name": "PixSim7",
        "version": settings.api_version,
        "status": "running"
    }


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check - detailed status information.

    Always returns HTTP 200, but the `status` field indicates:
    - "healthy": All systems operational
    - "degraded": Some optional systems (Redis) unavailable

    This is useful for monitoring dashboards that want detailed
    status without treating degraded mode as a failure.

    Returns:
        HealthResponse: Detailed system status
    """
    from pixsim7.backend.main.infrastructure.redis import check_redis_connection
    from pixsim7.backend.main.services.provider import registry
    from pixsim7.backend.main.infrastructure.database.session import get_async_session
    from sqlalchemy import text

    # Check Redis
    redis_status = "connected" if await check_redis_connection() else "disconnected"

    # Check database
    db_status = "connected"
    try:
        async with get_async_session() as db:
            await db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"error: {e.__class__.__name__}"

    # Overall status
    overall_status = "healthy" if db_status == "connected" else "degraded"

    return HealthResponse(
        status=overall_status,
        database=db_status,
        redis=redis_status,
        providers=registry.list_provider_ids()
    )


@router.get("/ready", response_model=ReadinessResponse)
async def readiness_check(response: Response, request: Request):
    """
    Readiness probe - can this instance handle traffic?

    Returns different HTTP status codes based on system state:
    - HTTP 200: Ready to serve traffic
    - HTTP 503: Not ready (database unavailable)

    Database is considered required - if unavailable, returns 503.
    Redis is optional - if unavailable, returns 200 but status="degraded".

    Use this for:
    - Kubernetes readinessProbe
    - ECS target health checks
    - Load balancer traffic routing

    Status meanings:
    - "ready": All required systems operational
    - "degraded": Redis unavailable, but can still serve traffic
    - "unavailable": Database down, cannot serve traffic (503)

    Returns:
        ReadinessResponse: Readiness status with HTTP 200/503
    """
    from pixsim7.backend.main.infrastructure.redis import check_redis_connection
    from pixsim7.backend.main.infrastructure.database.session import get_async_session
    from sqlalchemy import text

    # Check Redis (optional)
    redis_available = await check_redis_connection()
    redis_status = "connected" if redis_available else "disconnected"

    # Check database (required)
    db_connected = True
    db_status = "connected"
    try:
        async with get_async_session() as db:
            await db.execute(text("SELECT 1"))
    except Exception as e:
        db_connected = False
        db_status = f"error: {e.__class__.__name__}"

    # Check plugin state (optional but affects degraded/ready)
    plugins_loaded = True
    plugins_ok = True
    try:
        plugin_manager = getattr(request.app.state, "plugin_manager", None)
        routes_manager = getattr(request.app.state, "routes_manager", None)

        if plugin_manager is None or routes_manager is None:
            plugins_loaded = False
            plugins_ok = False
        else:
            # Consider plugins loaded if both managers have at least one plugin
            plugins_loaded = bool(plugin_manager.list_plugins()) and bool(routes_manager.list_plugins())

            def _has_failures(manager) -> bool:
                if hasattr(manager, "has_failures"):
                    return manager.has_failures()
                return bool(getattr(manager, "failed_plugins", {}))

            plugins_ok = not _has_failures(plugin_manager) and not _has_failures(routes_manager)
    except Exception:
        plugins_loaded = False
        plugins_ok = False

    # Determine overall readiness
    if not db_connected:
        # Database is required - return 503
        overall_status = "unavailable"
        response.status_code = http_status.HTTP_503_SERVICE_UNAVAILABLE
    elif not redis_available or not plugins_ok:
        # Redis or plugins degraded but still able to serve traffic
        overall_status = "degraded"
        response.status_code = http_status.HTTP_200_OK
    else:
        # Everything is good
        overall_status = "ready"
        response.status_code = http_status.HTTP_200_OK

    return ReadinessResponse(
        status=overall_status,
        database=db_status,
        redis=redis_status,
        plugins_loaded=plugins_loaded,
    )
