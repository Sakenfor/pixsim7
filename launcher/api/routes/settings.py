"""
Settings & Profile Routes.

The old monolithic LauncherSettings endpoints are replaced by:
- Per-service settings: GET/PATCH /services/{key}/settings (in services.py)
- Profiles: GET /profiles, GET/PUT /profiles/active (here)

Legacy GET/PUT /settings is kept temporarily for backward compatibility
but delegates to the new system.
"""

from fastapi import APIRouter, Body
from pydantic import BaseModel
from typing import Dict, List, Any, Optional

router = APIRouter(prefix="/settings", tags=["settings"])


# ── Profile endpoints ──

class ProfileSummary(BaseModel):
    name: str
    label: str


class ProfileListResponse(BaseModel):
    profiles: List[ProfileSummary]
    active: str


class ActiveProfileRequest(BaseModel):
    name: str


class ActiveProfileResponse(BaseModel):
    active: str


@router.get("/profiles", response_model=ProfileListResponse)
async def list_profiles():
    """List available profiles and which is active."""
    from launcher.core.service_settings import load_profiles, get_active_profile_name

    profiles = load_profiles()
    active = get_active_profile_name()
    items = [
        ProfileSummary(name=k, label=v.get("label", k) if isinstance(v, dict) else k)
        for k, v in profiles.items()
    ]
    return ProfileListResponse(profiles=items, active=active)


@router.get("/profiles/active", response_model=ActiveProfileResponse)
async def get_active_profile():
    """Get the active profile name."""
    from launcher.core.service_settings import get_active_profile_name
    return ActiveProfileResponse(active=get_active_profile_name())


@router.put("/profiles/active", response_model=ActiveProfileResponse)
async def set_active_profile_endpoint(body: ActiveProfileRequest = Body(...)):
    """Set the active profile. Changes take effect on next service restart."""
    from launcher.core.service_settings import set_active_profile, load_profiles

    profiles = load_profiles()
    if body.name not in profiles:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Profile '{body.name}' not found")

    set_active_profile(body.name)
    return ActiveProfileResponse(active=body.name)


# ── Legacy endpoints (backward compat — will be removed) ──

@router.get("")
async def get_settings():
    """Legacy: return launcher settings. Prefer per-service settings API."""
    try:
        from launcher.core.launcher_settings import load_launcher_settings
        from launcher.api.models import LauncherSettingsResponse
        settings = load_launcher_settings()
        return LauncherSettingsResponse.from_settings(settings)
    except ImportError:
        return {"message": "LauncherSettings removed. Use per-service settings and /settings/profiles."}


@router.put("")
async def update_settings(request: Dict[str, Any] = Body(...)):
    """Legacy: update launcher settings. Prefer per-service settings API."""
    try:
        from launcher.core.launcher_settings import load_launcher_settings, update_launcher_settings
        from launcher.api.models import LauncherSettingsResponse
        settings = update_launcher_settings(request)
        return LauncherSettingsResponse.from_settings(settings)
    except ImportError:
        return {"message": "LauncherSettings removed. Use per-service settings and /settings/profiles."}
