"""
Settings & Profile Routes.

Configuration is managed via per-service settings:
  GET/PATCH /services/{key}/settings (in services.py)

Profiles provide named presets:
  GET /settings/profiles
  GET/PUT /settings/profiles/active
"""

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter(prefix="/settings", tags=["settings"])


# ── Models ──

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


# ── Profile endpoints ──

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
        raise HTTPException(status_code=404, detail=f"Profile '{body.name}' not found")

    set_active_profile(body.name)
    return ActiveProfileResponse(active=body.name)
