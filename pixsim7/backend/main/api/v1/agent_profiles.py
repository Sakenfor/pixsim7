"""
Agent Profiles API — CRUD + token minting for persistent agent identities.
"""
from __future__ import annotations

import re
import secrets
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database
from pixsim7.backend.main.domain.platform.agent_profile import AgentProfile
from pixsim7.backend.main.shared.auth import create_agent_token
from pixsim7.backend.main.shared.datetime_utils import utcnow

router = APIRouter(prefix="/dev/agent-profiles", tags=["dev", "agent-profiles"])

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,118}[a-z0-9]$")
VALID_STATUSES = frozenset({"active", "paused", "archived"})


# ── Schemas ──────────────────────────────────────────────────────


class AgentProfileResponse(BaseModel):
    id: str
    user_id: int
    label: str
    description: Optional[str] = None
    agent_type: str
    instructions: Optional[str] = None
    default_scopes: Optional[List[str]] = None
    assigned_plans: Optional[List[str]] = None
    status: str
    created_at: str
    updated_at: str


class AgentProfileListResponse(BaseModel):
    profiles: List[AgentProfileResponse]
    total: int


class AgentProfileCreateRequest(BaseModel):
    id: str = Field(..., min_length=3, max_length=120, description="Slug ID (lowercase, hyphens, underscores)")
    label: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    agent_type: str = Field(default="claude-cli", max_length=64)
    instructions: Optional[str] = None
    default_scopes: Optional[List[str]] = None
    assigned_plans: Optional[List[str]] = None


class AgentProfileUpdateRequest(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    agent_type: Optional[str] = Field(None, max_length=64)
    instructions: Optional[str] = None
    default_scopes: Optional[List[str]] = None
    assigned_plans: Optional[List[str]] = None
    status: Optional[str] = None


class AgentProfileTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    agent_id: str
    profile_id: str
    expires_in_hours: int
    command: str


# ── Helpers ──────────────────────────────────────────────────────


def _to_response(p: AgentProfile) -> dict:
    return {
        "id": p.id,
        "user_id": p.user_id,
        "label": p.label,
        "description": p.description,
        "agent_type": p.agent_type,
        "instructions": p.instructions,
        "default_scopes": p.default_scopes,
        "assigned_plans": p.assigned_plans,
        "status": p.status,
        "created_at": p.created_at.isoformat() if p.created_at else "",
        "updated_at": p.updated_at.isoformat() if p.updated_at else "",
    }


# ── List ─────────────────────────────────────────────────────────


@router.get("", response_model=AgentProfileListResponse)
async def list_agent_profiles(
    principal: CurrentUser,
    status: Optional[str] = Query(None, description="Filter by status"),
    db: AsyncSession = Depends(get_database),
):
    stmt = select(AgentProfile).where(AgentProfile.user_id == principal.id)
    if status:
        stmt = stmt.where(AgentProfile.status == status)
    stmt = stmt.order_by(AgentProfile.created_at.desc())
    profiles = (await db.execute(stmt)).scalars().all()
    return {
        "profiles": [_to_response(p) for p in profiles],
        "total": len(profiles),
    }


# ── Get ──────────────────────────────────────────────────────────


@router.get("/{profile_id}", response_model=AgentProfileResponse)
async def get_agent_profile(
    profile_id: str,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    profile = await db.get(AgentProfile, profile_id)
    if not profile or profile.user_id != principal.id:
        raise HTTPException(status_code=404, detail=f"Agent profile not found: {profile_id}")
    return _to_response(profile)


# ── Create ───────────────────────────────────────────────────────


@router.post("", response_model=AgentProfileResponse, status_code=201)
async def create_agent_profile(
    payload: AgentProfileCreateRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    if not _SLUG_RE.match(payload.id):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid profile ID '{payload.id}'. Must be 3-120 chars, lowercase alphanumeric with hyphens/underscores.",
        )

    existing = await db.get(AgentProfile, payload.id)
    if existing:
        raise HTTPException(status_code=409, detail=f"Agent profile already exists: {payload.id}")

    now = utcnow()
    profile = AgentProfile(
        id=payload.id,
        user_id=principal.id,
        label=payload.label,
        description=payload.description,
        agent_type=payload.agent_type,
        instructions=payload.instructions,
        default_scopes=payload.default_scopes,
        assigned_plans=payload.assigned_plans,
        status="active",
        created_at=now,
        updated_at=now,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return _to_response(profile)


# ── Update ───────────────────────────────────────────────────────


@router.patch("/{profile_id}", response_model=AgentProfileResponse)
async def update_agent_profile(
    profile_id: str,
    payload: AgentProfileUpdateRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    profile = await db.get(AgentProfile, profile_id)
    if not profile or profile.user_id != principal.id:
        raise HTTPException(status_code=404, detail=f"Agent profile not found: {profile_id}")

    if payload.status is not None and payload.status not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status '{payload.status}'. Valid: {', '.join(sorted(VALID_STATUSES))}",
        )

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    for field, value in updates.items():
        setattr(profile, field, value)
    profile.updated_at = utcnow()

    await db.commit()
    await db.refresh(profile)
    return _to_response(profile)


# ── Delete (archive) ─────────────────────────────────────────────


@router.delete("/{profile_id}", status_code=204)
async def delete_agent_profile(
    profile_id: str,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    profile = await db.get(AgentProfile, profile_id)
    if not profile or profile.user_id != principal.id:
        raise HTTPException(status_code=404, detail=f"Agent profile not found: {profile_id}")

    profile.status = "archived"
    profile.updated_at = utcnow()
    await db.commit()


# ── Mint Token ───────────────────────────────────────────────────


@router.post("/{profile_id}/token", response_model=AgentProfileTokenResponse)
async def mint_profile_token(
    profile_id: str,
    principal: CurrentUser,
    hours: int = Query(default=24, ge=1, le=168),
    scope: str = Query(default="dev"),
    db: AsyncSession = Depends(get_database),
):
    """Mint a token using this profile's stable agent_id."""
    profile = await db.get(AgentProfile, profile_id)
    if not profile or profile.user_id != principal.id:
        raise HTTPException(status_code=404, detail=f"Agent profile not found: {profile_id}")

    if profile.status != "active":
        raise HTTPException(status_code=400, detail=f"Profile is {profile.status}, cannot mint tokens")

    token = create_agent_token(
        agent_id=profile.id,
        agent_type=profile.agent_type,
        scopes=profile.default_scopes,
        on_behalf_of=principal.id if principal.id != 0 else None,
        ttl_hours=hours,
    )

    command = (
        f'PIXSIM_API_TOKEN="{token}" PIXSIM_SCOPE="{scope}" '
        f"claude --mcp-config pixsim-mcp.json"
    )

    return AgentProfileTokenResponse(
        access_token=token,
        agent_id=profile.id,
        profile_id=profile.id,
        expires_in_hours=hours,
        command=command,
    )
