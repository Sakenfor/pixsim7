"""
AI Assistant Profiles API — compatibility layer.

Reads from the unified ``agent_profiles`` table. Write operations
redirect to ``/dev/agent-profiles``.

Legacy callers that use ``/assistants`` continue to work.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database
from pixsim7.backend.main.domain.platform.agent_profile import AgentProfile

router = APIRouter()


# ── Schemas (compat shape) ────────────────────────────────────────


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
    assistant_id: str = Field(..., max_length=100)
    name: str = Field(..., max_length=255)
    description: Optional[str] = None
    icon: Optional[str] = None
    model_id: Optional[str] = None
    method: Optional[str] = None
    system_prompt: Optional[str] = None
    audience: str = Field("user")
    allowed_contracts: Optional[List[str]] = None
    config: Optional[dict] = None


def _to_compat(p: AgentProfile) -> AssistantProfileResponse:
    return AssistantProfileResponse(
        assistant_id=p.id,
        name=p.label,
        description=p.description,
        icon=p.icon,
        model_id=p.model_id,
        method=p.method,
        system_prompt=p.system_prompt,
        audience=p.audience,
        allowed_contracts=p.allowed_contracts or [],
        config=p.config or {},
        is_default=p.is_default,
        is_global=p.is_global,
    )


# ── Endpoints ─────────────────────────────────────────────────────


@router.get("", response_model=List[AssistantProfileResponse])
async def list_assistant_profiles(
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
) -> List[AssistantProfileResponse]:
    """List profiles available to the current user (global + own)."""
    stmt = (
        select(AgentProfile)
        .where(
            AgentProfile.status == "active",
            or_(AgentProfile.user_id == user.id, AgentProfile.user_id == 0),
        )
        .order_by(AgentProfile.is_default.desc(), AgentProfile.label)
    )
    profiles = (await db.execute(stmt)).scalars().all()
    return [_to_compat(p) for p in profiles]


@router.get("/{assistant_id}", response_model=AssistantProfileResponse)
async def get_assistant_profile(
    assistant_id: str,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
) -> AssistantProfileResponse:
    """Get a specific profile."""
    profile = await db.get(AgentProfile, assistant_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Assistant not found: {assistant_id}")
    return _to_compat(profile)


@router.post("", response_model=AssistantProfileResponse, status_code=201)
async def create_assistant_profile(
    payload: AssistantProfileCreateRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
) -> AssistantProfileResponse:
    """Create a new profile (writes to agent_profiles)."""
    from pixsim7.backend.main.shared.datetime_utils import utcnow

    existing = await db.get(AgentProfile, payload.assistant_id)
    if existing:
        raise HTTPException(status_code=409, detail=f"Profile already exists: {payload.assistant_id}")

    now = utcnow()
    profile = AgentProfile(
        id=payload.assistant_id,
        user_id=user.id,
        label=payload.name,
        description=payload.description,
        icon=payload.icon,
        agent_type="claude-cli",
        system_prompt=payload.system_prompt,
        model_id=payload.model_id,
        method=payload.method,
        audience=payload.audience,
        allowed_contracts=payload.allowed_contracts,
        config=payload.config,
        status="active",
        created_at=now,
        updated_at=now,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return _to_compat(profile)


@router.delete("/{assistant_id}")
async def delete_assistant_profile(
    assistant_id: str,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
) -> dict:
    """Archive a profile."""
    from pixsim7.backend.main.shared.datetime_utils import utcnow

    profile = await db.get(AgentProfile, assistant_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Assistant not found: {assistant_id}")
    if profile.user_id != 0 and profile.user_id != user.id and not user.is_admin():
        raise HTTPException(status_code=403, detail="Can only delete your own profiles")

    profile.status = "archived"
    profile.updated_at = utcnow()
    await db.commit()
    return {"ok": True, "assistant_id": assistant_id}


@router.post("/{assistant_id}/set-default")
async def set_default_profile(
    assistant_id: str,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
) -> dict:
    """Set a profile as the user's default."""
    from pixsim7.backend.main.shared.datetime_utils import utcnow

    profile = await db.get(AgentProfile, assistant_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Assistant not found: {assistant_id}")

    # Clear existing defaults for this user
    stmt = select(AgentProfile).where(
        AgentProfile.user_id == user.id,
        AgentProfile.is_default == True,  # noqa: E712
    )
    for p in (await db.execute(stmt)).scalars().all():
        p.is_default = False
        p.updated_at = utcnow()

    profile.is_default = True
    profile.updated_at = utcnow()
    await db.commit()
    return {"ok": True, "default": assistant_id}
