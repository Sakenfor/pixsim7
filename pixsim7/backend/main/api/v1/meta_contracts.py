"""
Global machine-readable contract discovery index + agent activity tracking.

Returns a navigable graph of all meta contract surfaces.  Each contract
declares what it ``provides`` and what other contracts it ``relates_to``,
so consumers can walk the graph from any entry point.

Agent sessions overlay live activity onto the contract graph, showing
which contracts and plans agents are currently working on.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.routing import APIRoute
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, func, distinct, update, or_
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_current_user_optional, get_database
from pixsim7.backend.main.domain.docs.models import AgentActivityLog
from pixsim7.backend.main.services.meta.contract_registry import (
    meta_contract_registry,
)
from pixsim7.backend.main.services.meta.agent_sessions import (
    agent_session_registry,
)
from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.shared.datetime_utils import utcnow

router = APIRouter(prefix="/meta", tags=["meta"])
CONTRACTS_INDEX_VERSION = "2026-03-17.5"


# =============================================================================
# Contract graph models
# =============================================================================


class EndpointAvailabilityEntry(BaseModel):
    status: str = Field(
        "available",
        description="Runtime availability: available | conditional | disabled.",
    )
    reason: Optional[str] = Field(
        None,
        description="Human-readable reason for conditional/disabled state.",
    )
    conditions: List[str] = Field(
        default_factory=list,
        description="Machine-readable condition hints.",
    )


class ContractEndpointEntry(BaseModel):
    id: str
    method: str
    path: str
    summary: str
    auth_required: bool = Field(
        True,
        description="Whether auth is required for this endpoint. Inherits contract-level auth by default.",
    )
    requires_admin: bool = Field(
        False,
        description="Whether this endpoint requires admin privileges.",
    )
    permissions: List[str] = Field(
        default_factory=list,
        description="Permission scopes required by this endpoint.",
    )
    availability: EndpointAvailabilityEntry = Field(
        default_factory=EndpointAvailabilityEntry,
        description="Runtime availability metadata.",
    )
    input_schema: Optional[Dict[str, Any]] = Field(
        None,
        description="Optional JSON-schema-like input contract for MCP/tool generation.",
    )
    output_schema: Optional[Dict[str, Any]] = Field(
        None,
        description="Optional JSON-schema-like output contract.",
    )
    tags: List[str] = Field(
        default_factory=list,
        description="Endpoint tags for discovery/filtering.",
    )


class AgentPresence(BaseModel):
    """Active agent on a contract node."""
    session_id: str
    agent_type: str
    status: str
    action: str
    detail: str
    plan_id: Optional[str] = None
    task_kind: Optional[str] = None
    duration_seconds: int = 0


class ContractIndexEntry(BaseModel):
    id: str
    name: str
    endpoint: Optional[str] = Field(
        None,
        description="Primary contract endpoint. Null if contract is an endpoint group.",
    )
    version: str
    auth_required: bool
    owner: str
    summary: str
    audience: List[str] = Field(
        default_factory=list,
        description="Who this contract is for: 'user', 'dev', or both.",
    )
    provides: List[str] = Field(
        default_factory=list,
        description="Capabilities this contract surface exposes.",
    )
    relates_to: List[str] = Field(
        default_factory=list,
        description="IDs of related contracts (bidirectional navigation).",
    )
    sub_endpoints: List[ContractEndpointEntry] = Field(
        default_factory=list,
        description="Individual endpoints when contract is an endpoint group.",
    )
    active_agents: List[AgentPresence] = Field(
        default_factory=list,
        description="Agents currently working on this contract surface.",
    )


class ContractsIndexResponse(BaseModel):
    version: str
    generated_at: str
    contracts: List[ContractIndexEntry]
    total_active_agents: int = 0


def _normalize_route_path(path: str) -> str:
    normalized = str(path or "").strip()
    if not normalized.startswith("/"):
        normalized = f"/{normalized}"
    if normalized != "/" and normalized.endswith("/"):
        normalized = normalized[:-1]
    return normalized


def _slugify_contract_token(value: str) -> str:
    token = "".join(ch if ch.isalnum() else "_" for ch in str(value or "").strip().lower())
    token = token.strip("_")
    return token or "unknown"


def _discover_game_route_group_contracts(
    request: Optional[Request],
    *,
    active_sessions: List[Any],
) -> List[ContractIndexEntry]:
    app = getattr(request, "app", None) if request is not None else None
    routes = getattr(app, "routes", None)
    if not isinstance(routes, list):
        return []

    groups: Dict[str, Dict[str, Any]] = {}
    for route in routes:
        if not isinstance(route, APIRoute):
            continue

        normalized_path = _normalize_route_path(route.path)
        if not normalized_path.startswith("/api/v1/game/"):
            continue

        suffix = normalized_path[len("/api/v1/game/") :]
        if not suffix:
            continue
        group_key = suffix.split("/", 1)[0].strip()
        if not group_key:
            continue

        entry = groups.setdefault(
            group_key,
            {
                "methods": set(),
                "paths": set(),
            },
        )

        methods = {
            method.upper()
            for method in (route.methods or set())
            if isinstance(method, str) and method.upper() not in {"HEAD", "OPTIONS"}
        }
        entry["methods"].update(methods)
        entry["paths"].add(normalized_path)

    contracts: List[ContractIndexEntry] = []
    for group_key in sorted(groups.keys(), key=str.lower):
        group_meta = groups[group_key]
        group_slug = _slugify_contract_token(group_key)
        contract_id = f"game.routes.{group_slug}"
        contract_endpoint = f"/api/v1/game/{group_key}"
        methods = sorted(group_meta["methods"])
        paths = sorted(group_meta["paths"])

        agents_on_contract = [
            AgentPresence(**s.to_presence())
            for s in active_sessions
            if s.contract_id == contract_id
        ]

        method_summary = ", ".join(methods) if methods else "none"
        summary = (
            f"Auto-discovered game route group '{group_key}' exposing "
            f"{len(paths)} path(s) and methods: {method_summary}."
        )

        contracts.append(
            ContractIndexEntry(
                id=contract_id,
                name=f"Game Routes: {group_key}",
                endpoint=contract_endpoint,
                version=CONTRACTS_INDEX_VERSION,
                auth_required=True,
                owner="game route plugins",
                summary=summary,
                audience=["user", "dev"],
                provides=[
                    "game_api_routes",
                    f"game_route_group:{group_slug}",
                ],
                relates_to=["game.authoring", "user.assistant"],
                sub_endpoints=[],
                active_agents=agents_on_contract,
            )
        )

    return contracts


def _resolve_endpoint_availability(
    contract_id: str,
    endpoint_id: str,
    availability: Dict[str, Any] | None,
) -> EndpointAvailabilityEntry:
    """Apply runtime-aware availability overrides."""
    payload = dict(availability or {})
    payload.setdefault("status", "available")
    payload.setdefault("reason", None)
    payload.setdefault("conditions", [])

    # Runtime override: filesystem sync endpoint is disabled in DB-only mode.
    if contract_id == "plans.management" and endpoint_id == "plans.sync":
        if settings.plans_db_only_mode:
            payload["status"] = "disabled"
            payload["reason"] = "Disabled while plans DB-only mode is enabled."
        elif payload.get("status") == "disabled":
            payload["status"] = "conditional"

    return EndpointAvailabilityEntry(**payload)


@router.get("/contracts", response_model=ContractsIndexResponse)
async def list_contract_endpoints(
    request: Request = None,
    audience: Optional[str] = Query(
        None,
        description="Filter by audience: 'user' or 'dev'. Omit for all.",
    ),
) -> ContractsIndexResponse:
    """
    Contract discovery graph with live agent activity overlay.

    Each contract declares `provides` (capabilities) and `relates_to`
    (other contract IDs), forming a navigable discovery graph.
    `active_agents` shows which agents are currently working on each surface.

    Pass `?audience=user` to only get user-facing contracts (excludes dev tooling).
    """
    _sync_contract_versions()
    audience_filter = audience.strip() if isinstance(audience, str) else None

    active_sessions = agent_session_registry.get_active()

    contracts = []
    for c in meta_contract_registry.values():
        # Filter by audience if requested
        if audience_filter and audience_filter not in c.audience:
            continue

        agents_on_contract = [
            AgentPresence(**s.to_presence())
            for s in active_sessions
            if s.contract_id == c.id
        ]

        contracts.append(ContractIndexEntry(
            id=c.id,
            name=c.name,
            endpoint=c.endpoint,
            version=c.version,
            auth_required=c.auth_required,
            owner=c.owner,
            summary=c.summary,
            audience=c.audience,
            provides=c.provides,
            relates_to=c.relates_to,
            sub_endpoints=[
                ContractEndpointEntry(
                    id=ep.id, method=ep.method,
                    path=ep.path, summary=ep.summary,
                    auth_required=c.auth_required if ep.auth_required is None else ep.auth_required,
                    requires_admin=ep.requires_admin,
                    permissions=ep.permissions,
                    availability=_resolve_endpoint_availability(
                        c.id, ep.id, ep.availability
                    ),
                    input_schema=ep.input_schema,
                    output_schema=ep.output_schema,
                    tags=ep.tags,
                )
                for ep in c.sub_endpoints
            ],
            active_agents=agents_on_contract,
        ))

    dynamic_game_route_contracts = _discover_game_route_group_contracts(
        request,
        active_sessions=active_sessions,
    )
    existing_ids = {contract.id for contract in contracts}
    for contract in dynamic_game_route_contracts:
        if contract.id in existing_ids:
            continue
        if audience_filter and audience_filter not in contract.audience:
            continue
        contracts.append(contract)

    return ContractsIndexResponse(
        version=CONTRACTS_INDEX_VERSION,
        generated_at=datetime.now(timezone.utc).isoformat(),
        contracts=contracts,
        total_active_agents=len(active_sessions),
    )


# =============================================================================
# Agent session endpoints
# =============================================================================


class AgentHeartbeatRequest(BaseModel):
    session_id: str = Field(..., description="Unique agent session identifier")
    run_id: Optional[str] = Field(None, description="Run/invocation ID (from agent token)")
    agent_type: str = Field("claude", description="Agent type (claude, custom, etc.)")
    status: str = Field("active", description="active | paused | completed | errored")
    contract_id: Optional[str] = Field(None, description="Contract surface the agent is working on")
    endpoint: Optional[str] = Field(None, description="Specific endpoint being called")
    plan_id: Optional[str] = Field(None, description="Plan the agent is working on")
    action: str = Field("", description="Current action (reading_plan, editing_code, running_codegen, etc.)")
    detail: str = Field("", description="Free-form detail about current activity")
    metadata: Optional[Dict[str, str]] = Field(None, description="Additional metadata")


class AgentSessionEntry(BaseModel):
    session_id: str
    agent_type: str
    status: str
    started_at: str
    last_heartbeat: str
    duration_seconds: int
    plan_id: Optional[str] = None
    contract_id: Optional[str] = None
    action: str = ""
    detail: str = ""
    metadata: Dict[str, str] = Field(default_factory=dict)
    recent_activity: List[Dict[str, Any]] = Field(default_factory=list)


class AgentHeartbeatResponse(BaseModel):
    session_id: str
    status: str
    acknowledged: bool = True


class AgentSessionsResponse(BaseModel):
    active: List[AgentSessionEntry]
    total_active: int
    total_all: int


@router.post("/agents/heartbeat", response_model=AgentHeartbeatResponse)
async def agent_heartbeat(
    payload: AgentHeartbeatRequest,
    db: AsyncSession = Depends(get_database),
) -> AgentHeartbeatResponse:
    """Report agent activity. Call periodically (every 30-60s) to stay visible.

    Sessions auto-expire after 2 minutes of no heartbeat.
    Each heartbeat is persisted to the agent_activity_log for history.
    """
    # Update in-memory presence
    session = agent_session_registry.heartbeat(
        session_id=payload.session_id,
        agent_type=payload.agent_type,
        status=payload.status,
        contract_id=payload.contract_id,
        endpoint=payload.endpoint,
        plan_id=payload.plan_id,
        action=payload.action,
        detail=payload.detail,
        metadata=payload.metadata,
    )

    # Persist to DB only for meaningful actions (not idle keepalive)
    _KEEPALIVE_ACTIONS = {"cli_session", "processing_task", "mcp_session", "tool_use", ""}
    if payload.action not in _KEEPALIVE_ACTIONS:
        db.add(AgentActivityLog(
            session_id=payload.session_id,
            run_id=payload.run_id,
            agent_type=payload.agent_type,
            status=payload.status,
            contract_id=payload.contract_id,
            plan_id=payload.plan_id,
            action=payload.action,
            detail=payload.detail or None,
            endpoint=payload.endpoint,
            extra=payload.metadata,
            timestamp=utcnow(),
        ))
        await db.commit()

    return AgentHeartbeatResponse(
        session_id=session.session_id,
        status=session.status,
    )


@router.post("/agents/{session_id}/end", response_model=AgentHeartbeatResponse)
async def end_agent_session(
    session_id: str,
    status: str = "completed",
) -> AgentHeartbeatResponse:
    """Explicitly end an agent session."""
    session = agent_session_registry.end_session(session_id, status)
    return AgentHeartbeatResponse(
        session_id=session_id,
        status=session.status if session else status,
    )


@router.get("/agents", response_model=AgentSessionsResponse)
async def list_agent_sessions() -> AgentSessionsResponse:
    """List all active agent sessions with their current activity."""
    active = agent_session_registry.get_active()
    all_sessions = agent_session_registry.get_all()

    return AgentSessionsResponse(
        active=[
            AgentSessionEntry(
                session_id=s.session_id,
                agent_type=s.agent_type,
                status=s.status,
                started_at=s.started_at.isoformat(),
                last_heartbeat=s.last_heartbeat.isoformat(),
                duration_seconds=s.duration_seconds,
                plan_id=s.plan_id,
                contract_id=s.contract_id,
                action=s.action,
                detail=s.detail,
                metadata=s.metadata,
                recent_activity=[
                    {
                        "action": a.action,
                        "detail": a.detail,
                        "contract_id": a.contract_id,
                        "plan_id": a.plan_id,
                        "timestamp": a.timestamp.isoformat(),
                    }
                    for a in s.activity_log[-10:]
                ],
            )
            for s in active
        ],
        total_active=len(active),
        total_all=len(all_sessions),
    )


# =============================================================================
# Agent history (DB-backed)
# =============================================================================


class AgentHistoryEntry(BaseModel):
    session_id: str
    run_id: Optional[str] = None
    agent_type: str
    status: str
    contract_id: Optional[str] = None
    plan_id: Optional[str] = None
    action: str
    detail: Optional[str] = None
    endpoint: Optional[str] = None
    metadata: Optional[Dict[str, str]] = None
    timestamp: str


class AgentHistoryResponse(BaseModel):
    entries: List[AgentHistoryEntry]
    total: int


class AgentStatsContract(BaseModel):
    contract_id: str
    heartbeat_count: int
    unique_sessions: int


class AgentStatsPlan(BaseModel):
    plan_id: str
    heartbeat_count: int
    unique_sessions: int


class AgentStatsResponse(BaseModel):
    total_heartbeats: int
    unique_sessions: int
    by_contract: List[AgentStatsContract]
    by_plan: List[AgentStatsPlan]


@router.get("/agents/history", response_model=AgentHistoryResponse)
async def get_agent_history(
    session_id: Optional[str] = Query(None, description="Filter by session"),
    run_id: Optional[str] = Query(None, description="Filter by run/invocation ID"),
    plan_id: Optional[str] = Query(None, description="Filter by plan"),
    contract_id: Optional[str] = Query(None, description="Filter by contract"),
    action: Optional[str] = Query(None, description="Filter by action (e.g. work_summary, tool_use)"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_database),
) -> AgentHistoryResponse:
    """Query persistent agent activity log with filters."""
    stmt = select(AgentActivityLog).order_by(AgentActivityLog.timestamp.desc())

    if session_id:
        stmt = stmt.where(AgentActivityLog.session_id == session_id)
    if run_id:
        stmt = stmt.where(AgentActivityLog.run_id == run_id)
    if plan_id:
        stmt = stmt.where(AgentActivityLog.plan_id == plan_id)
    if contract_id:
        stmt = stmt.where(AgentActivityLog.contract_id == contract_id)
    if action:
        stmt = stmt.where(AgentActivityLog.action == action)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    rows = (await db.execute(stmt.offset(offset).limit(limit))).scalars().all()

    return AgentHistoryResponse(
        entries=[
            AgentHistoryEntry(
                session_id=r.session_id,
                run_id=r.run_id,
                agent_type=r.agent_type,
                status=r.status,
                contract_id=r.contract_id,
                plan_id=r.plan_id,
                action=r.action,
                detail=r.detail,
                endpoint=r.endpoint,
                metadata=r.extra if isinstance(r.extra, dict) else None,
                timestamp=r.timestamp.isoformat() if r.timestamp else "",
            )
            for r in rows
        ],
        total=total,
    )


@router.get("/agents/stats", response_model=AgentStatsResponse)
async def get_agent_stats(
    days: int = Query(7, ge=1, le=90, description="Lookback window in days"),
    db: AsyncSession = Depends(get_database),
) -> AgentStatsResponse:
    """Aggregate agent activity stats over a time window."""
    from datetime import timedelta
    cutoff = utcnow() - timedelta(days=days)

    base = select(AgentActivityLog).where(AgentActivityLog.timestamp >= cutoff)

    total = (await db.execute(
        select(func.count()).select_from(base.subquery())
    )).scalar() or 0

    unique_sessions = (await db.execute(
        select(func.count(distinct(AgentActivityLog.session_id))).where(
            AgentActivityLog.timestamp >= cutoff
        )
    )).scalar() or 0

    # By contract
    contract_rows = (await db.execute(
        select(
            AgentActivityLog.contract_id,
            func.count().label("cnt"),
            func.count(distinct(AgentActivityLog.session_id)).label("sessions"),
        )
        .where(AgentActivityLog.timestamp >= cutoff)
        .where(AgentActivityLog.contract_id.isnot(None))
        .group_by(AgentActivityLog.contract_id)
        .order_by(func.count().desc())
    )).all()

    # By plan
    plan_rows = (await db.execute(
        select(
            AgentActivityLog.plan_id,
            func.count().label("cnt"),
            func.count(distinct(AgentActivityLog.session_id)).label("sessions"),
        )
        .where(AgentActivityLog.timestamp >= cutoff)
        .where(AgentActivityLog.plan_id.isnot(None))
        .group_by(AgentActivityLog.plan_id)
        .order_by(func.count().desc())
    )).all()

    return AgentStatsResponse(
        total_heartbeats=total,
        unique_sessions=unique_sessions,
        by_contract=[
            AgentStatsContract(
                contract_id=r[0], heartbeat_count=r[1], unique_sessions=r[2],
            )
            for r in contract_rows
        ],
        by_plan=[
            AgentStatsPlan(
                plan_id=r[0], heartbeat_count=r[1], unique_sessions=r[2],
            )
            for r in plan_rows
        ],
    )


# =============================================================================
# Remote agent bridge — status + send message
# =============================================================================


class PoolSessionEntry(BaseModel):
    session_id: str
    engine: str
    state: str
    cli_session_id: Optional[str] = None
    cli_model: Optional[str] = None
    messages_sent: int = 0
    messages_received: int = 0
    errors: int = 0
    total_duration_ms: int = 0
    started_at: Optional[str] = None
    last_activity: Optional[str] = None
    last_error: Optional[str] = None
    pid: Optional[int] = None
    # Context usage
    context_window: int = 0
    total_tokens: int = 0
    context_pct: Optional[float] = None
    cost_usd: Optional[float] = None

class RemoteAgentEntry(BaseModel):
    bridge_client_id: str
    bridge_id: Optional[str] = None
    agent_type: str
    user_id: Optional[int] = None
    connected_at: str
    busy: bool
    tasks_completed: int
    engines: List[str] = []
    pool_sessions: List[PoolSessionEntry] = []


class RemoteAgentBridgeStatus(BaseModel):
    connected: int
    available: int
    agents: List[RemoteAgentEntry]


class BridgeMachineEntry(BaseModel):
    bridge_client_id: str
    bridge_id: Optional[str] = None
    agent_type: Optional[str] = None
    status: str
    online: bool
    first_seen_at: str
    last_seen_at: str
    last_connected_at: Optional[str] = None
    last_disconnected_at: Optional[str] = None
    model: Optional[str] = None
    client_host: Optional[str] = None


class BridgeMachinesResponse(BaseModel):
    total: int
    machines: List[BridgeMachineEntry]


async def _resolve_effective_user_id_from_authorization(
    authorization: Optional[str],
) -> Optional[int]:
    """Resolve effective user ID from bearer token (user or agent-on-behalf token)."""
    if not authorization:
        return None

    try:
        from pixsim7.backend.main.api.dependencies import (
            _extract_bearer_token,
            get_auth_service,
        )
        from pixsim7.backend.main.shared.actor import RequestPrincipal

        token = _extract_bearer_token(authorization)
        auth_service = get_auth_service()
        payload = await auth_service.verify_token_claims(token, update_last_used=False)
        principal = RequestPrincipal.from_jwt_payload(payload)
        if principal.user_id is not None:
            return int(principal.user_id)

        user = await auth_service.verify_token(token)
        return int(user.id) if user else None
    except Exception:
        return None


@router.get("/agents/bridge", response_model=RemoteAgentBridgeStatus)
async def get_bridge_status(
    authorization: Optional[str] = Header(None),
) -> RemoteAgentBridgeStatus:
    """Status of the remote agent command bridge.

    If authenticated, shows the user's bridges + shared bridges.
    If unauthenticated, shows all bridges.
    """
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge

    user_id = await _resolve_effective_user_id_from_authorization(authorization)

    agents = remote_cmd_bridge.get_agents(user_id=user_id)

    def _build_agent_entry(a) -> RemoteAgentEntry:
        pool = a.pool_status or {}
        sessions_raw = pool.get("sessions", [])
        pool_sessions = [
            PoolSessionEntry(
                session_id=s.get("session_id", ""),
                engine=s.get("session_id", "").split("-")[0] if s.get("session_id") else "unknown",
                state=s.get("state", "unknown"),
                cli_session_id=s.get("cli_session_id"),
                cli_model=s.get("cli_model"),
                messages_sent=s.get("messages_sent", 0),
                messages_received=s.get("messages_received", 0),
                errors=s.get("errors", 0),
                total_duration_ms=s.get("total_duration_ms", 0),
                started_at=s.get("started_at"),
                last_activity=s.get("last_activity"),
                last_error=s.get("last_error"),
                pid=s.get("pid"),
                context_window=s.get("context_window", 0),
                total_tokens=s.get("total_tokens", 0),
                context_pct=s.get("context_pct"),
                cost_usd=s.get("cost_usd"),
            )
            for s in sessions_raw if isinstance(s, dict)
        ]
        # Use pool's detected engines (reported at connect), fall back to active session engines
        pool_engines = pool.get("engines", [])
        engines = sorted(set(pool_engines)) if pool_engines else (
            sorted({s.engine for s in pool_sessions}) if pool_sessions else [a.agent_type]
        )
        return RemoteAgentEntry(
            bridge_client_id=a.bridge_client_id,
            bridge_id=getattr(a, "bridge_id", None),
            agent_type=a.agent_type,
            user_id=a.user_id,
            connected_at=a.connected_at.isoformat(),
            busy=a.busy,
            tasks_completed=a.tasks_completed,
            engines=engines,
            pool_sessions=pool_sessions,
        )

    return RemoteAgentBridgeStatus(
        connected=len(agents),
        available=sum(1 for a in agents if not a.busy),
        agents=[_build_agent_entry(a) for a in agents],
    )


@router.get("/agents/bridge/machines", response_model=BridgeMachinesResponse)
async def get_bridge_machines(
    principal: CurrentUser,
    user_id: Optional[int] = Query(default=None, ge=1),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_database),
) -> BridgeMachinesResponse:
    """List bridge client IDs (machines) used by a user.

    Non-admin callers can only query their own machines.
    Admin callers may pass ``user_id`` to inspect another user's machines.
    """
    from pixsim7.backend.main.domain.platform.agent_profile import BridgeUserMembership

    effective_user_id = principal.user_id
    if user_id is not None:
        requested_user_id = int(user_id)
        if effective_user_id is None or requested_user_id != int(effective_user_id):
            if not principal.is_admin():
                raise HTTPException(status_code=403, detail="Admin access required")
            effective_user_id = requested_user_id

    if effective_user_id is None:
        raise HTTPException(status_code=400, detail="User-scoped principal required.")

    stmt = (
        select(BridgeUserMembership)
        .where(BridgeUserMembership.user_id == int(effective_user_id))
        .order_by(BridgeUserMembership.last_seen_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()

    machines = []
    for row in rows:
        meta = dict(row.meta) if isinstance(row.meta, dict) else {}
        status = str(row.status or "offline")
        model_value = meta.get("model")
        host_value = meta.get("client_host")
        machines.append(
            BridgeMachineEntry(
                bridge_client_id=str(row.bridge_client_id),
                bridge_id=str(row.bridge_id) if row.bridge_id else None,
                agent_type=row.agent_type,
                status=status,
                online=status == "online",
                first_seen_at=row.first_seen_at.isoformat() if row.first_seen_at else "",
                last_seen_at=row.last_seen_at.isoformat() if row.last_seen_at else "",
                last_connected_at=row.last_connected_at.isoformat() if row.last_connected_at else None,
                last_disconnected_at=(
                    row.last_disconnected_at.isoformat() if row.last_disconnected_at else None
                ),
                model=str(model_value) if isinstance(model_value, str) and model_value.strip() else None,
                client_host=str(host_value) if isinstance(host_value, str) and host_value.strip() else None,
            )
        )

    return BridgeMachinesResponse(total=len(machines), machines=machines)


class TerminateAgentResponse(BaseModel):
    ok: bool
    bridge_client_id: str
    message: str


@router.post("/agents/bridge/{bridge_client_id}/terminate", response_model=TerminateAgentResponse)
async def terminate_agent(bridge_client_id: str) -> TerminateAgentResponse:
    """Disconnect a remote agent bridge by closing its WebSocket."""
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge

    agent = None
    for a in remote_cmd_bridge.get_agents():
        if a.bridge_client_id == bridge_client_id:
            agent = a
            break

    if not agent:
        return TerminateAgentResponse(
            ok=False,
            bridge_client_id=bridge_client_id,
            message="Bridge client not found",
        )

    try:
        # Tell the bridge to shut down gracefully (don't reconnect)
        await agent.websocket.send_json({"type": "shutdown"})
        await agent.websocket.close(code=1000, reason="Terminated by admin")
    except Exception:
        pass

    remote_cmd_bridge.disconnect(bridge_client_id)
    return TerminateAgentResponse(ok=True, bridge_client_id=bridge_client_id, message="Disconnected")


# =============================================================================
# Agent Writes — plan/notification audit trail for agent-attributed changes
# =============================================================================


class AgentWriteEntry(BaseModel):
    id: str
    domain: str  # "plan" | "prompt" | "notification" | ...
    entity_id: str
    entity_label: str
    event_type: str
    field: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    commit_sha: Optional[str] = None
    actor: str
    timestamp: str


class AgentWritesResponse(BaseModel):
    entries: List[AgentWriteEntry]
    total: int


@router.get("/agents/writes", response_model=AgentWritesResponse)
async def get_agent_writes(
    _user: CurrentUser,
    days: int = Query(7, ge=1, le=90),
    limit: int = Query(100, ge=1, le=500),
    agent_id: Optional[str] = Query(None, description="Filter by specific agent ID"),
    domain: Optional[str] = Query(None, description="Filter by domain: plan, prompt, or all"),
    db: AsyncSession = Depends(get_database),
):
    """Query mutation events attributed to agents across all domains."""
    from pixsim7.backend.main.domain.platform.entity_audit import EntityAudit

    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)

    stmt = (
        select(EntityAudit)
        .where(EntityAudit.timestamp >= cutoff)
        .where(EntityAudit.actor.like("agent:%"))
    )
    if agent_id:
        stmt = stmt.where(EntityAudit.actor == f"agent:{agent_id}")
    if domain:
        stmt = stmt.where(EntityAudit.domain == domain)
    stmt = stmt.order_by(EntityAudit.timestamp.desc()).limit(limit)

    rows = (await db.execute(stmt)).scalars().all()
    entries = [
        AgentWriteEntry(
            id=str(row.id),
            domain=row.domain,
            entity_id=row.entity_id,
            entity_label=row.entity_label or row.entity_id,
            event_type=row.action,
            field=row.field,
            old_value=row.old_value,
            new_value=row.new_value,
            commit_sha=row.commit_sha,
            actor=row.actor,
            timestamp=row.timestamp.isoformat() if row.timestamp else "",
        )
        for row in rows
    ]

    return AgentWritesResponse(entries=entries, total=len(entries))


# =============================================================================
# CLI Token — agent-identity-aware
# =============================================================================


class CliTokenResponse(BaseModel):
    token: str
    expires_in_hours: int
    scope: str
    agent_id: Optional[str] = None
    command: str = Field(description="Ready-to-paste Claude CLI command")


@router.post("/agents/cli-token", response_model=CliTokenResponse)
async def generate_cli_token(
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
    scope: str = Query("dev", description="Tool scope: 'user' or 'dev'"),
    hours: int = Query(24, ge=1, le=168, description="Token lifetime in hours (max 7 days)"),
) -> CliTokenResponse:
    """Generate a CLI agent token for standalone Claude use with MCP tools.

    Mints a proper agent token with agent_id + on_behalf_of so all API
    calls made by the CLI agent are distinguishable from human actions.
    """
    import secrets
    from pixsim7.backend.main.domain import UserSession
    from pixsim7.backend.main.shared.auth import create_agent_token, decode_access_token

    agent_id = f"cli-{secrets.token_hex(4)}"
    effective_user_id = user.user_id

    token = create_agent_token(
        agent_id=agent_id,
        agent_type="cli",
        on_behalf_of=effective_user_id,
        ttl_hours=hours,
    )

    claims = decode_access_token(token)
    token_id = claims.get("jti")
    if not isinstance(token_id, str) or not token_id.strip():
        raise HTTPException(status_code=500, detail="minted_cli_token_missing_jti")

    exp_claim = claims.get("exp")
    if isinstance(exp_claim, (int, float)):
        expires_at = datetime.fromtimestamp(exp_claim, tz=timezone.utc)
    elif isinstance(exp_claim, datetime):
        expires_at = exp_claim if exp_claim.tzinfo else exp_claim.replace(tzinfo=timezone.utc)
    else:
        raise HTTPException(status_code=500, detail="minted_cli_token_missing_exp")

    if effective_user_id is None and settings.jwt_require_session:
        raise HTTPException(
            status_code=400,
            detail="cli_token_requires_user_binding_in_strict_mode",
        )

    if effective_user_id is not None:
        db.add(
            UserSession(
                user_id=int(effective_user_id),
                token_id=token_id,
                expires_at=expires_at,
                client_type="agent_token",
                client_name=f"agent:{agent_id}",
                user_agent="agent/bridge",
            )
        )
        await db.commit()

    command = (
        f'PIXSIM_API_TOKEN="{token}" PIXSIM_SCOPE="{scope}" '
        f"claude --mcp-config pixsim-mcp.json"
    )

    return CliTokenResponse(
        token=token,
        expires_in_hours=hours,
        scope=scope,
        agent_id=agent_id,
        command=command,
    )


class StartBridgeRequest(BaseModel):
    pool_size: int = Field(1, ge=1, le=5, description="Number of sessions for primary engine")
    engines: Optional[str] = Field(None, description="Comma-separated engines (e.g. claude,codex). Auto-detects if omitted.")
    extra_args: Optional[str] = Field(None, description="Extra CLI args passed to agent sessions")
    resume_session_id: Optional[str] = Field(None, description="Session UUID to resume")


class StartBridgeResponse(BaseModel):
    ok: bool
    pid: Optional[int] = None
    message: str


_server_bridge_process: Optional[Any] = None


@router.post("/agents/bridge/start", response_model=StartBridgeResponse)
async def start_server_bridge(
    payload: StartBridgeRequest,
    authorization: Optional[str] = Header(None),
) -> StartBridgeResponse:
    """Start a server-managed agent bridge.

    If authenticated, creates a user-scoped bridge with the user's token.
    Otherwise creates a shared/admin bridge.
    """
    global _server_bridge_process
    import subprocess
    import sys

    if _server_bridge_process and _server_bridge_process.poll() is None:
        return StartBridgeResponse(
            ok=False,
            pid=_server_bridge_process.pid,
            message=f"Bridge already running (PID: {_server_bridge_process.pid})",
        )

    # Resolve user for scoping (supports agent tokens with on_behalf_of).
    user_id = await _resolve_effective_user_id_from_authorization(authorization)
    bridge_token: Optional[str] = None

    # Mint a bridge token so the subprocess connects as this user
    if user_id is not None:
        try:
            from pixsim7.backend.main.services.llm.remote_cmd_bridge import _mint_bridge_token
            bridge_token = _mint_bridge_token(user_id)
        except Exception:
            pass

    from pixsim7.backend.main.shared.config import _resolve_repo_root
    repo_root = str(_resolve_repo_root())

    # Build the WS URL with token for user-scoped bridge
    backend_port = os.environ.get("BACKEND_PORT", "8000")
    ws_url = f"ws://localhost:{backend_port}/api/v1/ws/agent-cmd"
    if bridge_token:
        ws_url += f"?token={bridge_token}"

    cmd = [sys.executable, "-m", "pixsim7.client", "--url", ws_url, "--pool-size", str(payload.pool_size)]
    if payload.engines:
        cmd.extend(["--engines", payload.engines])
    if payload.resume_session_id:
        cmd.extend(["--resume-session", payload.resume_session_id])
    if payload.extra_args:
        cmd.extend(payload.extra_args.split())

    env = dict(os.environ)
    pythonpath = env.get("PYTHONPATH", "")
    if repo_root not in pythonpath:
        env["PYTHONPATH"] = repo_root + os.pathsep + pythonpath if pythonpath else repo_root
    # Foundation for future multi-managed bridge support:
    # isolate persisted bridge_client_id by scope instead of one global ~/.pixsim/bridge_id.
    env.setdefault(
        "PIXSIM_BRIDGE_ID_NAMESPACE",
        f"user_{user_id}" if user_id is not None else "shared",
    )

    try:
        _server_bridge_process = subprocess.Popen(
            cmd,
            cwd=repo_root,
            env=env,
        )
        scope = f"user:{user_id}" if user_id else "shared"
        return StartBridgeResponse(
            ok=True,
            pid=_server_bridge_process.pid,
            message=f"Bridge started ({scope}, PID: {_server_bridge_process.pid})",
        )
    except Exception as e:
        return StartBridgeResponse(ok=False, message=str(e))


@router.post("/agents/bridge/stop", response_model=StartBridgeResponse)
async def stop_server_bridge() -> StartBridgeResponse:
    """Stop the server-managed agent bridge."""
    global _server_bridge_process

    if not _server_bridge_process or _server_bridge_process.poll() is not None:
        _server_bridge_process = None
        return StartBridgeResponse(ok=False, message="No server bridge running")

    pid = _server_bridge_process.pid
    try:
        _server_bridge_process.terminate()
        _server_bridge_process.wait(timeout=5)
    except Exception:
        try:
            _server_bridge_process.kill()
        except Exception:
            pass

    _server_bridge_process = None
    return StartBridgeResponse(ok=True, pid=pid, message=f"Bridge stopped (PID: {pid})")


class SendMessageRequest(BaseModel):
    message: str = Field(..., description="Message/prompt to send to the remote agent")
    model: str = Field("default", description="Model identifier to pass to the agent")
    context: Optional[Dict[str, Any]] = Field(None, description="Optional context dict")
    timeout: int = Field(120, ge=10, le=600, description="Timeout in seconds")
    asset_ids: Optional[List[int]] = Field(None, description="Asset IDs to include as images (vision)")
    assistant_id: Optional[str] = Field(None, description="Assistant profile to use (resolves persona + model + scope)")
    bridge_session_id: Optional[str] = Field(None, description="Conversation session UUID to route to / resume")
    skip_persona: bool = Field(False, description="If true, do not inject the profile persona into the message")
    custom_instructions: Optional[str] = Field(None, description="User-supplied text appended to the system prompt for this session")
    user_token: Optional[str] = Field(None, description="Pre-minted agent token to inject into the task payload (for API tool auth)")
    focus: Optional[List[str]] = Field(None, description="Capability focus areas — filters which endpoints are included in the system prompt")
    engine: str = Field("claude", description="Agent engine command to use (claude, codex, etc.)")
    session_policy: Optional[str] = Field(
        None,
        description="Session policy override: ephemeral | scoped | persistent",
    )
    scope_key: Optional[str] = Field(
        None,
        description="Scope key for scoped session routing (e.g. plan:auth-refactor)",
    )

    @model_validator(mode="before")
    @classmethod
    def _reject_legacy_session_key(cls, data: Any) -> Any:
        if isinstance(data, dict) and "claude_session_id" in data:
            raise ValueError("claude_session_id is retired; use bridge_session_id")
        return data


class SendMessageResponse(BaseModel):
    ok: bool
    bridge_client_id: str
    response: Optional[str] = None
    error: Optional[str] = None
    duration_ms: Optional[int] = None
    bridge_session_id: Optional[str] = Field(None, description="Conversation session UUID (canonical)")


class _SendContext:
    """Resolved auth + profile + provider context shared by send handlers."""
    __slots__ = ("user_id", "raw_token", "system_prompt", "profile_prompt",
                 "profile_config", "provider_id", "model_id", "method")

    def __init__(self, user_id: Optional[int], raw_token: Optional[str],
                 system_prompt: Optional[str],
                 profile_prompt: Optional[str], profile_config: Optional[dict],
                 provider_id: str, model_id: str, method: str):
        self.user_id = user_id
        self.raw_token = raw_token
        self.system_prompt = system_prompt
        self.profile_prompt = profile_prompt
        self.profile_config = profile_config
        self.provider_id = provider_id
        self.model_id = model_id
        self.method = method


async def _resolve_send_context(
    payload: SendMessageRequest,
    authorization: Optional[str],
    db: AsyncSession,
) -> _SendContext:
    """Auth, profile, custom instructions, and provider — called once per send."""
    from pixsim7.backend.main.api.dependencies import get_auth_service, _extract_bearer_token

    user_id: Optional[int] = None
    raw_token: Optional[str] = None
    if authorization:
        try:
            raw_token = _extract_bearer_token(authorization)
            auth_service = get_auth_service()
            user = await auth_service.verify_token(raw_token)
            user_id = user.id if user else None
        except Exception:
            pass

    # Resolve unified agent profile (persona, model override, tool scope)
    profile_prompt: Optional[str] = None
    profile_config: Optional[dict] = None
    try:
        from pixsim7.backend.main.api.v1.agent_profiles import resolve_agent_profile
        profile = await resolve_agent_profile(db, user_id or 0, payload.assistant_id)
        if profile:
            if not payload.skip_persona:
                profile_prompt = profile.system_prompt
            if profile.model_id:
                payload.model = profile.model_id
            if profile.config:
                profile_config = profile.config
    except Exception:
        pass

    # Append user-supplied custom instructions
    if payload.custom_instructions:
        if profile_prompt:
            profile_prompt += "\n\n" + payload.custom_instructions
        else:
            profile_prompt = payload.custom_instructions

    # Build system prompt with focus filtering
    system_prompt = build_user_system_prompt(focus=payload.focus)

    # Resolve provider, model, and delivery method
    provider_id, model_id, method = await _resolve_assistant_provider(user_id)
    if payload.engine == "api":
        method = "api"

    return _SendContext(
        user_id=user_id, raw_token=raw_token,
        system_prompt=system_prompt,
        profile_prompt=profile_prompt, profile_config=profile_config,
        provider_id=provider_id, model_id=model_id, method=method,
    )


@router.get("/agents/chat-sessions")
async def list_chat_sessions(
    engine: Optional[str] = Query(None, description="Filter by engine (claude, codex, api)"),
    limit: int = Query(20, ge=1, le=100),
    include_empty: bool = Query(False, description="Include sessions with zero messages"),
    user: Optional[Any] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_database),
) -> Dict[str, Any]:
    """List recent chat sessions for the /resume picker, scoped by engine."""
    from pixsim7.backend.main.domain.platform.agent_profile import ChatSession

    if not include_empty:
        # Remove stale startup placeholders ("CLI session (...)") with no messages.
        prune_stmt = (
            update(ChatSession)
            .where(ChatSession.status == "active")
            .where(ChatSession.message_count == 0)
            .where(ChatSession.label.like("CLI session (%"))
            .values(status="archived")
        )
        if user:
            prune_stmt = prune_stmt.where(or_(ChatSession.user_id == user.id, ChatSession.user_id == 0))
        if engine:
            prune_stmt = prune_stmt.where(ChatSession.engine == engine)
        prune_result = await db.execute(prune_stmt)
        if (getattr(prune_result, "rowcount", 0) or 0) > 0:
            await db.commit()

    stmt = (
        select(ChatSession)
        .where(ChatSession.status == "active")
    )
    if user:
        # Include user's own sessions + shared sessions (user_id=0)
        stmt = stmt.where(or_(ChatSession.user_id == user.id, ChatSession.user_id == 0))
    if engine:
        stmt = stmt.where(ChatSession.engine == engine)
    if not include_empty:
        stmt = stmt.where(ChatSession.message_count > 0)
    stmt = stmt.order_by(ChatSession.last_used_at.desc()).limit(limit)

    sessions = (await db.execute(stmt)).scalars().all()
    return {
        "sessions": [
            {
                "id": s.id,
                "engine": s.engine,
                "profile_id": s.profile_id,
                "scope_key": s.scope_key,
                "last_plan_id": s.last_plan_id,
                "last_contract_id": s.last_contract_id,
                "label": s.label,
                "message_count": s.message_count,
                "last_used_at": s.last_used_at.isoformat(),
                "created_at": s.created_at.isoformat(),
            }
            for s in sessions
        ],
    }


@router.delete("/agents/chat-sessions/{session_id}")
async def archive_chat_session(
    session_id: str,
    db: AsyncSession = Depends(get_database),
) -> Dict[str, Any]:
    """Archive a chat session (hide from /resume picker)."""
    from pixsim7.backend.main.domain.platform.agent_profile import ChatSession

    session = await db.get(ChatSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.status = "archived"
    await db.commit()
    return {"ok": True}


class RegisterSessionRequest(BaseModel):
    session_id: str = Field(..., description="Session UUID to register")
    engine: str = Field("claude", description="Agent engine")
    label: str = Field("CLI session", description="Display label")
    profile_id: Optional[str] = Field(None, description="Agent profile ID to associate")
    source: Optional[str] = Field(None, description="Registration source (mcp, hook, etc.)")


@router.post("/agents/register-chat-session")
async def register_chat_session(
    payload: RegisterSessionRequest,
    _user: Optional[Any] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_database),
) -> Dict[str, Any]:
    """Register a CLI session for tracking (idempotent).

    Called by the MCP server on startup so standalone CLI sessions
    appear in the AI Assistant's session list and resume picker.
    """
    from pixsim7.backend.main.domain.platform.agent_profile import ChatSession
    from pixsim7.backend.main.shared.datetime_utils import utcnow

    # principal.user_id returns on_behalf_of for agent tokens, id for users
    user_id = 0
    if _user:
        user_id = getattr(_user, 'user_id', None) or getattr(_user, 'id', 0) or 0

    existing = await db.get(ChatSession, payload.session_id)
    if existing:
        existing.last_used_at = utcnow()
        if payload.profile_id and not existing.profile_id:
            existing.profile_id = payload.profile_id
        if payload.label and payload.label != existing.label:
            existing.label = payload.label
        await db.commit()
        return {"ok": True, "created": False, "session_id": existing.id}

    session = ChatSession(
        id=payload.session_id,
        user_id=user_id,
        engine=payload.engine,
        profile_id=payload.profile_id,
        label=payload.label or "CLI session",
        message_count=0,
    )
    db.add(session)
    await db.commit()
    return {"ok": True, "created": True, "session_id": session.id}


@router.get("/agents/system-prompt-preview")
async def get_system_prompt_preview(
    profile_id: Optional[str] = Query(None, description="Profile ID to include persona"),
    focus: Optional[str] = Query(None, description="Comma-separated focus capability tags to filter the prompt"),
    user: Optional[Any] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_database),
) -> Dict[str, Any]:
    """Return the effective system prompt and available focus areas for the chat UI.

    Combines the base assistant prompt with the profile persona (if any).
    Also returns the focus areas from the user.assistant contract so the
    frontend can render toggleable category chips.
    """
    focus_list = [f.strip() for f in focus.split(",") if f.strip()] if focus else None
    base = build_user_system_prompt(focus=focus_list)
    persona: Optional[str] = None

    if profile_id:
        try:
            from pixsim7.backend.main.api.v1.agent_profiles import resolve_agent_profile
            profile = await resolve_agent_profile(db, user.id if user else 0, profile_id)
            if profile and profile.system_prompt:
                persona = profile.system_prompt
        except Exception:
            pass

    # Expose focus areas from user.assistant.provides only.
    # Convention: "parent:child" in related contracts → nested under parent
    # if the parent is in user.assistant.provides.
    focus_areas: List[Dict[str, Any]] = []
    contract = meta_contract_registry.get_or_none("user.assistant")
    if contract and contract.provides:
        # Collect child tags from related contracts (parent:child convention)
        parent_children: Dict[str, List[Dict[str, str]]] = {}
        for related_id in (contract.relates_to or []):
            related = meta_contract_registry.get_or_none(related_id)
            if not related:
                continue
            for cap in related.provides:
                if ":" in cap:
                    parent, child = cap.split(":", 1)
                    if parent in contract.provides:
                        parent_children.setdefault(parent, []).append({
                            "id": cap,
                            "label": child.replace("_", " ").title(),
                        })

        for cap in contract.provides:
            entry: Dict[str, Any] = {
                "id": cap,
                "label": cap.replace("_", " ").title(),
            }
            if cap in parent_children:
                entry["children"] = parent_children[cap]
            focus_areas.append(entry)

    return {"base_prompt": base, "persona": persona, "focus_areas": focus_areas}


@router.get("/agents/bridge/models")
async def get_bridge_models(
    agent_type: Optional[str] = Query(None, description="Filter by agent type (e.g. codex)"),
) -> Dict[str, Any]:
    """Get available models reported by connected bridge agents."""
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge

    models = remote_cmd_bridge.get_available_models(agent_type=agent_type)
    return {"models": models}


@router.get("/agents/bridge/active-task")
async def get_active_task(
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    """Check if there's an active task (for reconnect after SSE drop).

    Returns the active task status or completed result if available.
    """
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge
    from pixsim7.backend.main.api.dependencies import get_auth_service, _extract_bearer_token

    user_id: Optional[int] = None
    if authorization:
        try:
            raw_token = _extract_bearer_token(authorization)
            auth_service = get_auth_service()
            user = await auth_service.verify_token(raw_token)
            user_id = user.id if user else None
        except Exception:
            pass

    # Check for active (in-progress) task
    active = remote_cmd_bridge.get_active_task_for_user(user_id)
    if active:
        return {"status": "active", **active}

    return {"status": "idle"}


@router.get("/agents/bridge/task-result/{task_id}")
async def get_task_result(task_id: str) -> Dict[str, Any]:
    """Retrieve a completed task result (cached after SSE drop)."""
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge

    result = remote_cmd_bridge.pop_completed_result(task_id)
    if result:
        session_id = result.get("bridge_session_id")
        response_text = (
            result.get("edited_prompt")
            or result.get("response")
            or result.get("output", "")
        )
        return {
            "status": "completed",
            "ok": True,
            "response": response_text,
            "bridge_session_id": session_id,
        }
    return {"status": "not_found"}


@router.post("/agents/bridge/send", response_model=SendMessageResponse)
async def send_message_to_agent(
    payload: SendMessageRequest,
    authorization: Optional[str] = None,
    db: AsyncSession = Depends(get_database),
) -> SendMessageResponse:
    """Send a message to the AI assistant.

    Routes based on the user's configured assistant_chat provider:
    - remote-cmd-llm: dispatches to the Claude CLI bridge (MCP tools)
    - openai-llm / anthropic-llm: calls the API directly (text chat)
    """
    import time

    ctx = await _resolve_send_context(payload, authorization, db)
    start = time.monotonic()

    if ctx.method == "remote":
        return await _send_via_bridge(
            payload=payload, user_id=ctx.user_id, raw_token=ctx.raw_token,
            start=start, profile_prompt=ctx.profile_prompt, profile_config=ctx.profile_config,
            system_prompt=ctx.system_prompt,
        )

    return await _send_via_direct_api(
        payload=payload, provider_id=ctx.provider_id, model_id=ctx.model_id,
        user_id=ctx.user_id, start=start, profile_prompt=ctx.profile_prompt,
        system_prompt=ctx.system_prompt,
    )


@router.post("/agents/bridge/send-stream")
async def send_message_to_agent_stream(
    payload: SendMessageRequest,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_database),
):
    """SSE streaming variant of bridge/send.

    Yields NDJSON lines:
      {"type":"heartbeat","action":"tool_use","detail":"Using tool: Read"}
      {"type":"result","ok":true,"response":"...","duration_ms":1234}
    """
    import json as _json
    import time

    from fastapi.responses import StreamingResponse

    ctx = await _resolve_send_context(payload, authorization, db)

    # ── Non-bridge: fall back to non-streaming response wrapped as single SSE event ──
    if ctx.method != "remote":
        start = time.monotonic()
        resp = await _send_via_direct_api(
            payload=payload, provider_id=ctx.provider_id, model_id=ctx.model_id,
            user_id=ctx.user_id, start=start, profile_prompt=ctx.profile_prompt,
            system_prompt=ctx.system_prompt,
        )

        async def _single():
            yield f"data: {_json.dumps(resp.model_dump())}\n\n"

        return StreamingResponse(_single(), media_type="text/event-stream")

    # ── Bridge streaming path ──
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge

    if remote_cmd_bridge.connected_count == 0:
        async def _err():
            yield f"data: {_json.dumps({'type': 'result', 'ok': False, 'bridge_client_id': '', 'error': 'No bridge running. Start one from the AI Agents panel.'})}\n\n"
        return StreamingResponse(_err(), media_type="text/event-stream")

    agent = remote_cmd_bridge.get_available_agent(user_id=ctx.user_id)
    if not agent:
        # All bridges at capacity — check if any are connected at all
        agents = remote_cmd_bridge.get_agents(user_id=ctx.user_id)
        if not agents:
            async def _err2():
                yield f"data: {_json.dumps({'type': 'result', 'ok': False, 'bridge_client_id': '', 'error': 'No bridge available for your account.'})}\n\n"
            return StreamingResponse(_err2(), media_type="text/event-stream")
        # Bridges exist but all at max capacity — pick least-loaded
        agent = min(agents, key=lambda a: a.active_tasks)

    from pixsim7.backend.main.shared.agent_dispatch import build_task_payload as _build_payload
    effective_token = payload.user_token or (ctx.raw_token if ctx.raw_token and ctx.user_id is not None else None)
    task_payload = _build_payload(
        prompt=payload.message,
        model=payload.model,
        context=payload.context or {},
        engine=payload.engine,
        system_prompt=ctx.system_prompt,
        user_token=effective_token,
        profile_prompt=ctx.profile_prompt,
        profile_config=ctx.profile_config,
        bridge_session_id=payload.bridge_session_id,
        session_policy=payload.session_policy,
        scope_key=payload.scope_key,
    )

    if payload.asset_ids:
        is_local = agent.metadata.get("local", False) or _is_local_agent(agent)
        if is_local:
            image_paths = await _resolve_asset_image_paths(payload.asset_ids)
            if image_paths:
                task_payload["image_paths"] = image_paths
        else:
            images = await _fetch_asset_images_b64(payload.asset_ids)
            if images:
                task_payload["images"] = images

    start = time.monotonic()
    bridge_client_id = agent.bridge_client_id
    chat_scope_key, chat_plan_id, chat_contract_id = _extract_chat_session_scope(payload)

    async def _stream():
        try:
            async for event in remote_cmd_bridge.dispatch_task_streaming(
                task_payload,
                timeout=payload.timeout,
                user_id=ctx.user_id,
                bridge_client_id=bridge_client_id,
            ):
                if event.get("type") == "heartbeat":
                    yield f"data: {_json.dumps({'type': 'heartbeat', 'action': event.get('action', ''), 'detail': event.get('detail', '')})}\n\n"
                elif event.get("type") == "result":
                    duration_ms = int((time.monotonic() - start) * 1000)
                    response_text = (
                        event.get("edited_prompt")
                        or event.get("response")
                        or event.get("output", "")
                    )
                    cli_session_id = event.get("bridge_session_id")
                    if cli_session_id:
                        import asyncio as _asyncio
                        _asyncio.ensure_future(_upsert_chat_session(
                            session_id=cli_session_id, user_id=ctx.user_id or 0,
                            engine=payload.engine, label=payload.message[:60],
                            profile_id=payload.assistant_id,
                            scope_key=chat_scope_key,
                            last_plan_id=chat_plan_id,
                            last_contract_id=chat_contract_id,
                        ))
                    yield f"data: {_json.dumps({'type': 'result', 'ok': True, 'bridge_client_id': bridge_client_id, 'response': response_text, 'bridge_session_id': cli_session_id, 'duration_ms': duration_ms})}\n\n"
        except Exception as e:
            duration_ms = int((time.monotonic() - start) * 1000)
            yield f"data: {_json.dumps({'type': 'result', 'ok': False, 'bridge_client_id': bridge_client_id, 'error': str(e), 'duration_ms': duration_ms})}\n\n"

    return StreamingResponse(_stream(), media_type="text/event-stream")


# =============================================================================
# Internal helpers — chat session tracking
# =============================================================================


def _normalize_scope_value(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed or None


def _extract_chat_session_scope(payload: SendMessageRequest) -> tuple[Optional[str], Optional[str], Optional[str]]:
    context = payload.context if isinstance(payload.context, dict) else {}

    scope_key = (
        _normalize_scope_value(payload.scope_key)
        or _normalize_scope_value(context.get("scope_key"))
        or _normalize_scope_value(context.get("scopeKey"))
    )
    plan_id = (
        _normalize_scope_value(context.get("plan_id"))
        or _normalize_scope_value(context.get("planId"))
        or _normalize_scope_value(context.get("x_plan_id"))
        or _normalize_scope_value(context.get("xPlanId"))
    )
    contract_id = (
        _normalize_scope_value(context.get("contract_id"))
        or _normalize_scope_value(context.get("contractId"))
        or _normalize_scope_value(context.get("contract"))
    )

    if scope_key is None:
        if plan_id:
            scope_key = f"plan:{plan_id}"
        elif contract_id:
            scope_key = f"contract:{contract_id}"

    if scope_key and plan_id is None and scope_key.startswith("plan:"):
        maybe_plan = scope_key.split(":", 1)[1].strip()
        if maybe_plan:
            plan_id = maybe_plan
    if scope_key and contract_id is None and scope_key.startswith("contract:"):
        maybe_contract = scope_key.split(":", 1)[1].strip()
        if maybe_contract:
            contract_id = maybe_contract

    return scope_key, plan_id, contract_id


async def _upsert_chat_session(
    session_id: str,
    user_id: int,
    engine: str,
    label: str,
    profile_id: Optional[str] = None,
    scope_key: Optional[str] = None,
    last_plan_id: Optional[str] = None,
    last_contract_id: Optional[str] = None,
) -> None:
    """Create or update a chat session record (fire-and-forget)."""
    try:
        from pixsim7.backend.main.domain.platform.agent_profile import ChatSession
        from pixsim7.backend.main.infrastructure.database.session import AsyncSessionLocal
        from pixsim7.backend.main.shared.datetime_utils import utcnow

        async with AsyncSessionLocal() as db:
            existing = await db.get(ChatSession, session_id)
            if existing:
                existing.message_count += 1
                existing.last_used_at = utcnow()
                if label and label != existing.label:
                    existing.label = label
                if profile_id is not None:
                    existing.profile_id = profile_id
                if scope_key is not None:
                    existing.scope_key = scope_key
                if last_plan_id is not None:
                    existing.last_plan_id = last_plan_id
                if last_contract_id is not None:
                    existing.last_contract_id = last_contract_id
            else:
                db.add(ChatSession(
                    id=session_id,
                    user_id=user_id,
                    engine=engine,
                    profile_id=profile_id,
                    scope_key=scope_key,
                    last_plan_id=last_plan_id,
                    last_contract_id=last_contract_id,
                    label=label or "Untitled",
                    message_count=1,
                ))
            await db.commit()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("chat_session_upsert_failed: %s", e)


# =============================================================================
# Internal helpers — assistant routing
# =============================================================================


async def _resolve_assistant_provider(user_id: Optional[int]) -> tuple[str, str, str]:
    """Resolve (provider_id, model_id, method) for assistant_chat capability."""
    from pixsim7.backend.main.shared.schemas.ai_model_schemas import AiModelCapability
    from pixsim7.backend.main.services.ai_model.defaults import FALLBACK_DEFAULTS
    from pixsim7.backend.main.services.ai_model.registry import ai_model_registry

    fallback_model, fallback_method = FALLBACK_DEFAULTS.get(
        AiModelCapability.ASSISTANT_CHAT, ("anthropic:sonnet", "remote")
    )

    # Try user-scoped default
    if user_id is not None:
        try:
            from pixsim7.backend.main.api.dependencies import get_database
            from pixsim7.backend.main.services.ai_model.defaults import get_default_model

            db = get_database()
            model_id, method = await get_default_model(
                db, AiModelCapability.ASSISTANT_CHAT, "user", str(user_id)
            )
            model = ai_model_registry.get_or_none(model_id)
            if model and model.provider_id:
                resolved_method = method or (model.supported_methods[0] if model.supported_methods else "api")
                return model.provider_id, model_id, resolved_method
        except Exception:
            pass

    # Global default
    model = ai_model_registry.get_or_none(fallback_model)
    if model and model.provider_id:
        resolved_method = fallback_method or (model.supported_methods[0] if model.supported_methods else "api")
        return model.provider_id, fallback_model, resolved_method

    return "anthropic", fallback_model, fallback_method or "remote"


async def _send_via_bridge(
    payload: SendMessageRequest,
    user_id: Optional[int],
    raw_token: Optional[str],
    start: float,
    profile_prompt: Optional[str] = None,
    profile_config: Optional[dict] = None,
    system_prompt: Optional[str] = None,
) -> SendMessageResponse:
    """Route message through the Claude CLI bridge (MCP tools)."""
    import time
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge

    if remote_cmd_bridge.connected_count == 0:
        return SendMessageResponse(
            ok=False,
            bridge_client_id="",
            error="No bridge running. Start one from the AI Agents panel.",
        )

    agent = remote_cmd_bridge.get_available_agent(user_id=user_id)
    if not agent:
        agents = remote_cmd_bridge.get_agents(user_id=user_id)
        agent = agents[0] if agents else None
    if not agent:
        if user_id is not None:
            return SendMessageResponse(
                ok=False,
                bridge_client_id="",
                error="No bridge available for your account. Start a user-scoped bridge or ask an admin.",
            )
        return SendMessageResponse(ok=False, bridge_client_id="", error="All agents are busy")

    from pixsim7.backend.main.shared.agent_dispatch import build_task_payload as build_bridge_task_payload
    effective_token = payload.user_token or (raw_token if raw_token and user_id is not None else None)
    task_payload = build_bridge_task_payload(
        prompt=payload.message,
        model=payload.model,
        context=payload.context or {},
        engine=payload.engine,
        system_prompt=system_prompt,
        user_token=effective_token,
        profile_prompt=profile_prompt,
        profile_config=profile_config,
        bridge_session_id=payload.bridge_session_id,
        session_policy=payload.session_policy,
        scope_key=payload.scope_key,
    )
    chat_scope_key, chat_plan_id, chat_contract_id = _extract_chat_session_scope(payload)

    # Attach asset images for vision
    if payload.asset_ids:
        is_local = agent.metadata.get("local", False) or _is_local_agent(agent)
        if is_local:
            # Same machine — send file paths, bridge reads directly
            image_paths = await _resolve_asset_image_paths(payload.asset_ids)
            if image_paths:
                task_payload["image_paths"] = image_paths
        else:
            # Remote bridge — send base64 data
            images = await _fetch_asset_images_b64(payload.asset_ids)
            if images:
                task_payload["images"] = images

    try:
        result = await remote_cmd_bridge.dispatch_task_to_bridge_client(
            agent.bridge_client_id,
            task_payload,
            timeout=payload.timeout,
            user_id=user_id,
        )
        duration_ms = int((time.monotonic() - start) * 1000)
        response_text = (
            result.get("edited_prompt")
            or result.get("response")
            or result.get("output", "")
        )
        # Track session for /resume
        cli_session_id = result.get("bridge_session_id")
        if cli_session_id:
            await _upsert_chat_session(
                session_id=cli_session_id,
                user_id=user_id or 0,
                engine=payload.engine,
                label=payload.message[:60],
                profile_id=payload.assistant_id,
                scope_key=chat_scope_key,
                last_plan_id=chat_plan_id,
                last_contract_id=chat_contract_id,
            )
        return SendMessageResponse(
            ok=True,
            bridge_client_id=agent.bridge_client_id,
            response=response_text,
            bridge_session_id=cli_session_id,
            duration_ms=duration_ms,
        )
    except Exception as e:
        duration_ms = int((time.monotonic() - start) * 1000)
        return SendMessageResponse(
            ok=False,
            bridge_client_id=agent.bridge_client_id,
            error=str(e),
            duration_ms=duration_ms,
        )


async def _send_via_direct_api(
    payload: SendMessageRequest,
    provider_id: str,
    model_id: str,
    user_id: Optional[int],
    start: float,
    profile_prompt: Optional[str] = None,
    system_prompt: Optional[str] = None,
) -> SendMessageResponse:
    """Route message directly through an LLM API (no bridge, no tools)."""
    import time

    effective_system = system_prompt or build_user_system_prompt()
    if profile_prompt:
        effective_system += f"\n\nPersona: {profile_prompt}"

    try:
        from pixsim7.backend.main.services.llm.providers import get_provider
        from pixsim7.backend.main.services.llm.models import LLMRequest

        # Provider IDs are now clean names (openai, anthropic)
        provider_name = provider_id
        if not provider_name:
            return SendMessageResponse(
                ok=False,
                bridge_client_id="direct",
                error=f"Direct API not supported for provider: {provider_id}",
            )

        # Extract model name from registry ID (e.g. "openai:gpt-4" -> "gpt-4")
        model_name = model_id.split(":", 1)[-1] if ":" in model_id else model_id

        provider = get_provider(provider_name)
        request = LLMRequest(
            prompt=payload.message,
            system_prompt=effective_system,
            model=model_name,
            max_tokens=2048,
        )
        response = await provider.generate(request)

        duration_ms = int((time.monotonic() - start) * 1000)
        return SendMessageResponse(
            ok=True,
            bridge_client_id="direct",
            response=response.text,
            duration_ms=duration_ms,
        )
    except Exception as e:
        duration_ms = int((time.monotonic() - start) * 1000)
        return SendMessageResponse(
            ok=False,
            bridge_client_id="direct",
            error=str(e),
            duration_ms=duration_ms,
        )


# =============================================================================
# Internal helpers — asset images for vision
# =============================================================================


def _is_local_agent(agent: "RemoteAgent") -> bool:
    """Check if the agent is connected from localhost."""
    try:
        peer = agent.websocket.client
        if peer and hasattr(peer, 'host'):
            return peer.host in ("127.0.0.1", "::1", "localhost")
    except Exception:
        pass
    # Server-managed bridges are always local
    return agent.bridge_client_id.startswith("shared-") or agent.user_id is None


async def _fetch_asset_images_b64(
    asset_ids: List[int], max_images: int = 4, max_size_bytes: int = 5_000_000
) -> List[Dict[str, str]]:
    """Fetch assets as base64 for remote bridges."""
    import base64
    from pathlib import Path

    images: List[Dict[str, str]] = []
    try:
        from pixsim7.backend.main.api.dependencies import get_database
        from pixsim7.backend.main.domain.assets.models import Asset
        db = get_database()

        for asset_id in asset_ids[:max_images]:
            asset = await db.get(Asset, asset_id)
            if not asset or not asset.local_path:
                continue
            mime = asset.mime_type or ""
            if not mime.startswith("image/"):
                continue
            path = Path(asset.local_path)
            if not path.exists() or path.stat().st_size > max_size_bytes:
                continue
            data = base64.b64encode(path.read_bytes()).decode("ascii")
            images.append({"media_type": mime, "data": data})
    except Exception:
        pass
    return images


async def _resolve_asset_image_paths(
    asset_ids: List[int], max_images: int = 4
) -> List[Dict[str, str]]:
    """Resolve asset IDs to local file paths for vision.

    Returns list of {"path": "/abs/path/to/image.png", "media_type": "image/png"}.
    The bridge reads files directly — no base64 over the network.
    """
    from pathlib import Path

    results: List[Dict[str, str]] = []
    try:
        from pixsim7.backend.main.api.dependencies import get_database
        from pixsim7.backend.main.domain.assets.models import Asset
        db = get_database()

        for asset_id in asset_ids[:max_images]:
            asset = await db.get(Asset, asset_id)
            if not asset or not asset.local_path:
                continue

            mime = asset.mime_type or ""
            if not mime.startswith("image/"):
                continue

            path = Path(asset.local_path)
            if not path.exists():
                continue

            results.append({"path": str(path.resolve()), "media_type": mime})

    except Exception:
        pass

    return results


# =============================================================================
# Internal helpers — system prompt
# =============================================================================


def build_user_system_prompt(focus: Optional[List[str]] = None) -> str:
    """Build a system prompt for the user-facing AI assistant.

    Args:
        focus: Optional list of capability tags (from the contract's ``provides``
               list, e.g. ``["asset_browsing", "generation_assistance"]``).
               When set, only endpoints tagged with at least one of these
               capabilities are included; this steers the agent toward the
               relevant tools without dumping the full endpoint catalog.
               When ``None``, all endpoints are included.

    The function walks the ``relates_to`` graph from ``user.assistant`` so
    that related contracts (e.g. ``game.authoring``) contribute their
    sub-endpoints when a matching focus tag is active.
    """
    contract = meta_contract_registry.get_or_none("user.assistant")

    lines = [
        "You are an AI assistant for the PixSim application.",
        "You help users with their assets, generations, game worlds, and prompts.",
        "",
        "You have MCP tools available that let you query and interact with the PixSim API.",
        "Use these tools to answer questions with real data — do not guess or say you lack access.",
        "",
    ]

    if contract and contract.provides:
        active_caps = focus if focus else contract.provides
        lines.append(f"Your capabilities: {', '.join(active_caps)}")
        lines.append("")

    # Collect endpoints.
    # - No focus: show only user.assistant's own endpoints (if any).
    # - Focus active: walk relates_to. For each related contract whose
    #   ``provides`` intersects the focus set:
    #     * Parent focus (no colon) matches a contract → include ALL its endpoints.
    #     * Sub-focus (has colon) matches → include only endpoints tagged with it.
    focus_set = set(focus) if focus else None
    collected: list = []

    # Own endpoints (tag-filtered when focus active)
    if contract and contract.sub_endpoints:
        for ep in contract.sub_endpoints:
            if focus_set is None or (ep.tags and focus_set.intersection(ep.tags)):
                collected.append(ep)

    # Related contract endpoints
    if focus_set and contract:
        for related_id in contract.relates_to:
            related = meta_contract_registry.get_or_none(related_id)
            if not related or not related.sub_endpoints:
                continue
            matched = focus_set.intersection(related.provides)
            if not matched:
                continue
            # If any matched focus is a parent tag (no colon), include all
            # endpoints from this contract. Otherwise filter by sub-focus tags.
            has_parent_match = any(":" not in f for f in matched)
            if has_parent_match:
                collected.extend(related.sub_endpoints)
            else:
                for ep in related.sub_endpoints:
                    if ep.tags and matched.intersection(ep.tags):
                        collected.append(ep)

    if collected:
        lines.append("Reference — relevant API endpoints:")
        for ep in collected:
            lines.append(f"  {ep.method} {ep.path} — {ep.summary}")
        lines.append("")

    lines.extend([
        "Guidelines:",
        "- When the user asks about status, counts, or lists — use the appropriate tool to fetch live data.",
        "- When the user asks to create or modify something — use tools, then confirm the result.",
        "- Always confirm before making destructive changes.",
        "- If a tool call fails, report the error clearly.",
        "- Be concise and helpful.",
    ])

    return "\n".join(lines)


def _sync_contract_versions() -> None:
    """Keep registry versions in sync with canonical contract version constants."""
    from pixsim7.backend.main.api.v1.prompts.meta import (
        PROMPT_ANALYSIS_CONTRACT_VERSION,
        PROMPT_AUTHORING_CONTRACT_VERSION,
    )
    from pixsim7.backend.main.api.v1.game_meta import (
        GAME_AUTHORING_CONTRACT_VERSION,
    )
    from pixsim7.backend.main.api.v1.meta_ui import (
        UI_CATALOG_CONTRACT_VERSION,
    )
    from pixsim7.backend.main.api.v1.dev_testing import (
        TESTING_CONTRACT_VERSION,
    )

    meta_contract_registry.update_version(
        "prompts.analysis", PROMPT_ANALYSIS_CONTRACT_VERSION
    )
    meta_contract_registry.update_version(
        "prompts.authoring", PROMPT_AUTHORING_CONTRACT_VERSION
    )
    meta_contract_registry.update_version(
        "game.authoring", GAME_AUTHORING_CONTRACT_VERSION
    )
    meta_contract_registry.update_version(
        "ui.catalog", UI_CATALOG_CONTRACT_VERSION
    )
    meta_contract_registry.update_version(
        "testing.catalog", TESTING_CONTRACT_VERSION
    )
