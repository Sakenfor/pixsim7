"""Agent context routes — plan assignment for Claude Code agents."""
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database
from pixsim7.backend.main.domain.docs.models import PlanRegistry
from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim7.backend.main.services.docs.plan_write import (
    PlanBundle,
    get_plan_documents,
    get_plan_bundle,
    list_plan_bundles,
)
from pixsim7.backend.main.services.docs.plan_authoring_policy import (
    PLAN_AUTHORING_CONTRACT_ENDPOINT,
)
from pixsim7.backend.main.api.v1.plans.schemas import PlanSummary
from pixsim7.backend.main.api.v1.plans import helpers as _h

logger = logging.getLogger(__name__)

router = APIRouter()

class AgentPlanDocument(BaseModel):
    docType: str
    path: str
    title: str
    markdown: Optional[str] = None


class AgentPlanContext(BaseModel):
    id: str
    documentId: Optional[str] = None
    title: str
    status: str
    stage: str
    owner: str
    priority: str
    summary: str
    namespace: Optional[str] = None
    markdown: Optional[str] = None
    codePaths: List[str] = Field(default_factory=list)
    companions: List[str] = Field(default_factory=list)
    handoffs: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    dependsOn: List[str] = Field(default_factory=list)
    documents: List[AgentPlanDocument] = Field(default_factory=list)


class AgentPlanSummary(BaseModel):
    id: str
    title: str
    status: str
    stage: str
    owner: str
    priority: str
    summary: str
    namespace: Optional[str] = None
    dependsOn: List[str] = Field(default_factory=list)


class WorkSummaryEntry(BaseModel):
    session_id: str
    detail: str
    plan_id: Optional[str] = None
    timestamp: str


class AgentContextResponse(BaseModel):
    assignment: Optional[AgentPlanContext] = None
    activePlans: List[AgentPlanSummary] = Field(default_factory=list)
    recentWorkSummaries: List[WorkSummaryEntry] = Field(
        default_factory=list,
        description="Recent work summaries from previous agent sessions on the assigned plan. Provides continuity across sessions.",
    )
    availableActions: List[Dict[str, Any]] = Field(default_factory=list)
    discovery: Dict[str, str] = Field(
        default_factory=lambda: {
            "metaContracts": "/api/v1/meta/contracts",
            "planAuthoringContract": PLAN_AUTHORING_CONTRACT_ENDPOINT,
            "hint": "GET /api/v1/meta/contracts for full API surface discovery across all domains (prompts, blocks, plans, codegen, ui, assistant).",
        }
    )


def _plans_available_actions() -> List[Dict[str, Any]]:
    """Project the canonical plans MetaContract into the agent-facing action list.

    Single source of truth: the same ``plans.management`` sub-endpoints generate
    both the MCP tools and this inline cheat-sheet, so the two can no longer
    drift. Replaces a formerly hand-maintained ~230-line literal. ``body_schema``
    / ``params_schema`` are surfaced from each endpoint's ``input_schema`` so an
    agent has the request contract without a second fetch.
    """
    from pixsim7.backend.main.services.meta.contract_registry import (
        meta_contract_registry,
    )

    contract = meta_contract_registry.get_or_none("plans.management")
    if contract is None:
        return []

    actions: List[Dict[str, Any]] = []
    for ep in contract.sub_endpoints:
        action: Dict[str, Any] = {
            "action": ep.id.split(".", 1)[-1],  # "plans.progress" -> "progress"
            "method": ep.method,
            "url": ep.path,
            "description": ep.summary or "",
        }
        props = (ep.input_schema or {}).get("properties", {})
        if isinstance(props.get("body"), dict):
            action["body_schema"] = props["body"]
        if isinstance(props.get("params"), dict):
            action["params_schema"] = props["params"]
        actions.append(action)
    return actions


