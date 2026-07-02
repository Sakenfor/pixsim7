"""Meta-contract agent sessions endpoints."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, Query

from sqlalchemy import Text, cast, select, func, distinct, or_
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_database
from pixsim7.backend.main.domain.docs.models import AgentActivityLog
from pixsim7.backend.main.services.meta.agent_sessions import (
    agent_session_registry,
)
from pixsim7.backend.main.services.docs.plan_authoring_policy import (
    evaluate_work_summary_policy,
)
from pixsim7.backend.main.shared.datetime_utils import utcnow

from ..models import (
    AgentHeartbeatRequest,
    AgentHeartbeatResponse,
    AgentHistoryEntry,
    AgentHistoryResponse,
    AgentSessionEntry,
    AgentSessionsResponse,
    AgentStatsContract,
    AgentStatsPlan,
    AgentStatsResponse,
)

router = APIRouter(tags=["meta"])


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

    # Soft-validate work_summary entries against the plan-authoring contract.
    # `metadata.next` should be populated when logging on an active plan so the
    # next session can pick up the baton (PlansPanel + AI chat consume it).
    warnings: List[str] = []
    if payload.action == "work_summary" and payload.plan_id:
        from types import SimpleNamespace
        from pixsim7.backend.main.domain.docs.models import Document, PlanRegistry
        plan_status_stmt = (
            select(Document.status)
            .join(PlanRegistry, PlanRegistry.document_id == Document.id)
            .where(PlanRegistry.id == payload.plan_id)
        )
        plan_status = (await db.execute(plan_status_stmt)).scalar_one_or_none()
        # Heartbeats from log_work always represent an agent principal; pass a
        # synthetic principal so the rule's applies_to_principal_types matches.
        agent_principal = SimpleNamespace(
            principal_type="agent",
            source=f"agent:{payload.session_id}",
        )
        _, work_summary_warnings = evaluate_work_summary_policy(
            payload,
            principal=agent_principal,
            plan_status=plan_status,
        )
        warnings.extend(work_summary_warnings)

    return AgentHeartbeatResponse(
        session_id=session.session_id,
        status=session.status,
        warnings=warnings,
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

    # Exclude bridge-client-level heartbeat sessions — they mirror the
    # underlying CLI session and would inflate the count.
    try:
        from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge
        bridge_client_ids = {a.bridge_client_id for a in remote_cmd_bridge.get_agents()}
    except Exception:
        bridge_client_ids = set()
    active = [s for s in active if s.session_id not in bridge_client_ids]

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


@router.get("/agents/history", response_model=AgentHistoryResponse)
async def get_agent_history(
    session_id: Optional[str] = Query(None, description="Filter by session"),
    run_id: Optional[str] = Query(None, description="Filter by run/invocation ID"),
    plan_id: Optional[str] = Query(None, description="Filter by plan"),
    contract_id: Optional[str] = Query(None, description="Filter by contract"),
    action: Optional[str] = Query(None, description="Filter by action (e.g. work_summary, tool_use)"),
    exclude_action: Optional[str] = Query(None, description="Exclude entries with this action"),
    q: Optional[str] = Query(
        None,
        description=(
            "Free-text substring search (case-insensitive) across `detail` and the "
            "`metadata` JSON column. Catches matches in `decisions[*]`, `next`, "
            "`blockers[*]`, and `evidence[*]` because metadata is cast to text for "
            "the LIKE. Intended for rationale discovery, not exact lookup."
        ),
    ),
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
    if exclude_action:
        stmt = stmt.where(AgentActivityLog.action != exclude_action)
    if q:
        needle = f"%{q.strip()}%"
        if needle != "%%":
            stmt = stmt.where(
                or_(
                    AgentActivityLog.detail.ilike(needle),
                    cast(AgentActivityLog.extra, Text).ilike(needle),
                )
            )

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
