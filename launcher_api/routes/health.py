"""
Health Routes - API health and statistics endpoints.

Provides endpoints for checking API health and getting system statistics.
"""

from fastapi import APIRouter, Depends
import time

from pixsim7.launcher_core import ProcessManager, HealthManager, LogManager, EventBus
from pixsim7.launcher_core.types import ServiceStatus, HealthStatus

from ..models import APIHealthResponse, StatisticsResponse
from ..dependencies import (
    get_process_manager,
    get_health_manager,
    get_log_manager,
    get_event_bus
)


router = APIRouter(tags=["health"])


# Track API start time for uptime
_api_start_time = time.time()


@router.get("/health", response_model=APIHealthResponse)
async def api_health(
    process_mgr: ProcessManager = Depends(get_process_manager),
    health_mgr: HealthManager = Depends(get_health_manager),
    log_mgr: LogManager = Depends(get_log_manager),
    event_bus: EventBus = Depends(get_event_bus)
):
    """
    Check API health status.

    Returns:
        API health including manager status and event bus stats
    """
    from pixsim7.launcher_core import __version__

    # Get manager statuses
    managers = {
        "process_manager": process_mgr is not None,
        "health_manager": health_mgr.is_running() if health_mgr else False,
        "log_manager": log_mgr.is_monitoring() if log_mgr else False
    }

    # Get event bus stats
    bus_stats = event_bus.get_stats()

    return APIHealthResponse(
        status="healthy" if all(managers.values()) else "degraded",
        version=__version__,
        managers=managers,
        event_bus=bus_stats
    )


@router.get("/stats", response_model=StatisticsResponse)
async def get_statistics(
    process_mgr: ProcessManager = Depends(get_process_manager)
):
    """
    Get system statistics.

    Returns:
        Statistics about services and API uptime
    """
    states = process_mgr.get_all_states()

    # Count services by status
    total = len(states)
    running = sum(1 for s in states.values() if s.status in (ServiceStatus.RUNNING, ServiceStatus.STARTING))
    healthy = sum(1 for s in states.values() if s.health == HealthStatus.HEALTHY)
    unhealthy = sum(1 for s in states.values() if s.health == HealthStatus.UNHEALTHY)

    # Calculate uptime
    uptime = time.time() - _api_start_time

    return StatisticsResponse(
        services_total=total,
        services_running=running,
        services_healthy=healthy,
        services_unhealthy=unhealthy,
        uptime_seconds=uptime
    )
