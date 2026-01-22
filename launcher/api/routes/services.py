"""
Service Routes - Endpoints for managing services.

Provides REST API for starting, stopping, and querying services.
"""

from fastapi import APIRouter, Depends, HTTPException, Path, Body
from typing import List

from launcher.core import ProcessManager, HealthManager
from launcher.core.shared_settings import load_shared_settings
from launcher.core.types import ServiceStatus, HealthStatus

from ..models import (
    ServiceStateResponse,
    ServiceDefinitionResponse,
    ServiceActionRequest,
    ServiceActionResponse,
    ServicesListResponse,
    ServiceStatusEnum,
    HealthStatusEnum
)
from ..dependencies import get_process_manager, get_health_manager


router = APIRouter(prefix="/services", tags=["services"])


def map_service_status(status: ServiceStatus) -> ServiceStatusEnum:
    """Map core ServiceStatus to API enum."""
    return ServiceStatusEnum(status.value)


def map_health_status(status: HealthStatus) -> HealthStatusEnum:
    """Map core HealthStatus to API enum."""
    return HealthStatusEnum(status.value)


@router.get("", response_model=ServicesListResponse)
async def list_services(
    process_mgr: ProcessManager = Depends(get_process_manager)
):
    """
    List all services and their current state.

    Returns:
        List of all services with status, health, PID, etc.
    """
    states = process_mgr.get_all_states()

    services = []
    for key, state in states.items():
        services.append(ServiceStateResponse(
            key=key,
            title=state.definition.title,
            status=map_service_status(state.status),
            health=map_health_status(state.health),
            pid=state.pid or state.detected_pid,
            last_error=state.last_error,
            tool_available=state.tool_available,
            tool_check_message=state.tool_check_message
        ))

    return ServicesListResponse(
        services=services,
        total=len(services)
    )


@router.get("/{service_key}", response_model=ServiceStateResponse)
async def get_service_status(
    service_key: str = Path(..., description="Service key"),
    process_mgr: ProcessManager = Depends(get_process_manager)
):
    """
    Get status of a specific service.

    Args:
        service_key: Service key (e.g., "backend", "frontend")

    Returns:
        Service state including status, health, PID, etc.

    Raises:
        404: Service not found
    """
    state = process_mgr.get_state(service_key)

    if not state:
        raise HTTPException(
            status_code=404,
            detail=f"Service '{service_key}' not found"
        )

    return ServiceStateResponse(
        key=service_key,
        title=state.definition.title,
        status=map_service_status(state.status),
        health=map_health_status(state.health),
        pid=state.pid or state.detected_pid,
        last_error=state.last_error,
        tool_available=state.tool_available,
        tool_check_message=state.tool_check_message
    )


@router.get("/{service_key}/definition", response_model=ServiceDefinitionResponse)
async def get_service_definition(
    service_key: str = Path(..., description="Service key"),
    process_mgr: ProcessManager = Depends(get_process_manager)
):
    """
    Get service definition (program, args, etc.).

    Args:
        service_key: Service key

    Returns:
        Service definition details

    Raises:
        404: Service not found
    """
    state = process_mgr.get_state(service_key)

    if not state:
        raise HTTPException(
            status_code=404,
            detail=f"Service '{service_key}' not found"
        )

    defn = state.definition

    return ServiceDefinitionResponse(
        key=defn.key,
        title=defn.title,
        program=defn.program,
        args=defn.args,
        cwd=defn.cwd,
        url=defn.url,
        health_url=defn.health_url,
        required_tool=defn.required_tool
    )


@router.post("/{service_key}/start", response_model=ServiceActionResponse)
async def start_service(
    service_key: str = Path(..., description="Service key"),
    process_mgr: ProcessManager = Depends(get_process_manager)
):
    """
    Start a service.

    Args:
        service_key: Service key to start

    Returns:
        Action result

    Raises:
        404: Service not found
        500: Failed to start
    """
    # Check service exists
    state = process_mgr.get_state(service_key)
    if not state:
        raise HTTPException(
            status_code=404,
            detail=f"Service '{service_key}' not found"
        )

    # Check if already running
    if process_mgr.is_running(service_key):
        return ServiceActionResponse(
            success=True,
            message=f"Service '{service_key}' is already running",
            service_key=service_key
        )

    # Start the service
    success = process_mgr.start(service_key)

    if success:
        return ServiceActionResponse(
            success=True,
            message=f"Service '{service_key}' started successfully",
            service_key=service_key
        )
    else:
        # Get error from state
        state = process_mgr.get_state(service_key)
        raise HTTPException(
            status_code=500,
            detail=state.last_error if state.last_error else "Failed to start service"
        )


