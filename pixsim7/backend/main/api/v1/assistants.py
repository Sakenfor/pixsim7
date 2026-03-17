"""
AI Assistant Profiles API — CRUD for assistant definitions.

Users can create, list, and switch between assistant profiles
that configure persona, model, method, and tool scope.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database
from pixsim7.backend.main.domain import User

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────


class AssistantProfileResponse(BaseModel):
    assistant_id: str
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    model_id: Optional[str] = None
    method: Optional[str] = None
    system_prompt: Optional[str] = None
    audience: str = "user"
    allowed_contracts: List[str] = Field(default_factory=list)
    config: dict = Field(default_factory=dict)
    is_default: bool = False
    is_global: bool = False
    version: int = 1


class AssistantProfileCreateRequest(BaseModel):
    assistant_id: str = Field(..., max_length=100, description="Unique ID (e.g., 'assistant:my-helper')")
    name: str = Field(..., max_length=255)
    description: Optional[str] = None
    icon: Optional[str] = None
    model_id: Optional[str] = None
    method: Optional[str] = None
    system_prompt: Optional[str] = None
    audience: str = Field("user", description="Tool scope: 'user' or 'dev'")
    allowed_contracts: Optional[List[str]] = None
    config: Optional[dict] = None


class AssistantProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    model_id: Optional[str] = None
    method: Optional[str] = None
    system_prompt: Optional[str] = None
    audience: Optional[str] = None
    allowed_contracts: Optional[List[str]] = None
    config: Optional[dict] = None


# ── Endpoints ─────────────────────────────────────────────────────────


def _to_response(p) -> AssistantProfileResponse:
    return AssistantProfileResponse(
        assistant_id=p.assistant_id,
        name=p.name,
        description=p.description,
        icon=p.icon,
        model_id=p.model_id,
        method=p.method,
        system_prompt=p.system_prompt,
        audience=p.audience,
        allowed_contracts=p.allowed_contracts or [],
        config=p.config or {},
        is_default=p.is_default,
        is_global=p.owner_user_id is None,
        version=p.version,
    )


@router.get("", response_model=List[AssistantProfileResponse])
async def list_assistant_profiles(
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
) -> List[AssistantProfileResponse]:
    """List assistant profiles available to the current user (global + own)."""
    from pixsim7.backend.main.services.assistant.assistant_service import list_profiles
    profiles = await list_profiles(db, user_id=user.id)
    return [_to_response(p) for p in profiles]


@router.get("/{assistant_id}", response_model=AssistantProfileResponse)
async def get_assistant_profile(
    assistant_id: str,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
) -> AssistantProfileResponse:
    """Get a specific assistant profile."""
    from pixsim7.backend.main.services.assistant.assistant_service import get_profile
    profile = await get_profile(db, assistant_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Assistant not found: {assistant_id}")
    return _to_response(profile)


@router.post("", response_model=AssistantProfileResponse, status_code=201)
async def create_assistant_profile(
    payload: AssistantProfileCreateRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
) -> AssistantProfileResponse:
    """Create a new assistant profile owned by the current user."""
    from pixsim7.backend.main.services.assistant.assistant_service import create_profile, get_profile

    # Check for duplicate
    existing = await get_profile(db, payload.assistant_id)
    if existing:
        raise HTTPException(status_code=409, detail=f"Assistant ID already exists: {payload.assistant_id}")

    profile = await create_profile(
        db,
        assistant_id=payload.assistant_id,
        name=payload.name,
        owner_user_id=user.id,
        description=payload.description,
        icon=payload.icon,
        model_id=payload.model_id,
        method=payload.method,
        system_prompt=payload.system_prompt,
        audience=payload.audience,
        allowed_contracts=payload.allowed_contracts,
        config=payload.config,
    )
    return _to_response(profile)


@router.patch("/{assistant_id}", response_model=AssistantProfileResponse)
async def update_assistant_profile(
    assistant_id: str,
    payload: AssistantProfileUpdateRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
) -> AssistantProfileResponse:
    """Update an assistant profile. Users can only update their own profiles."""
    from pixsim7.backend.main.services.assistant.assistant_service import get_profile, update_profile

    profile = await get_profile(db, assistant_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Assistant not found: {assistant_id}")

    # Only owner or admin can update
    if profile.owner_user_id is not None and profile.owner_user_id != user.id and not user.is_admin():
        raise HTTPException(status_code=403, detail="Can only update your own profiles")

    updates = {k: v for k, v in payload.dict().items() if v is not None}
    updated = await update_profile(db, assistant_id, updates)
    return _to_response(updated)


@router.delete("/{assistant_id}")
async def delete_assistant_profile(
    assistant_id: str,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
) -> dict:
    """Soft-delete an assistant profile."""
    from pixsim7.backend.main.services.assistant.assistant_service import get_profile, delete_profile

    profile = await get_profile(db, assistant_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Assistant not found: {assistant_id}")

    if profile.owner_user_id is not None and profile.owner_user_id != user.id and not user.is_admin():
        raise HTTPException(status_code=403, detail="Can only delete your own profiles")

    await delete_profile(db, assistant_id)
    return {"ok": True, "assistant_id": assistant_id}


@router.post("/{assistant_id}/set-default")
async def set_default_profile(
    assistant_id: str,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
) -> dict:
    """Set a profile as the user's default assistant."""
    from pixsim7.backend.main.services.assistant.assistant_service import get_profile, set_user_default

    profile = await get_profile(db, assistant_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Assistant not found: {assistant_id}")

    await set_user_default(db, user.id, assistant_id)
    return {"ok": True, "default": assistant_id}
