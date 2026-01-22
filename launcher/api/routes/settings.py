"""
Settings Routes - Endpoints for shared launcher settings.
"""

from fastapi import APIRouter, Body

from launcher.core.shared_settings import load_shared_settings, update_shared_settings

from ..models import SharedSettingsResponse, SharedSettingsUpdateRequest


router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=SharedSettingsResponse)
async def get_settings():
    """Get shared launcher settings."""
    settings = load_shared_settings()
    return SharedSettingsResponse(
        sql_logging_enabled=settings.sql_logging_enabled,
        worker_debug_flags=settings.worker_debug_flags,
        backend_log_level=settings.backend_log_level,
        use_local_datastores=settings.use_local_datastores,
    )


@router.put("", response_model=SharedSettingsResponse)
async def update_settings(
    request: SharedSettingsUpdateRequest = Body(...)
):
    """Update shared launcher settings."""
    payload = request.model_dump() if hasattr(request, "model_dump") else request.dict()
    updates = {key: value for key, value in payload.items() if value is not None}
    settings = update_shared_settings(updates)
    return SharedSettingsResponse(
        sql_logging_enabled=settings.sql_logging_enabled,
        worker_debug_flags=settings.worker_debug_flags,
        backend_log_level=settings.backend_log_level,
        use_local_datastores=settings.use_local_datastores,
    )