@router.post("/{service_key}/stop", response_model=ServiceActionResponse)
async def stop_service(
    service_key: str = Path(..., description="Service key"),
    request: ServiceActionRequest = Body(default=ServiceActionRequest()),
    process_mgr: ProcessManager = Depends(get_process_manager)
):
    """
    Stop a service.

    Args:
        service_key: Service key to stop
        request: Stop options (graceful shutdown)

    Returns:
        Action result

    Raises:
        404: Service not found
    """
    # Check service exists
    state = process_mgr.get_state(service_key)
    if not state:
        raise HTTPException(
            status_code=404,
            detail=f"Service '{service_key}' not found"
        )

    # Check if already stopped
    if not process_mgr.is_running(service_key):
        return ServiceActionResponse(
            success=True,
            message=f"Service '{service_key}' is already stopped",
            service_key=service_key
        )

    # Stop the service
    success = process_mgr.stop(service_key, graceful=request.graceful)

    if success:
        return ServiceActionResponse(
            success=True,
            message=f"Service '{service_key}' stopped successfully",
            service_key=service_key
        )
    else:
        # Get error from state
        state = process_mgr.get_state(service_key)
        raise HTTPException(
            status_code=500,
            detail=state.last_error if state.last_error else "Failed to stop service"
        )


@router.post("/{service_key}/restart", response_model=ServiceActionResponse)
async def restart_service(
    service_key: str = Path(..., description="Service key"),
    process_mgr: ProcessManager = Depends(get_process_manager)
):
    """
    Restart a service.

    Args:
        service_key: Service key to restart

    Returns:
        Action result

    Raises:
        404: Service not found
        500: Failed to restart
    """
    # Check service exists
    state = process_mgr.get_state(service_key)
    if not state:
        raise HTTPException(
            status_code=404,
            detail=f"Service '{service_key}' not found"
        )

    # Restart the service
    success = process_mgr.restart(service_key)

    if success:
        return ServiceActionResponse(
            success=True,
            message=f"Service '{service_key}' restarted successfully",
            service_key=service_key
        )
    else:
        # Get error from state
        state = process_mgr.get_state(service_key)
        raise HTTPException(
            status_code=500,
            detail=state.last_error if state.last_error else "Failed to restart service"
        )


@router.post("/start-all", response_model=ServiceActionResponse)
async def start_all_services(
    process_mgr: ProcessManager = Depends(get_process_manager)
):
    """
    Start all services.

    Returns:
        Action result with count of started services
    """
    states = process_mgr.get_all_states()
    try:
        shared = load_shared_settings()
        skip_db = shared.use_local_datastores
    except Exception:
        skip_db = False
    started = 0
    failed = []

    for service_key in states.keys():
        if skip_db and service_key == "db":
            continue
        if not process_mgr.is_running(service_key):
            success = process_mgr.start(service_key)
            if success:
                started += 1
            else:
                failed.append(service_key)

    if failed:
        return ServiceActionResponse(
            success=False,
            message=f"Started {started} services, failed: {', '.join(failed)}",
            service_key="all"
        )
    else:
        return ServiceActionResponse(
            success=True,
            message=f"Started {started} services successfully",
            service_key="all"
        )


@router.post("/stop-all", response_model=ServiceActionResponse)
async def stop_all_services(
    request: ServiceActionRequest = Body(default=ServiceActionRequest()),
    process_mgr: ProcessManager = Depends(get_process_manager)
):
    """
    Stop all running services.

    Args:
        request: Stop options (graceful shutdown)

    Returns:
        Action result with count of stopped services
    """
    states = process_mgr.get_all_states()
    stopped = 0

    for service_key in states.keys():
        if process_mgr.is_running(service_key):
            process_mgr.stop(service_key, graceful=request.graceful)
            stopped += 1

    return ServiceActionResponse(
        success=True,
        message=f"Stopped {stopped} services",
        service_key="all"
    )
