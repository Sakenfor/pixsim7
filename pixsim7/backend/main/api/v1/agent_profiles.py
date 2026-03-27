"""
Agent Profiles API — unified CRUD for AI agent identities + assistant personas.

Each profile is both a service identity (agent_id for write attribution)
and a conversation persona (system prompt, model, tool scope).
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database
from pixsim7.backend.main.domain import UserSession
from pixsim7.backend.main.domain.platform.agent_profile import AgentProfile, AgentRun
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
    agent_type: str = Field(default="claude", max_length=64)
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


# ── Observability (before /{profile_id} to avoid route capture) ───


class ChatSessionSummary(BaseModel):
    id: str
    engine: str
    label: str
    message_count: int
    summary_count: int = 0
    last_used_at: str
    created_at: str


class BridgeAgentSummary(BaseModel):
    bridge_client_id: str
    connected_at: str
    busy: bool
    tasks_completed: int
    engines: list[str] = []
    pool_sessions: list[dict] = []  # raw PoolSessionEntry dicts


class AgentObservabilityEntry(BaseModel):
    profile: dict  # AgentProfileResponse
    recent_sessions: list[ChatSessionSummary] = []


class AgentObservabilityResponse(BaseModel):
    agents: list[AgentObservabilityEntry]
    total_profiles: int
    bridges: list[BridgeAgentSummary] = []
    active_session_profile_ids: list[str] = []  # profile IDs with active heartbeat sessions
    active_session_ids: list[str] = []  # session IDs with active heartbeats


@router.get("/observability", response_model=AgentObservabilityResponse)
async def agent_observability(
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Joined view: profiles + their sessions + live bridge state."""
    from pixsim7.backend.main.domain.platform.agent_profile import ChatSession

    # 1. Load active profiles (same filter as list endpoint)
    # principal.user_id returns on_behalf_of for agent tokens, id for users
    effective_uid = principal.user_id or principal.id
    stmt = (
        select(AgentProfile)
        .where(AgentProfile.status != "archived")
        .where(or_(AgentProfile.user_id == effective_uid, AgentProfile.user_id == 0))
        .order_by(AgentProfile.is_default.desc(), AgentProfile.label)
    )
    profiles = (await db.execute(stmt)).scalars().all()
    profile_ids = [p.id for p in profiles]

    # 2. Load recent sessions grouped by profile (last 10 per profile)
    sessions_by_profile: dict[str, list[ChatSessionSummary]] = {}
    if profile_ids:
        sess_stmt = (
            select(ChatSession)
            .where(ChatSession.profile_id.in_(profile_ids))
            .where(ChatSession.status == "active")
            .order_by(ChatSession.last_used_at.desc())
            .limit(200)  # reasonable cap
        )
        sessions = (await db.execute(sess_stmt)).scalars().all()
        session_ids = [s.id for s in sessions]

        # Count work summaries per session
        summary_counts: dict[str, int] = {}
        if session_ids:
            try:
                from pixsim7.backend.main.domain.docs.models import AgentActivityLog
                from sqlalchemy import func as sa_func
                count_rows = (await db.execute(
                    select(AgentActivityLog.session_id, sa_func.count())
                    .where(AgentActivityLog.session_id.in_(session_ids))
                    .where(AgentActivityLog.action == "work_summary")
                    .group_by(AgentActivityLog.session_id)
                )).all()
                summary_counts = {r[0]: r[1] for r in count_rows}
            except Exception:
                pass

        for s in sessions:
            pid = s.profile_id
            if pid and pid not in sessions_by_profile:
                sessions_by_profile[pid] = []
            if pid and len(sessions_by_profile[pid]) < 10:
                sessions_by_profile[pid].append(ChatSessionSummary(
                    id=s.id,
                    engine=s.engine,
                    label=s.label,
                    message_count=s.message_count,
                    summary_count=summary_counts.get(s.id, 0),
                    last_used_at=s.last_used_at.isoformat() if s.last_used_at else "",
                    created_at=s.created_at.isoformat() if s.created_at else "",
                ))

    # 3. Get live bridge agents
    try:
        from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge
        bridge_agents = remote_cmd_bridge.get_agents(user_id=principal.id)
    except Exception:
        bridge_agents = []

    def _build_bridge_summary(a) -> BridgeAgentSummary:
        pool = a.pool_status or {}
        pool_engines = pool.get("engines", [])
        sessions_raw = pool.get("sessions", [])
        return BridgeAgentSummary(
            bridge_client_id=a.bridge_client_id,
            connected_at=a.connected_at.isoformat(),
            busy=a.busy,
            tasks_completed=a.tasks_completed,
            engines=sorted(set(pool_engines)) if pool_engines else [a.agent_type],
            pool_sessions=sessions_raw if isinstance(sessions_raw, list) else [],
        )

    # 4. Build profile entries (sorted by label)
    entries = [
        AgentObservabilityEntry(
            profile=_to_response(p),
            recent_sessions=sessions_by_profile.get(p.id, []),
        )
        for p in profiles
    ]
    entries.sort(key=lambda e: e.profile["label"].lower())

    # 5. Build bridge summaries (separate from profiles — bridges are shared dispatchers)
    bridge_summaries = [_build_bridge_summary(a) for a in bridge_agents]

    # 6. Find active heartbeat sessions and their profile IDs
    active_profile_ids: list[str] = []
    active_sess_ids: list[str] = []
    try:
        from pixsim7.backend.main.services.meta.agent_sessions import agent_session_registry
        registry_session_ids = [s.session_id for s in agent_session_registry.get_active()]
        if registry_session_ids:
            rows = (await db.execute(
                select(ChatSession.id, ChatSession.profile_id)
                .where(ChatSession.id.in_(registry_session_ids))
            )).all()
            active_sess_ids = [r[0] for r in rows if r[0]]
            active_profile_ids = list(set(r[1] for r in rows if r[1]))
    except Exception:
        pass

    return AgentObservabilityResponse(
        agents=entries,
        total_profiles=len(profiles),
        bridges=bridge_summaries,
        active_session_profile_ids=active_profile_ids,
        active_session_ids=active_sess_ids,
    )