@router.get("/agent-context", response_model=AgentContextResponse)
async def get_agent_context(
    _user: CurrentUser,
    plan_id: Optional[str] = Query(None, description="Request a specific plan instead of auto-assignment"),
    db: AsyncSession = Depends(get_database),
):
    all_bundles = await _h.list_plan_bundles(db)

    active_plans = [
        AgentPlanSummary(
            id=b.id, title=b.doc.title, status=b.doc.status, stage=_h._normalize_stage_for_response(b.plan.stage),
            owner=b.doc.owner, priority=b.plan.priority, summary=b.doc.summary or "",
            namespace=b.doc.namespace,
            dependsOn=b.plan.depends_on or [],
        )
        for b in all_bundles if b.doc.status == "active"
    ]

    assignment: Optional[AgentPlanContext] = None

    if plan_id:
        target = next((b for b in all_bundles if b.id == plan_id), None)
    else:
        priority_rank = {"high": 0, "normal": 1, "low": 2}
        candidates = [b for b in all_bundles if b.doc.status == "active"]
        candidates.sort(key=lambda b: (
            priority_rank.get(b.plan.priority, 1),
            b.plan.updated_at.isoformat() if b.plan.updated_at else "",
        ))
        target = candidates[0] if candidates else None

    if target:
        docs = await get_plan_documents(db, target.id)
        assignment = AgentPlanContext(
            id=target.id,
            documentId=target.document_id,
            title=target.doc.title,
            status=target.doc.status,
            stage=_h._normalize_stage_for_response(target.plan.stage),
            owner=target.doc.owner,
            priority=target.plan.priority,
            summary=target.doc.summary or "",
            namespace=target.doc.namespace,
            markdown=target.doc.markdown,
            codePaths=target.plan.code_paths or [],
            companions=target.plan.companions or [],
            handoffs=target.plan.handoffs or [],
            tags=target.doc.tags or [],
            dependsOn=target.plan.depends_on or [],
            documents=[
                AgentPlanDocument(
                    docType=d.doc_type, path=d.path,
                    title=d.title, markdown=d.markdown,
                )
                for d in docs
            ],
        )

    # Cheap liveness ping: keep this agent's existing participant rows fresh so
    # a working agent doesn't drift to "stale" between progress logs. Isolated
    # commit, best-effort — must never break the read.
    if target is not None:
        try:
            touched = await _h.touch_participant_heartbeat(
                db, principal=_user, plan_id=target.id
            )
            if touched:
                await db.commit()
        except Exception:
            await db.rollback()

    # Self-declare auto-claim: when the caller explicitly requested a plan
    # (?plan_id=...), treat it as "I am working on this plan now" and upsert
    # an open claim. Auto-pick (no plan_id) is informational only — claiming
    # there would flood the roster with every agent's view of the top-priority
    # plan. Best-effort: a claim failure must never break the read.
    if target is not None and plan_id:
        try:
            session_id = await _resolve_claim_session_id(db, _user)
            await _h.claim_checkpoint(
                db,
                principal=_user,
                plan_id=target.id,
                checkpoint_id=None,
                session_id=session_id,
            )
            await db.commit()
        except Exception:
            await db.rollback()

    # Fetch recent work summaries for the assigned plan (or all plans if none assigned)
    work_summaries: List[WorkSummaryEntry] = []
    try:
        from pixsim7.backend.main.domain.docs.models import AgentActivityLog
        summary_stmt = (
            select(AgentActivityLog)
            .where(AgentActivityLog.action == "work_summary")
            .order_by(AgentActivityLog.timestamp.desc())
            .limit(10)
        )
        if target:
            summary_stmt = summary_stmt.where(AgentActivityLog.plan_id == target.id)
        summary_rows = (await db.execute(summary_stmt)).scalars().all()
        work_summaries = [
            WorkSummaryEntry(
                session_id=r.session_id or "",
                detail=r.detail or "",
                plan_id=r.plan_id,
                timestamp=r.timestamp.isoformat() if r.timestamp else "",
            )
            for r in summary_rows
            if r.detail
        ]
    except Exception:
        pass

    return AgentContextResponse(
        assignment=assignment,
        activePlans=active_plans,
        recentWorkSummaries=work_summaries,
        availableActions=_plans_available_actions(),
    )


# ── Plan documents endpoint ───────────────────────────────────────


# ── Plan work log ─────────────────────────────────────────────────


class PlanWorkLogEntry(BaseModel):
    id: str
    session_id: str
    run_id: Optional[str] = None
    agent_type: str
    timestamp: str
    summary: str
    decisions: List[str] = Field(default_factory=list)
    next: Optional[str] = None
    blockers: List[str] = Field(default_factory=list)
    evidence: List[str] = Field(default_factory=list)
    extra: Optional[Dict[str, Any]] = None


