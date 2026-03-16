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
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database
from pixsim7.backend.main.domain.docs.models import AgentActivityLog
from pixsim7.backend.main.services.meta.contract_registry import (
    meta_contract_registry,
)
from pixsim7.backend.main.services.meta.agent_sessions import (
    agent_session_registry,
)
from pixsim7.backend.main.shared.datetime_utils import utcnow

router = APIRouter(prefix="/meta", tags=["meta"])


# =============================================================================
# Contract graph models
# =============================================================================


class ContractEndpointEntry(BaseModel):
    id: str
    method: str
    path: str
    summary: str


class AgentPresence(BaseModel):
    """Active agent on a contract node."""
    session_id: str
    agent_type: str
    status: str
    action: str
    detail: str
    plan_id: Optional[str] = None
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


@router.get("/contracts", response_model=ContractsIndexResponse)
async def list_contract_endpoints(
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
    _sync_prompt_contract_versions()

    active_sessions = agent_session_registry.get_active()

    contracts = []
    for c in meta_contract_registry.values():
        # Filter by audience if requested
        if audience and audience not in c.audience:
            continue

        agents_on_contract = [
            AgentPresence(
                session_id=s.session_id,
                agent_type=s.agent_type,
                status=s.status,
                action=s.current_action,
                detail=s.current_detail,
                plan_id=s.current_plan_id,
                duration_seconds=s.duration_seconds,
            )
            for s in active_sessions
            if s.current_contract_id == c.id
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
                )
                for ep in c.sub_endpoints
            ],
            active_agents=agents_on_contract,
        ))

    return ContractsIndexResponse(
        version="2026-03-16.1",
        generated_at=datetime.now(timezone.utc).isoformat(),
        contracts=contracts,
        total_active_agents=len(active_sessions),
    )


# =============================================================================
# Agent session endpoints
# =============================================================================


