"""
Settings Routes - Endpoints for launcher settings contract.
"""

from fastapi import APIRouter, Body

from launcher.core.launcher_settings import load_launcher_settings, update_launcher_settings

from ..models import LauncherSettingsResponse, LauncherSettingsUpdateRequest


router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=LauncherSettingsResponse)
async def get_settings():
    """Get launcher settings contract."""
    settings = load_launcher_settings()
    return LauncherSettingsResponse.from_settings(settings)


@router.put("", response_model=LauncherSettingsResponse)
async def update_settings(
    request: LauncherSettingsUpdateRequest = Body(...)
):
    """Update launcher settings contract."""
    payload = request.model_dump(exclude_none=True) if hasattr(request, "model_dump") else request.dict(exclude_none=True)
    settings = update_launcher_settings(payload)
    return LauncherSettingsResponse.from_settings(settings)