class PlanWorkLogResponse(BaseModel):
    plan_id: str
    entries: List[PlanWorkLogEntry] = Field(default_factory=list)
    total: int


def _coerce_str_list(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(item) for item in value if item is not None]
    return []


@router.get("/work-log/{plan_id}", response_model=PlanWorkLogResponse)
async def get_plan_work_log(
    plan_id: str,
    _user: CurrentUser,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_database),
):
    """Return work_summary entries for a plan, newest first.

    Hydrates `decisions`, `next`, `blockers`, `evidence` out of the JSON metadata
    column so callers don't have to know the underlying shape. Used to resume a
    plan cold from the prior session's handoff notes.
    """
    from pixsim7.backend.main.domain.docs.models import AgentActivityLog

    bundle = await get_plan_bundle(db, plan_id)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")

    base_stmt = (
        select(AgentActivityLog)
        .where(AgentActivityLog.plan_id == plan_id)
        .where(AgentActivityLog.action == "work_summary")
    )

    total = (
        await db.execute(select(func.count()).select_from(base_stmt.subquery()))
    ).scalar() or 0

    rows = (
        await db.execute(
            base_stmt.order_by(AgentActivityLog.timestamp.desc())
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()

    entries: List[PlanWorkLogEntry] = []
    for r in rows:
        meta = r.extra if isinstance(r.extra, dict) else {}
        entries.append(
            PlanWorkLogEntry(
                id=str(r.id),
                session_id=r.session_id or "",
                run_id=r.run_id,
                agent_type=r.agent_type or "claude",
                timestamp=r.timestamp.isoformat() if r.timestamp else "",
                summary=r.detail or "",
                decisions=_coerce_str_list(meta.get("decisions")),
                next=(str(meta["next"]) if meta.get("next") else None),
                blockers=_coerce_str_list(meta.get("blockers")),
                evidence=_coerce_str_list(meta.get("evidence")),
                extra=meta or None,
            )
        )

    return PlanWorkLogResponse(plan_id=plan_id, entries=entries, total=int(total))


# ── Explicit claim / release ─────────────────────────────────────


class ClaimRequest(BaseModel):
    checkpoint_id: Optional[str] = Field(
        None, description="Checkpoint to claim/release. Omit for a plan-level claim."
    )


class ClaimConflict(BaseModel):
    agent_id: Optional[str] = None
    agent_type: Optional[str] = None
    run_id: Optional[str] = None
    session_id: Optional[str] = None
    checkpoint_id: Optional[str] = None
    claimed_at: Optional[str] = None
    last_heartbeat_at: Optional[str] = None


class TabIdentitySuggestion(BaseModel):
    icon: str = Field("", description="Suggested @lib/icons IconName (e.g. 'wrench', 'lock').")
    subtitle: str = Field("", description="Suggested short tab subtitle (≤ ~40 chars).")


class ClaimResponse(BaseModel):
    plan_id: str
    checkpoint_id: Optional[str] = None
    claimed: bool
    participant_id: Optional[str] = None
    conflicts: List[ClaimConflict] = Field(
        default_factory=list,
        description="Other live claimants of the same checkpoint. Surfaced, not blocked.",
    )
    nudge: Optional[str] = Field(
        default=None,
        description=(
            "Optional one-line, never-mandatory suggestion (e.g. that you "
            "may brand this chat tab via set_tab_identity). Surfaced at most "
            "once per anchor-type per session — ignore if not actionable."
        ),
    )
    tab_identity_suggestion: Optional[TabIdentitySuggestion] = Field(
        default=None,
        description=(
            "Best-effort {icon, subtitle} starter for set_tab_identity, "
            "derived from the plan. Only present when the nudge fires "
            "(same once-per-anchor cap). Agents may pass this through "
            "unchanged, adjust, or ignore."
        ),
    )


class ReleaseResponse(BaseModel):
    plan_id: str
    checkpoint_id: Optional[str] = None
    released: int


async def _resolve_claim_session_id(db: AsyncSession, principal) -> Optional[str]:
    """Best-effort chat session id to stamp on a claim so the tab groups.

    Grouping (``_derive_primary_plan_ids`` in chat_tabs.py) joins a tab to a
    plan via ``PlanParticipant.session_id == ChatTab.session_id``; a NULL
    session makes the claim roster-only and ungroupable. Resolution priority:
    the principal's bound ``chat_session_id``, else the session of the
    ``ChatTab`` named by the ``tab_id`` claim (or a ``tab:<id>`` scope_key).
    On turn 1 the tab's ``session_id`` is still NULL (bound right after the
    first turn), so grouping fills in from turn 2 once it resolves — the same
    running token keeps working because this lookup runs fresh per call.
    Returns None for headless callers (roster-only claim, no grouping).
    Plan ``tab-identity-mode``.
    """
    sid = getattr(principal, "chat_session_id", None)
    if isinstance(sid, str) and sid.strip():
        return sid.strip()

    from uuid import UUID
    from pixsim7.backend.main.domain.platform.agent_profile import ChatTab

    async def _session_of_tab(raw: Optional[str]) -> Optional[str]:
        if not raw:
            return None
        try:
            tab = await db.get(ChatTab, UUID(raw))
        except (ValueError, AttributeError):
            return None
        return tab.session_id if (tab is not None and tab.session_id) else None

    resolved = await _session_of_tab(getattr(principal, "tab_id", None))
    if resolved:
        return resolved
    scope_key = getattr(principal, "scope_key", None)
    if isinstance(scope_key, str) and scope_key.startswith("tab:"):
        resolved = await _session_of_tab(scope_key[len("tab:") :])
        if resolved:
            return resolved
    return None


@router.post("/{plan_id}/claim", response_model=ClaimResponse)
async def claim_plan_checkpoint(
    plan_id: str,
    payload: ClaimRequest,
    _user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Explicitly claim a (plan, checkpoint) for the calling principal.

    Soft: an existing live claimant is returned in ``conflicts`` rather
    than rejected. Upserts the builder participant row and advances its
    heartbeat. Auto-released when the agent run ends (see release).
    """
    bundle = await get_plan_bundle(db, plan_id)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")

    # Scoped-agent authorization: a profile-restricted agent may only claim
    # plans within its assigned scope. Plan ``scoped-agent-authorization`` (cp2).
    from pixsim7.backend.main.services.ownership.scope_authz import (
        ResourceScope,
        assert_scope_access,
    )
    await assert_scope_access(db, _user, ResourceScope("plan", plan_id))

    session_id = await _resolve_claim_session_id(db, _user)
    own, conflicts = await _h.claim_checkpoint(
        db,
        principal=_user,
        plan_id=plan_id,
        checkpoint_id=payload.checkpoint_id,
        session_id=session_id,
    )

    # Soft tab-identity nudge — first self-assign anchor. Best-effort: a
    # nudge must never fail the claim (plan `agent-freeform-tab-identity`).
    # When the nudge fires, also include a structured {icon, subtitle}
    # starter derived from the plan so agents have a sensible default to
    # pass to set_tab_identity.
    nudge: Optional[str] = None
    suggestion: Optional[TabIdentitySuggestion] = None
    if own is not None:
        try:
            nudge = await _h.maybe_tab_identity_nudge(
                db, principal=_user, plan_id=plan_id, anchor="claim"
            )
            if nudge is not None:
                hint = _h.derive_tab_identity_suggestion(bundle)
                suggestion = TabIdentitySuggestion(
                    icon=hint.get("icon", ""), subtitle=hint.get("subtitle", "")
                )
        except Exception:  # noqa: BLE001 — nudge is non-critical
            logger.warning("tab-identity claim nudge failed", exc_info=True)

    await db.commit()

    return ClaimResponse(
        plan_id=plan_id,
        checkpoint_id=payload.checkpoint_id,
        claimed=own is not None,
        participant_id=str(own.id) if own else None,
        nudge=nudge,
        tab_identity_suggestion=suggestion,
        conflicts=[
            ClaimConflict(
                agent_id=c.agent_id,
                agent_type=c.agent_type,
                run_id=c.run_id,
                session_id=c.session_id,
                checkpoint_id=(_h.participant_claim(c) or {}).get("checkpoint_id"),
                claimed_at=(_h.participant_claim(c) or {}).get("claimed_at"),
                last_heartbeat_at=(
                    c.last_heartbeat_at.isoformat() if c.last_heartbeat_at else None
                ),
            )
            for c in conflicts
        ],
    )


@router.post("/{plan_id}/release", response_model=ReleaseResponse)
async def release_plan_checkpoint(
    plan_id: str,
    payload: ClaimRequest,
    _user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Release the caller's open claim(s) on a plan (or one checkpoint)."""
    bundle = await get_plan_bundle(db, plan_id)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")

    released = await _h.release_checkpoint(
        db, principal=_user, plan_id=plan_id, checkpoint_id=payload.checkpoint_id
    )
    await db.commit()
    return ReleaseResponse(
        plan_id=plan_id, checkpoint_id=payload.checkpoint_id, released=released
    )


# ── Cross-plan active-agent roster ───────────────────────────────


class ActiveAgentEntry(BaseModel):
    participant_id: str
    role: str
    agent_id: Optional[str] = None
    agent_type: Optional[str] = None
    run_id: Optional[str] = None
    session_id: Optional[str] = None
    user_id: Optional[int] = None
    checkpoint_id: Optional[str] = None
    claimed: bool = False
    last_action: Optional[str] = None
    last_heartbeat_at: Optional[str] = None
    heartbeat_age_seconds: int


class ActivePlanGroup(BaseModel):
    plan_id: str
    plan_title: Optional[str] = None
    active_count: int
    agents: List[ActiveAgentEntry] = Field(default_factory=list)


class ActiveAgentsResponse(BaseModel):
    generated_at: str
    total_active: int
    plans: List[ActivePlanGroup] = Field(default_factory=list)


@router.get("/active-agents", response_model=ActiveAgentsResponse)
async def list_active_agents(
    _user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Cross-plan roster of agents currently active (non-stale, owning run
    not terminal), grouped by plan. The at-a-glance "who is working on
    what right now" overview."""
    now = utcnow()

    # Best-effort maintenance: release claims left open by agents that went
    # idle without a terminal run, so the persisted claim record matches the
    # roster (which already hides stale claimants). Isolated commit — must
    # never break the read. Plan `plan-participant-liveness`, checkpoint
    # `claim-idle-release-and-ttl-settings`.
    try:
        swept = await _h.sweep_idle_claims(db, now=now)
        if swept:
            await db.commit()
    except Exception:
        await db.rollback()

    rows = await _h.list_active_participants(db, now=now)
    terminal = await _h.load_terminal_run_ids(
        db, {r.run_id for r in rows if r.run_id}
    )

    groups: Dict[str, List[ActiveAgentEntry]] = {}
    for r in rows:
        if r.run_id in terminal:
            continue
        if _h.participant_is_stale(r, now=now):
            continue
        seen = _h.participant_liveness_at(r)
        age = int((now - seen).total_seconds()) if seen else -1
        claim = _h.participant_claim(r)
        groups.setdefault(r.plan_id, []).append(
            ActiveAgentEntry(
                participant_id=str(r.id),
                role=r.role,
                agent_id=r.agent_id,
                agent_type=r.agent_type,
                run_id=r.run_id,
                session_id=r.session_id,
                user_id=r.user_id,
                checkpoint_id=(claim or {}).get("checkpoint_id"),
                claimed=_h.claim_is_open(claim),
                last_action=r.last_action,
                last_heartbeat_at=(
                    r.last_heartbeat_at.isoformat()
                    if getattr(r, "last_heartbeat_at", None)
                    else None
                ),
                heartbeat_age_seconds=age,
            )
        )

    titles = await _h.resolve_plan_titles(db, set(groups.keys()))
    plans = [
        ActivePlanGroup(
            plan_id=pid,
            plan_title=titles.get(pid),
            active_count=len(entries),
            agents=sorted(entries, key=lambda e: e.heartbeat_age_seconds),
        )
        for pid, entries in groups.items()
    ]
    # Busiest plans first, stable by id.
    plans.sort(key=lambda g: (-g.active_count, g.plan_id))
    return ActiveAgentsResponse(
        generated_at=now.isoformat(),
        total_active=sum(g.active_count for g in plans),
        plans=plans,
    )
