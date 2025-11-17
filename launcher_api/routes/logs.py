"""
Log Routes - Endpoints for managing service logs.

Provides REST API for fetching and clearing service logs.
"""

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from typing import Optional

from pixsim7.launcher_core import LogManager

from ..models import LogsResponse, LogLevelEnum
from ..dependencies import get_log_manager


router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("/{service_key}", response_model=LogsResponse)
async def get_service_logs(
    service_key: str = Path(..., description="Service key"),
    tail: int = Query(100, ge=1, le=10000, description="Number of lines to return"),
    filter_text: Optional[str] = Query(None, description="Text to filter logs (case-insensitive)"),
    filter_level: Optional[LogLevelEnum] = Query(None, description="Log level to filter"),
    log_mgr: LogManager = Depends(get_log_manager)
):
    """
    Get logs for a service.

    Args:
        service_key: Service key
        tail: Number of recent lines to return (1-10000)
        filter_text: Optional text filter
        filter_level: Optional log level filter

    Returns:
        Service logs

    Raises:
        404: Service not found
    """
    # Get logs
    logs = log_mgr.get_logs(
        service_key,
        filter_text=filter_text,
        filter_level=filter_level.value if filter_level else None,
        max_lines=tail
    )

    # Check if service exists (logs might be empty for valid service)
    state = log_mgr.states.get(service_key)
    if state is None:
        raise HTTPException(
            status_code=404,
            detail=f"Service '{service_key}' not found"
        )

    return LogsResponse(
        service_key=service_key,
        lines=logs,
        total_lines=len(logs),
        filtered=bool(filter_text or filter_level)
    )


@router.delete("/{service_key}", response_model=dict)
async def clear_service_logs(
    service_key: str = Path(..., description="Service key"),
    log_mgr: LogManager = Depends(get_log_manager)
):
    """
    Clear logs for a service.

    Args:
        service_key: Service key

    Returns:
        Success message

    Raises:
        404: Service not found
    """
    # Check service exists
    state = log_mgr.states.get(service_key)
    if state is None:
        raise HTTPException(
            status_code=404,
            detail=f"Service '{service_key}' not found"
        )

    # Clear logs
    log_mgr.clear_logs(service_key)

    return {
        "success": True,
        "message": f"Logs cleared for service '{service_key}'"
    }


@router.delete("", response_model=dict)
async def clear_all_logs(
    log_mgr: LogManager = Depends(get_log_manager)
):
    """
    Clear logs for all services.

    Returns:
        Success message
    """
    log_mgr.clear_all_logs()

    return {
        "success": True,
        "message": "Logs cleared for all services"
    }


@router.get("/{service_key}/file", response_model=dict)
async def get_log_file_path(
    service_key: str = Path(..., description="Service key"),
    log_mgr: LogManager = Depends(get_log_manager)
):
    """
    Get the file path for a service's log file.

    Args:
        service_key: Service key

    Returns:
        Log file path

    Raises:
        404: Service not found
    """
    # Check service exists
    state = log_mgr.states.get(service_key)
    if state is None:
        raise HTTPException(
            status_code=404,
            detail=f"Service '{service_key}' not found"
        )

    file_path = log_mgr.get_log_file_path(service_key)

    return {
        "service_key": service_key,
        "log_file": str(file_path) if file_path else None
    }