class AgentHeartbeatRequest(BaseModel):
    session_id: str = Field(..., description="Unique agent session identifier")
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
    current_plan_id: Optional[str] = None
    current_contract_id: Optional[str] = None
    current_action: str = ""
    current_detail: str = ""
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

    # Persist to DB
    db.add(AgentActivityLog(
        session_id=payload.session_id,
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
                current_plan_id=s.current_plan_id,
                current_contract_id=s.current_contract_id,
                current_action=s.current_action,
                current_detail=s.current_detail,
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
    agent_type: str
    status: str
    contract_id: Optional[str] = None
    plan_id: Optional[str] = None
    action: str
    detail: Optional[str] = None
    endpoint: Optional[str] = None
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
    plan_id: Optional[str] = Query(None, description="Filter by plan"),
    contract_id: Optional[str] = Query(None, description="Filter by contract"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_database),
) -> AgentHistoryResponse:
    """Query persistent agent activity log with filters."""
    stmt = select(AgentActivityLog).order_by(AgentActivityLog.timestamp.desc())

    if session_id:
        stmt = stmt.where(AgentActivityLog.session_id == session_id)
    if plan_id:
        stmt = stmt.where(AgentActivityLog.plan_id == plan_id)
    if contract_id:
        stmt = stmt.where(AgentActivityLog.contract_id == contract_id)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    rows = (await db.execute(stmt.offset(offset).limit(limit))).scalars().all()

    return AgentHistoryResponse(
        entries=[
            AgentHistoryEntry(
                session_id=r.session_id,
                agent_type=r.agent_type,
                status=r.status,
                contract_id=r.contract_id,
                plan_id=r.plan_id,
                action=r.action,
                detail=r.detail,
                endpoint=r.endpoint,
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


class RemoteAgentEntry(BaseModel):
    agent_id: str
    agent_type: str
    user_id: Optional[int] = None
    connected_at: str
    busy: bool
    tasks_completed: int


class RemoteAgentBridgeStatus(BaseModel):
    connected: int
    available: int
    agents: List[RemoteAgentEntry]


@router.get("/agents/bridge", response_model=RemoteAgentBridgeStatus)
async def get_bridge_status(
    authorization: Optional[str] = Header(None),
) -> RemoteAgentBridgeStatus:
    """Status of the remote agent command bridge.

    If authenticated, shows the user's bridges + shared bridges.
    If unauthenticated, shows all bridges.
    """
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge

    user_id: Optional[int] = None
    if authorization:
        try:
            from pixsim7.backend.main.api.dependencies import get_auth_service, _extract_bearer_token
            token = _extract_bearer_token(authorization)
            auth_service = get_auth_service()
            user = await auth_service.verify_token(token)
            user_id = user.id if user else None
        except Exception:
            pass

    agents = remote_cmd_bridge.get_agents(user_id=user_id)
    return RemoteAgentBridgeStatus(
        connected=len(agents),
        available=sum(1 for a in agents if not a.busy),
        agents=[
            RemoteAgentEntry(
                agent_id=a.agent_id,
                agent_type=a.agent_type,
                user_id=a.user_id,
                connected_at=a.connected_at.isoformat(),
                busy=a.busy,
                tasks_completed=a.tasks_completed,
            )
            for a in agents
        ],
    )


class TerminateAgentResponse(BaseModel):
    ok: bool
    agent_id: str
    message: str


@router.post("/agents/bridge/{agent_id}/terminate", response_model=TerminateAgentResponse)
async def terminate_agent(agent_id: str) -> TerminateAgentResponse:
    """Disconnect a remote agent bridge by closing its WebSocket."""
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge

    agent = None
    for a in remote_cmd_bridge.get_agents():
        if a.agent_id == agent_id:
            agent = a
            break

    if not agent:
        return TerminateAgentResponse(ok=False, agent_id=agent_id, message="Agent not found")

    try:
        await agent.websocket.close(code=1000, reason="Terminated by admin")
    except Exception:
        pass

    remote_cmd_bridge.disconnect(agent_id)
    return TerminateAgentResponse(ok=True, agent_id=agent_id, message="Disconnected")


class CliTokenResponse(BaseModel):
    token: str
    expires_in_hours: int
    scope: str
    command: str = Field(description="Ready-to-paste Claude CLI command")


@router.post("/agents/cli-token", response_model=CliTokenResponse)
async def generate_cli_token(
    user: CurrentUser,
    scope: str = Query("dev", description="Tool scope: 'user' or 'dev'"),
    hours: int = Query(24, ge=1, le=168, description="Token lifetime in hours (max 7 days)"),
) -> CliTokenResponse:
    """Generate a CLI token for standalone Claude use with MCP tools.

    Mint from the AI Agents panel, paste into terminal.
    """
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import _mint_bridge_token
    token = _mint_bridge_token(user.id, hours=hours)
    if not token:
        raise HTTPException(status_code=500, detail="Failed to generate token")

    command = (
        f'PIXSIM_API_TOKEN="{token}" PIXSIM_SCOPE="{scope}" '
        f"claude --mcp-config pixsim-mcp.json"
    )

    return CliTokenResponse(
        token=token,
        expires_in_hours=hours,
        scope=scope,
        command=command,
    )


class StartBridgeRequest(BaseModel):
    pool_size: int = Field(1, ge=1, le=5, description="Number of Claude sessions")
    claude_args: Optional[str] = Field(None, description="Extra args for Claude CLI")


class StartBridgeResponse(BaseModel):
    ok: bool
    pid: Optional[int] = None
    message: str


_server_bridge_process: Optional[Any] = None


@router.post("/agents/bridge/start", response_model=StartBridgeResponse)
async def start_server_bridge(payload: StartBridgeRequest) -> StartBridgeResponse:
    """Start a server-managed agent bridge (admin action).

    Spawns python -m pixsim7.client as a background subprocess on the server.
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

    from pixsim7.backend.main.shared.config import _resolve_repo_root
    repo_root = str(_resolve_repo_root())

    cmd = [sys.executable, "-m", "pixsim7.client", "--pool-size", str(payload.pool_size)]
    if payload.claude_args:
        cmd.extend(payload.claude_args.split())

    env = dict(os.environ)
    pythonpath = env.get("PYTHONPATH", "")
    if repo_root not in pythonpath:
        env["PYTHONPATH"] = repo_root + os.pathsep + pythonpath if pythonpath else repo_root

    try:
        _server_bridge_process = subprocess.Popen(
            cmd,
            cwd=repo_root,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return StartBridgeResponse(
            ok=True,
            pid=_server_bridge_process.pid,
            message=f"Bridge started (PID: {_server_bridge_process.pid})",
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


class SendMessageResponse(BaseModel):
    ok: bool
    agent_id: str
    response: Optional[str] = None
    error: Optional[str] = None
    duration_ms: Optional[int] = None


@router.post("/agents/bridge/send", response_model=SendMessageResponse)
async def send_message_to_agent(
    payload: SendMessageRequest,
    authorization: Optional[str] = None,
) -> SendMessageResponse:
    """Send a message to the AI assistant.

    Routes based on the user's configured assistant_chat provider:
    - remote-cmd-llm: dispatches to the Claude CLI bridge (MCP tools)
    - openai-llm / anthropic-llm: calls the API directly (text chat)
    """
    import time

    from pixsim7.backend.main.api.dependencies import get_auth_service, _extract_bearer_token

    # Resolve user
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

    # Resolve provider, model, and delivery method for assistant_chat
    provider_id, model_id, method = await _resolve_assistant_provider(user_id)

    start = time.monotonic()

    # ── Bridge path (method=remote) ──
    if method == "remote":
        return await _send_via_bridge(
            payload=payload,
            user_id=user_id,
            raw_token=raw_token,
            start=start,
        )

    # ── Direct API path (method=api) ──
    return await _send_via_direct_api(
        payload=payload,
        provider_id=provider_id,
        model_id=model_id,
        user_id=user_id,
        start=start,
    )


# =============================================================================
# Internal helpers — assistant routing
# =============================================================================


async def _resolve_assistant_provider(user_id: Optional[int]) -> tuple[str, str, str]:
    """Resolve (provider_id, model_id, method) for assistant_chat capability."""
    from pixsim7.backend.main.shared.schemas.ai_model_schemas import AiModelCapability
    from pixsim7.backend.main.services.ai_model.defaults import FALLBACK_DEFAULTS
    from pixsim7.backend.main.services.ai_model.registry import ai_model_registry

    fallback_model, fallback_method = FALLBACK_DEFAULTS.get(
        AiModelCapability.ASSISTANT_CHAT, ("anthropic:claude-3.5", "remote")
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
) -> SendMessageResponse:
    """Route message through the Claude CLI bridge (MCP tools)."""
    import time
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge

    if not remote_cmd_bridge.has_available:
        return SendMessageResponse(
            ok=False,
            agent_id="",
            error="No bridge running. Start one from the AI Agents panel.",
        )

    agent = remote_cmd_bridge.get_available_agent(user_id=user_id)
    if not agent:
        if user_id is not None:
            return SendMessageResponse(
                ok=False,
                agent_id="",
                error="No bridge available for your account. Start a user-scoped bridge or ask an admin.",
            )
        return SendMessageResponse(ok=False, agent_id="", error="All agents are busy")

    task_payload: dict = {
        "task": "message",
        "prompt": payload.message,
        "instruction": payload.message,
        "model": payload.model,
        "context": payload.context or {},
    }
    if raw_token and user_id is not None:
        task_payload["user_token"] = raw_token

    try:
        result = await remote_cmd_bridge.dispatch_task(
            task_payload, timeout=payload.timeout, user_id=user_id
        )
        duration_ms = int((time.monotonic() - start) * 1000)
        response_text = (
            result.get("edited_prompt")
            or result.get("response")
            or result.get("output", "")
        )
        return SendMessageResponse(
            ok=True,
            agent_id=agent.agent_id,
            response=response_text,
            duration_ms=duration_ms,
        )
    except Exception as e:
        duration_ms = int((time.monotonic() - start) * 1000)
        return SendMessageResponse(
            ok=False,
            agent_id=agent.agent_id,
            error=str(e),
            duration_ms=duration_ms,
        )


async def _send_via_direct_api(
    payload: SendMessageRequest,
    provider_id: str,
    model_id: str,
    user_id: Optional[int],
    start: float,
) -> SendMessageResponse:
    """Route message directly through an LLM API (no bridge, no tools)."""
    import time

    system_prompt = _build_user_system_prompt()

    try:
        from pixsim7.backend.main.services.llm.providers import get_provider
        from pixsim7.backend.main.services.llm.models import LLMRequest

        # Provider IDs are now clean names (openai, anthropic)
        provider_name = provider_id
        if not provider_name:
            return SendMessageResponse(
                ok=False,
                agent_id="direct",
                error=f"Direct API not supported for provider: {provider_id}",
            )

        # Extract model name from registry ID (e.g. "openai:gpt-4" -> "gpt-4")
        model_name = model_id.split(":", 1)[-1] if ":" in model_id else model_id

        provider = get_provider(provider_name)
        request = LLMRequest(
            prompt=payload.message,
            system_prompt=system_prompt,
            model=model_name,
            max_tokens=2048,
        )
        response = await provider.generate(request)

        duration_ms = int((time.monotonic() - start) * 1000)
        return SendMessageResponse(
            ok=True,
            agent_id="direct",
            response=response.text,
            duration_ms=duration_ms,
        )
    except Exception as e:
        duration_ms = int((time.monotonic() - start) * 1000)
        return SendMessageResponse(
            ok=False,
            agent_id="direct",
            error=str(e),
            duration_ms=duration_ms,
        )


# =============================================================================
# Internal helpers — system prompt
# =============================================================================


def _build_user_system_prompt() -> str:
    """Build a system prompt for the user-facing AI assistant.

    The assistant has MCP tools for API access, so the prompt focuses on
    behaviour and context rather than listing raw endpoints.
    """
    contract = meta_contract_registry.get_or_none("user.assistant")

    lines = [
        "You are an AI assistant for the PixSim application.",
        "You help users with their assets, generations, scenes, characters, and prompts.",
        "",
        "You have MCP tools available that let you query and interact with the PixSim API.",
        "Use these tools to answer questions with real data — do not guess or say you lack access.",
        "",
    ]

    if contract and contract.provides:
        lines.append(f"Your capabilities: {', '.join(contract.provides)}")
        lines.append("")

    if contract and contract.sub_endpoints:
        lines.append("Reference — API endpoints backing your tools:")
        for ep in contract.sub_endpoints:
            lines.append(f"  {ep.method} {ep.path} — {ep.summary}")
        lines.append("")
        lines.append(
            "For endpoints not covered by a specific tool, use the call_api tool."
        )
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


def _sync_prompt_contract_versions() -> None:
    """Keep registry versions in sync with the canonical version constants."""
    from pixsim7.backend.main.api.v1.prompts.meta import (
        PROMPT_ANALYSIS_CONTRACT_VERSION,
        PROMPT_AUTHORING_CONTRACT_VERSION,
    )

    meta_contract_registry.update_version(
        "prompts.analysis", PROMPT_ANALYSIS_CONTRACT_VERSION
    )
    meta_contract_registry.update_version(
        "prompts.authoring", PROMPT_AUTHORING_CONTRACT_VERSION
    )
