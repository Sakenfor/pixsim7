"""
Agent Profiles API — unified CRUD for AI agent identities + assistant personas.

Each profile is both a service identity (agent_id for write attribution)
and a conversation persona (system prompt, model, tool scope).
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database
from pixsim7.backend.main.domain import UserSession
from pixsim7.backend.main.domain.platform.agent_profile import AgentProfile
from pixsim7.backend.main.shared.auth import create_agent_token, decode_access_token
from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.shared.datetime_utils import utcnow

router = APIRouter(prefix="/dev/agent-profiles", tags=["dev", "agent-profiles"])

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_:.-]{1,118}[a-z0-9]$")
VALID_STATUSES = frozenset({"active", "paused", "archived"})


# ── Schemas ──────────────────────────────────────────────────────


class AgentProfileResponse(BaseModel):
    id: str
    user_id: int
    label: str
    description: Optional[str] = None
    icon: Optional[str] = None
    agent_type: str
    system_prompt: Optional[str] = None
    model_id: Optional[str] = None
    method: Optional[str] = None
    audience: str = "user"
    allowed_contracts: Optional[List[str]] = None
    config: Optional[Dict] = None
    default_scopes: Optional[List[str]] = None
    assigned_plans: Optional[List[str]] = None
    status: str
    is_default: bool = False
    is_global: bool = False
    created_at: str
    updated_at: str


class AgentProfileListResponse(BaseModel):
    profiles: List[AgentProfileResponse]
    total: int


class AgentProfileCreateRequest(BaseModel):
    id: str = Field(..., min_length=3, max_length=120)
    label: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    icon: Optional[str] = Field(None, max_length=50)
    agent_type: str = Field(default="claude-cli", max_length=64)
    system_prompt: Optional[str] = None
    model_id: Optional[str] = Field(None, max_length=100)
    method: Optional[str] = Field(None, max_length=20)
    audience: str = Field(default="user", max_length=20)
    allowed_contracts: Optional[List[str]] = None
    config: Optional[Dict] = None
    default_scopes: Optional[List[str]] = None
    assigned_plans: Optional[List[str]] = None


class AgentProfileUpdateRequest(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    icon: Optional[str] = Field(None, max_length=50)
    agent_type: Optional[str] = Field(None, max_length=64)
    system_prompt: Optional[str] = None
    model_id: Optional[str] = Field(None, max_length=100)
    method: Optional[str] = Field(None, max_length=20)
    audience: Optional[str] = Field(None, max_length=20)
    allowed_contracts: Optional[List[str]] = None
    config: Optional[Dict] = None
    default_scopes: Optional[List[str]] = None
    assigned_plans: Optional[List[str]] = None
    status: Optional[str] = None
    is_default: Optional[bool] = None


class AgentProfileTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    agent_id: str
    profile_id: str
    expires_in_hours: int
    command: str


def _read_expiration_datetime(claims: dict) -> datetime:
    exp_claim = claims.get("exp")
    if isinstance(exp_claim, (int, float)):
        return datetime.fromtimestamp(exp_claim, tz=timezone.utc)
    if isinstance(exp_claim, datetime):
        return exp_claim if exp_claim.tzinfo else exp_claim.replace(tzinfo=timezone.utc)
    raise HTTPException(status_code=500, detail="minted_agent_token_missing_exp")


# ── Helpers ──────────────────────────────────────────────────────


def _to_response(p: AgentProfile) -> dict:
    return {
        "id": p.id,
        "user_id": p.user_id,
        "label": p.label,
        "description": p.description,
        "icon": p.icon,
        "agent_type": p.agent_type,
        "system_prompt": p.system_prompt,
        "model_id": p.model_id,
        "method": p.method,
        "audience": p.audience,
        "allowed_contracts": p.allowed_contracts,
        "config": p.config,
        "default_scopes": p.default_scopes,
        "assigned_plans": p.assigned_plans,
        "status": p.status,
        "is_default": p.is_default,
        "is_global": p.is_global,
        "created_at": p.created_at.isoformat() if p.created_at else "",
        "updated_at": p.updated_at.isoformat() if p.updated_at else "",
    }


# ── List ─────────────────────────────────────────────────────────


@router.get("", response_model=AgentProfileListResponse)
async def list_agent_profiles(
    principal: CurrentUser,
    status: Optional[str] = Query(None, description="Filter by status"),
    include_global: bool = Query(True, description="Include global/system profiles"),
    db: AsyncSession = Depends(get_database),
):
    conditions = [AgentProfile.status != "archived"]
    if status:
        conditions = [AgentProfile.status == status]

    if include_global:
        conditions.append(
            or_(AgentProfile.user_id == principal.id, AgentProfile.user_id == 0)
        )
    else:
        conditions.append(AgentProfile.user_id == principal.id)

    stmt = (
        select(AgentProfile)
        .where(*conditions)
        .order_by(AgentProfile.is_default.desc(), AgentProfile.label)
    )
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
    if not profile or (profile.user_id != principal.id and profile.user_id != 0):
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
            detail=f"Invalid profile ID '{payload.id}'. Must be 3-120 chars, lowercase alphanumeric with hyphens/underscores/colons/dots.",
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
        icon=payload.icon,
        agent_type=payload.agent_type,
        system_prompt=payload.system_prompt,
        model_id=payload.model_id,
        method=payload.method,
        audience=payload.audience,
        allowed_contracts=payload.allowed_contracts,
        config=payload.config,
        default_scopes=payload.default_scopes,
        assigned_plans=payload.assigned_plans,
        status="active",
        created_at=now,
        updated_at=now,
    )
    db.add(profile)

    from pixsim7.backend.main.services.audit import emit_audit
    actor = getattr(principal, 'source', f"user:{principal.id}")
    await emit_audit(
        db, domain="agent", entity_type="agent_profile",
        entity_id=payload.id, entity_label=payload.label,
        action="created", actor=actor,
    )

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
    if not profile or (profile.user_id != principal.id and profile.user_id != 0):
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

    from pixsim7.backend.main.services.audit import emit_audit
    actor = getattr(principal, 'source', f"user:{principal.id}")
    await emit_audit(
        db, domain="agent", entity_type="agent_profile",
        entity_id=profile_id, entity_label=profile.label,
        action="updated", actor=actor,
        extra={"changed_fields": list(updates.keys())},
    )

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
    if not profile or (profile.user_id != principal.id and profile.user_id != 0):
        raise HTTPException(status_code=404, detail=f"Agent profile not found: {profile_id}")

    profile.status = "archived"
    profile.updated_at = utcnow()

    from pixsim7.backend.main.services.audit import emit_audit
    actor = getattr(principal, 'source', f"user:{principal.id}")
    await emit_audit(
        db, domain="agent", entity_type="agent_profile",
        entity_id=profile_id, entity_label=profile.label,
        action="deleted", actor=actor,
    )

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
    if not profile or (profile.user_id != principal.id and profile.user_id != 0):
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

    claims = decode_access_token(token)
    token_id = claims.get("jti")
    if not isinstance(token_id, str) or not token_id.strip():
        raise HTTPException(status_code=500, detail="minted_agent_token_missing_jti")

    effective_user_id = principal.user_id
    if effective_user_id is None and settings.jwt_require_session:
        raise HTTPException(
            status_code=400,
            detail="agent_profile_token_requires_user_binding_in_strict_mode",
        )

    if effective_user_id is not None:
        db.add(
            UserSession(
                user_id=int(effective_user_id),
                token_id=token_id,
                expires_at=_read_expiration_datetime(claims),
                client_type="agent_token",
                client_name=f"{profile.agent_type}:{profile.id}",
                user_agent=f"agent/{profile.agent_type}",
            )
        )
        from pixsim7.backend.main.services.audit import emit_audit
        actor = getattr(principal, 'source', f"user:{principal.id}")
        await emit_audit(
            db, domain="agent", entity_type="agent_token",
            entity_id=token_id, entity_label=f"{profile.label} ({hours}h)",
            action="created", actor=actor,
            extra={"profile_id": profile.id, "hours": hours, "scope": scope},
        )
        await db.commit()

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


# ── Compat: /assistants read-through ────────────────────────────


async def resolve_profile_for_bridge(
    db: AsyncSession,
    user_id: int,
    profile_id: Optional[str] = None,
) -> Optional[AgentProfile]:
    """Resolve which profile to use for the bridge send path.

    Priority: explicit profile_id > user's default > global default > first available.
    """
    if profile_id:
        return await db.get(AgentProfile, profile_id)

    # User's default
    stmt = select(AgentProfile).where(
        AgentProfile.user_id == user_id,
        AgentProfile.is_default == True,  # noqa: E712
        AgentProfile.status == "active",
    )
    result = await db.execute(stmt)
    p = result.scalar_one_or_none()
    if p:
        return p

    # Global default
    stmt = select(AgentProfile).where(
        AgentProfile.user_id == 0,
        AgentProfile.is_default == True,  # noqa: E712
        AgentProfile.status == "active",
    )
    result = await db.execute(stmt)
    p = result.scalar_one_or_none()
    if p:
        return p

    # First available
    stmt = (
        select(AgentProfile)
        .where(
            or_(AgentProfile.user_id == user_id, AgentProfile.user_id == 0),
            AgentProfile.status == "active",
        )
        .order_by(AgentProfile.is_default.desc(), AgentProfile.label)
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()