# ── Agent Runs (before /{profile_id} to avoid route capture) ─────


class AgentRunResponse(BaseModel):
    id: str
    profile_id: str
    run_id: str
    status: str
    started_at: str
    ended_at: Optional[str] = None
    summary: Optional[Dict[str, Any]] = None
    token_jti: Optional[str] = None


class AgentRunCompleteRequest(BaseModel):
    status: str = Field(default="completed", description='"completed" or "failed"')
    summary: Optional[Dict[str, Any]] = None


def _run_to_response(r: AgentRun) -> dict:
    return {
        "id": str(r.id),
        "profile_id": r.profile_id,
        "run_id": r.run_id,
        "status": r.status,
        "started_at": r.started_at.isoformat() if r.started_at else "",
        "ended_at": r.ended_at.isoformat() if r.ended_at else None,
        "summary": r.summary,
        "token_jti": r.token_jti,
    }


@router.get("/runs", response_model=List[AgentRunResponse])
async def list_agent_runs(
    principal: CurrentUser,
    profile_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_database),
):
    """List agent runs, optionally filtered by profile or status."""
    from pixsim7.backend.main.services.audit import AgentTrackingService
    svc = AgentTrackingService(db)
    runs = await svc.list_runs(profile_id=profile_id, status=status, limit=limit)
    return [_run_to_response(r) for r in runs]


@router.post("/runs/{run_id}/complete", response_model=AgentRunResponse)
async def complete_agent_run(
    run_id: str,
    payload: AgentRunCompleteRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Mark an agent run as completed or failed."""
    from pixsim7.backend.main.services.audit import AgentTrackingService, resolve_actor

    svc = AgentTrackingService(db)
    try:
        run = await svc.complete_run(
            run_id, status=payload.status,
            summary=payload.summary, actor=resolve_actor(principal),
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await db.commit()
    await db.refresh(run)
    return _run_to_response(run)


# ── Git Commit Audit ─────────────────────────────────────────────


class GitCommitAuditRequest(BaseModel):
    """Payload an agent sends after making a git commit."""
    commit_sha: str = Field(..., min_length=7, max_length=64)
    message: str = Field(..., min_length=1, max_length=4000)
    branch: Optional[str] = Field(None, max_length=255)
    files_changed: Optional[List[str]] = None
    insertions: Optional[int] = None
    deletions: Optional[int] = None
    run_id: Optional[str] = Field(None, description="Agent run ID for grouping")


class GitCommitAuditResponse(BaseModel):
    ok: bool = True
    audit_id: str
    commit_sha: str


@router.post("/audit/git-commit", response_model=GitCommitAuditResponse, status_code=201)
async def audit_git_commit(
    payload: GitCommitAuditRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Record a git commit made by an agent for audit tracking."""
    from pixsim7.backend.main.services.audit import AgentTrackingService, resolve_actor

    svc = AgentTrackingService(db)
    entry = await svc.record_git_commit(
        actor=resolve_actor(principal),
        commit_sha=payload.commit_sha,
        message=payload.message,
        branch=payload.branch,
        files_changed=payload.files_changed,
        insertions=payload.insertions,
        deletions=payload.deletions,
        agent_id=principal.agent_id,
        agent_type=principal.agent_type,
        run_id=payload.run_id or principal.run_id,
    )
    await db.commit()
    return GitCommitAuditResponse(audit_id=str(entry.id), commit_sha=payload.commit_sha)


@router.get("/audit/git-commits")
async def list_git_commit_audits(
    principal: CurrentUser,
    profile_id: Optional[str] = Query(None, description="Filter by agent profile"),
    run_id: Optional[str] = Query(None, description="Filter by run ID"),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_database),
):
    """List audited git commits, optionally filtered by agent or run."""
    from pixsim7.backend.main.services.audit import AgentTrackingService

    svc = AgentTrackingService(db)
    rows = await svc.list_git_commits(profile_id=profile_id, run_id=run_id, limit=limit)
    return {
        "commits": [
            {
                "audit_id": str(r.id),
                "commit_sha": r.commit_sha,
                "message": r.entity_label,
                "actor": r.actor,
                "timestamp": r.timestamp.isoformat(),
                "metadata": r.extra,
            }
            for r in rows
        ],
        "total": len(rows),
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

    run_id = str(uuid4())
    token = create_agent_token(
        agent_id=profile.id,
        agent_type=profile.agent_type,
        scopes=profile.default_scopes,
        on_behalf_of=principal.id if principal.id != 0 else None,
        run_id=run_id,
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

        # Create AgentRun to track this invocation
        from pixsim7.backend.main.services.audit import AgentTrackingService
        svc = AgentTrackingService(db)
        await svc.create_run(profile_id=profile.id, run_id=run_id, token_jti=token_id)

        from pixsim7.backend.main.services.audit import emit_audit
        actor = getattr(principal, 'source', f"user:{principal.id}")
        await emit_audit(
            db, domain="agent", entity_type="agent_token",
            entity_id=token_id, entity_label=f"{profile.label} ({hours}h)",
            action="created", actor=actor,
            extra={"profile_id": profile.id, "hours": hours, "scope": scope, "run_id": run_id},
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


async def resolve_agent_profile(
    db: AsyncSession,
    user_id: int,
    profile_id: Optional[str] = None,
) -> Optional[AgentProfile]:
    """Resolve an agent profile by ID, falling back to defaults.

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
