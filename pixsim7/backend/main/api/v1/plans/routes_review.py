"""Review routes — rounds, nodes, requests, participants, assignees."""
from __future__ import annotations

from typing import Dict, List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database
from pixsim7.backend.main.domain.docs.models import (
    PlanParticipant,
    PlanReviewLink,
    PlanReviewNode,
    PlanRequest,
    PlanReviewRound,
)
from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim7.backend.main.api.v1.plans.schemas import (
    PlanRequestEntry,
    PlanRequestListResponse,
    PlanRequestCreateRequest,
    PlanRequestUpdateRequest,
    PlanRequestDispatchRequest,
    PlanRequestDispatchResponse,
    PlanReviewAssigneesResponse,
    PlanReviewAssigneeEntry,
    PlanReviewPoolSession,
    PlanReviewDispatchTickRequest,
    PlanReviewDispatchTickItem,
    PlanReviewDispatchTickResponse,
    PlanReviewRoundEntry,
    PlanReviewRoundListResponse,
    PlanReviewRoundCreateRequest,
    PlanReviewRoundUpdateRequest,
    PlanReviewNodeCreateRequest,
    PlanReviewNodeCreateResponse,
    PlanReviewGraphResponse,
    PlanSourcePreviewResponse,
    PlanSourceSnippetLine,
    PlanParticipantEntry,
    PlanParticipantsResponse,
    PlanReviewRefInput,
    validate_plan_id as _validate_plan_id,
)

# Helpers imported from dev_plans (will move to plans/helpers.py later)
from pixsim7.backend.main.api.v1 import dev_plans as _dp

router = APIRouter()

@router.get("/reviews/{plan_id}/requests", response_model=PlanRequestListResponse)
async def list_plan_review_requests(
    plan_id: str,
    _user: CurrentUser,
    status: Optional[Literal["open", "in_progress", "fulfilled", "cancelled"]] = Query(
        None, description="Optional review request status filter."
    ),
    round_id: Optional[str] = Query(
        None, description="Optional review round UUID filter."
    ),
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _dp._ensure_plan_exists(db, plan_id)

    round_uuid: Optional[UUID] = None
    if round_id is not None:
        round_uuid = _dp._parse_uuid_or_400(round_id, field_name="round_id")

    stmt = (
        select(PlanRequest)
        .where(PlanRequest.plan_id == plan_id)
        .order_by(PlanRequest.created_at.desc())
    )
    if status is not None:
        stmt = stmt.where(PlanRequest.status == status)
    if round_uuid is not None:
        stmt = stmt.where(PlanRequest.round_id == round_uuid)

    rows = (await db.execute(stmt)).scalars().all()
    return PlanRequestListResponse(
        planId=plan_id,
        requests=[_dp._review_request_to_entry(row) for row in rows],
    )


@router.get("/reviews/{plan_id}/assignees", response_model=PlanReviewAssigneesResponse)
async def list_plan_review_assignees(
    plan_id: str,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _dp._ensure_plan_exists(db, plan_id)

    live_rows = _dp._list_live_bridge_agents(principal)
    live_ids = {str(row.get("agent_id")) for row in live_rows}
    recent_rows = await _dp._list_recent_review_agents(db, plan_id=plan_id, limit=12)

    # Resolve agent IDs to profile labels for friendly display
    profile_labels = await _dp._resolve_profile_labels(db, principal)

    live_entries = [
        PlanReviewAssigneeEntry(
            id=str(row["agent_id"]),
            label=profile_labels.get(str(row["agent_id"]), str(row["agent_id"])),
            source="live",
            targetMode="session",
            targetSessionId=str(row["agent_id"]),
            agentId=str(row["agent_id"]),
            agentType=row.get("agent_type"),
            busy=bool(row.get("busy")),
            availableNow=not bool(row.get("busy")),
            activeTasks=int(row.get("active_tasks", 0) or 0),
            tasksCompleted=int(row.get("tasks_completed", 0) or 0),
            connectedAt=row["connected_at"].isoformat() if row.get("connected_at") else None,
            lastSeenAt=row["connected_at"].isoformat() if row.get("connected_at") else None,
            modelId=row.get("model"),
            engines=row.get("engines", []),
            poolSessions=[
                PlanReviewPoolSession(
                    sessionId=ps.get("session_id", ""),
                    engine=ps.get("engine", "unknown"),
                    state=ps.get("state", "unknown"),
                    cliModel=ps.get("cli_model"),
                    messagesSent=ps.get("messages_sent", 0),
                    contextPct=ps.get("context_pct"),
                )
                for ps in row.get("pool_sessions", [])
            ],
        )
        for row in live_rows
    ]

    recent_entries = []
    for row in recent_rows:
        agent_id = str(row.get("agent_id") or "").strip()
        if not agent_id or agent_id in live_ids:
            continue
        last_seen_at = row.get("last_seen_at")
        recent_entries.append(
            PlanReviewAssigneeEntry(
                id=agent_id,
                label=profile_labels.get(agent_id, agent_id),
                source="recent",
                targetMode="recent_agent",
                targetSessionId=None,
                agentId=agent_id,
                agentType=row.get("agent_type"),
                busy=False,
                availableNow=False,
                activeTasks=0,
                tasksCompleted=0,
                connectedAt=None,
                lastSeenAt=last_seen_at.isoformat() if last_seen_at else None,
            )
        )

    return PlanReviewAssigneesResponse(
        planId=plan_id,
        generatedAt=utcnow().isoformat(),
        liveSessions=live_entries,
        recentAgents=recent_entries,
    )


@router.get("/{plan_id}/participants", response_model=PlanParticipantsResponse)
async def list_plan_participants(
    plan_id: str,
    _user: CurrentUser,
    role: Optional[Literal["builder", "reviewer"]] = Query(
        None, description="Optional participant role filter."
    ),
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _dp._ensure_plan_exists(db, plan_id)

    stmt = (
        select(PlanParticipant)
        .where(PlanParticipant.plan_id == plan_id)
        .order_by(PlanParticipant.last_seen_at.desc(), PlanParticipant.first_seen_at.desc())
    )
    if role is not None:
        stmt = stmt.where(PlanParticipant.role == role)

    rows = (await db.execute(stmt)).scalars().all()
    participants = [_dp._participant_to_entry(row) for row in rows]
    reviewers = [entry for entry in participants if entry.role == "reviewer"]
    builders = [entry for entry in participants if entry.role == "builder"]
    return PlanParticipantsResponse(
        planId=plan_id,
        generatedAt=utcnow().isoformat(),
        participants=participants,
        reviewers=reviewers,
        builders=builders,
    )


@router.post("/reviews/{plan_id}/requests", response_model=PlanRequestEntry)
async def create_plan_review_request(
    plan_id: str,
    payload: PlanRequestCreateRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _dp._ensure_plan_exists(db, plan_id)

    title = payload.title.strip()
    body = payload.body.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Request title is required.")
    if not body:
        raise HTTPException(status_code=400, detail="Request body is required.")

    round_uuid: Optional[UUID] = None
    if payload.round_id is not None:
        round_uuid = _dp._parse_uuid_or_400(payload.round_id, field_name="round_id")
        await _dp._load_review_round(db, plan_id=plan_id, round_id=round_uuid)

    profile_hint = await _dp._load_target_profile_hint(
        db,
        principal=principal,
        profile_id=payload.target_profile_id,
    )
    live_agents = _dp._list_live_bridge_agents(principal)
    dispatch = _dp._resolve_review_request_targeting(
        payload=payload,
        live_agents=live_agents,
        profile_hint=profile_hint,
    )

    actor_source = getattr(principal, "source", f"user:{principal.id}")
    actor_fields = _dp._principal_actor_fields(principal)
    now = utcnow()
    row = PlanRequest(
        kind=payload.kind or "review",
        plan_id=plan_id,
        round_id=round_uuid,
        title=title,
        body=body,
        status="open",
        target_agent_id=dispatch.get("target_agent_id"),
        target_agent_type=dispatch.get("target_agent_type"),
        requested_by=actor_source,
        requested_by_principal_type=actor_fields["principal_type"],
        requested_by_agent_id=actor_fields["agent_id"],
        requested_by_run_id=actor_fields["run_id"],
        requested_by_user_id=actor_fields["user_id"],
        meta=_dp._merge_request_meta_with_dispatch(payload.meta, dispatch),
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    await _dp._record_plan_participant_from_principal(
        db,
        plan_id=plan_id,
        role="reviewer",
        action="create_review_request",
        principal=principal,
        meta={"round_id": str(round_uuid) if round_uuid else None},
    )
    await db.commit()
    return _dp._review_request_to_entry(row)


@router.patch(
    "/reviews/{plan_id}/requests/{request_id}",
    response_model=PlanRequestEntry,
)
async def update_plan_review_request(
    plan_id: str,
    request_id: str,
    payload: PlanRequestUpdateRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _dp._ensure_plan_exists(db, plan_id)

    request_uuid = _dp._parse_uuid_or_400(request_id, field_name="request_id")
    row = await _dp._load_review_request(db, plan_id=plan_id, request_id=request_uuid)

    if (
        payload.status is None
        and payload.resolution_note is None
        and payload.resolved_node_id is None
        and payload.meta is None
    ):
        raise HTTPException(status_code=400, detail="No request fields to update.")

    now = utcnow()

    if payload.resolved_node_id is not None:
        resolved_node_uuid = _dp._parse_uuid_or_400(
            payload.resolved_node_id, field_name="resolved_node_id"
        )
        resolved_node = (
            await db.execute(
                select(PlanReviewNode.id).where(
                    PlanReviewNode.id == resolved_node_uuid,
                    PlanReviewNode.plan_id == plan_id,
                )
            )
        ).scalar_one_or_none()
        if resolved_node is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    "Resolved review node not found for plan "
                    f"'{plan_id}': {resolved_node_uuid}"
                ),
            )
        row.resolved_node_id = resolved_node_uuid

    if payload.status is not None:
        row.status = payload.status
    if payload.resolution_note is not None:
        row.resolution_note = payload.resolution_note
    if payload.meta is not None:
        row.meta = payload.meta

    actor_source = getattr(principal, "source", f"user:{principal.id}")
    actor_fields = _dp._principal_actor_fields(principal)
    if row.status in _TERMINAL_REVIEW_REQUEST_STATUSES:
        row.resolved_by = actor_source
        row.resolved_by_principal_type = actor_fields["principal_type"]
        row.resolved_by_agent_id = actor_fields["agent_id"]
        row.resolved_by_run_id = actor_fields["run_id"]
        row.resolved_by_user_id = actor_fields["user_id"]
        row.resolved_at = row.resolved_at or now
    elif payload.status is not None:
        row.resolved_by = None
        row.resolved_by_principal_type = None
        row.resolved_by_agent_id = None
        row.resolved_by_run_id = None
        row.resolved_by_user_id = None
        row.resolved_at = None
        row.resolved_node_id = None

    row.updated_at = now
    await _dp._record_plan_participant_from_principal(
        db,
        plan_id=plan_id,
        role="reviewer",
        action="update_review_request",
        principal=principal,
        meta={"status": row.status},
    )
    await db.commit()
    return _dp._review_request_to_entry(row)


@router.post(
    "/reviews/{plan_id}/requests/{request_id}/dispatch",
    response_model=PlanRequestDispatchResponse,
)
async def dispatch_plan_review_request(
    plan_id: str,
    request_id: str,
    payload: PlanRequestDispatchRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _dp._ensure_plan_exists(db, plan_id)

    request_uuid = _dp._parse_uuid_or_400(request_id, field_name="request_id")
    row = await _dp._load_review_request(db, plan_id=plan_id, request_id=request_uuid)
    outcome = await _dp._dispatch_review_request_execution(
        db,
        plan_id=plan_id,
        request_row=row,
        principal=principal,
        timeout_seconds=payload.timeout_seconds,
        spawn_if_missing=payload.spawn_if_missing,
        create_round_if_missing=payload.create_round_if_missing,
    )

    node_row = outcome.get("node_row")
    return PlanRequestDispatchResponse(
        request=_dp._review_request_to_entry(outcome["request_row"]),
        node=_dp._review_node_to_entry(node_row) if node_row is not None else None,
        executed=bool(outcome.get("executed", False)),
        message=str(outcome.get("message") or ""),
        durationMs=outcome.get("duration_ms"),
    )


@router.post("/reviews/dispatch/tick", response_model=PlanReviewDispatchTickResponse)
async def dispatch_plan_review_requests_tick(
    payload: PlanReviewDispatchTickRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    if payload.plan_id is not None:
        await _dp._ensure_plan_exists(db, payload.plan_id)

    stmt = (
        select(PlanRequest)
        .where(PlanRequest.status == "open")
        .order_by(PlanRequest.created_at.asc())
        .limit(payload.limit)
    )
    if payload.plan_id is not None:
        stmt = stmt.where(PlanRequest.plan_id == payload.plan_id)

    rows = (await db.execute(stmt)).scalars().all()
    items: List[PlanReviewDispatchTickItem] = []
    processed = 0

    for row in rows:
        try:
            outcome = await _dp._dispatch_review_request_execution(
                db,
                plan_id=row.plan_id,
                request_row=row,
                principal=principal,
                timeout_seconds=payload.timeout_seconds,
                spawn_if_missing=payload.spawn_if_missing,
                create_round_if_missing=payload.create_round_if_missing,
            )
            request_entry = _dp._review_request_to_entry(outcome["request_row"])
            if bool(outcome.get("executed", False)):
                processed += 1
            items.append(
                PlanReviewDispatchTickItem(
                    planId=row.plan_id,
                    requestId=str(row.id),
                    status=request_entry.status,
                    executed=bool(outcome.get("executed", False)),
                    message=str(outcome.get("message") or ""),
                    dispatchState=request_entry.dispatchState,
                    resolvedNodeId=request_entry.resolvedNodeId,
                )
            )
        except HTTPException as exc:
            items.append(
                PlanReviewDispatchTickItem(
                    planId=row.plan_id,
                    requestId=str(row.id),
                    status=row.status,
                    executed=False,
                    message=str(exc.detail),
                    dispatchState=_dp._review_request_dispatch_view(row).get("dispatch_state"),
                    resolvedNodeId=str(row.resolved_node_id) if row.resolved_node_id else None,
                )
            )

    return PlanReviewDispatchTickResponse(
        attempted=len(rows),
        processed=processed,
        items=items,
    )


@router.get("/reviews/{plan_id}/rounds", response_model=PlanReviewRoundListResponse)
async def list_plan_review_rounds(
    plan_id: str,
    _user: CurrentUser,
    status: Optional[Literal["open", "changes_requested", "approved", "concluded"]] = Query(
        None, description="Optional review round status filter."
    ),
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _dp._ensure_plan_exists(db, plan_id)

    stmt = (
        select(PlanReviewRound)
        .where(PlanReviewRound.plan_id == plan_id)
        .order_by(PlanReviewRound.round_number.desc())
    )
    if status:
        stmt = stmt.where(PlanReviewRound.status == status)
    rows = (await db.execute(stmt)).scalars().all()
    return PlanReviewRoundListResponse(
        planId=plan_id,
        rounds=[_dp._review_round_to_entry(row) for row in rows],
    )


@router.post("/reviews/{plan_id}/rounds", response_model=PlanReviewRoundEntry)
async def create_plan_review_round(
    plan_id: str,
    payload: PlanReviewRoundCreateRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _dp._ensure_plan_exists(db, plan_id)

    round_number = payload.round_number
    if round_number is None:
        last_round = (
            await db.execute(
                select(PlanReviewRound.round_number)
                .where(PlanReviewRound.plan_id == plan_id)
                .order_by(PlanReviewRound.round_number.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        round_number = int(last_round or 0) + 1
    else:
        existing = (
            await db.execute(
                select(PlanReviewRound.id).where(
                    PlanReviewRound.plan_id == plan_id,
                    PlanReviewRound.round_number == round_number,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail=f"Review round already exists: {plan_id}#{round_number}",
            )

    actor_source = getattr(principal, "source", f"user:{principal.id}")
    actor_fields = _dp._principal_actor_fields(principal)
    now = utcnow()
    row = PlanReviewRound(
        plan_id=plan_id,
        round_number=round_number,
        review_revision=payload.review_revision,
        status=payload.status,
        note=payload.note,
        created_by=actor_source,
        actor_principal_type=actor_fields["principal_type"],
        actor_agent_id=actor_fields["agent_id"],
        actor_run_id=actor_fields["run_id"],
        actor_user_id=actor_fields["user_id"],
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    await _dp._record_plan_participant_from_principal(
        db,
        plan_id=plan_id,
        role="reviewer",
        action="create_review_round",
        principal=principal,
        meta={"round_number": round_number},
    )
    await db.commit()
    return _dp._review_round_to_entry(row)


@router.patch("/reviews/{plan_id}/rounds/{round_id}", response_model=PlanReviewRoundEntry)
async def update_plan_review_round(
    plan_id: str,
    round_id: str,
    payload: PlanReviewRoundUpdateRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _dp._ensure_plan_exists(db, plan_id)
    round_uuid = _dp._parse_uuid_or_400(round_id, field_name="round_id")
    row = await _dp._load_review_round(db, plan_id=plan_id, round_id=round_uuid)

    if payload.status is None and payload.conclusion is None and payload.note is None:
        raise HTTPException(status_code=400, detail="No round fields to update.")

    if payload.status is not None:
        row.status = payload.status
    if payload.note is not None:
        row.note = payload.note
    if payload.conclusion is not None:
        row.conclusion = payload.conclusion

    if row.status == "concluded" and not (row.conclusion or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Concluded rounds require non-empty conclusion text.",
        )

    row.updated_at = utcnow()
    if not row.created_by:
        actor_source = getattr(principal, "source", f"user:{principal.id}")
        actor_fields = _dp._principal_actor_fields(principal)
        row.created_by = actor_source
        row.actor_principal_type = row.actor_principal_type or actor_fields["principal_type"]
        row.actor_agent_id = row.actor_agent_id or actor_fields["agent_id"]
        row.actor_run_id = row.actor_run_id or actor_fields["run_id"]
        row.actor_user_id = row.actor_user_id or actor_fields["user_id"]
    await _dp._record_plan_participant_from_principal(
        db,
        plan_id=plan_id,
        role="reviewer",
        action="update_review_round",
        principal=principal,
        meta={"round_number": row.round_number, "status": row.status},
    )
    await db.commit()
    return _dp._review_round_to_entry(row)


@router.post("/reviews/{plan_id}/nodes", response_model=PlanReviewNodeCreateResponse)
async def create_plan_review_node(
    plan_id: str,
    payload: PlanReviewNodeCreateRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _dp._ensure_plan_exists(db, plan_id)

    round_uuid = _dp._parse_uuid_or_400(payload.round_id, field_name="round_id")
    round_row = await _dp._load_review_round(db, plan_id=plan_id, round_id=round_uuid)

    actor_source = getattr(principal, "source", f"user:{principal.id}")
    actor_fields = _dp._principal_actor_fields(principal)
    now = utcnow()
    node_row = PlanReviewNode(
        plan_id=plan_id,
        round_id=round_row.id,
        kind=payload.kind,
        author_role=payload.author_role,
        body=payload.body,
        severity=payload.severity,
        plan_anchor=payload.plan_anchor,
        meta=payload.meta,
        created_by=actor_source,
        actor_principal_type=actor_fields["principal_type"],
        actor_agent_id=actor_fields["agent_id"],
        actor_run_id=actor_fields["run_id"],
        actor_user_id=actor_fields["user_id"],
        created_at=now,
        updated_at=now,
    )
    db.add(node_row)
    await db.flush()

    parsed_refs: List[tuple[PlanReviewRefInput, Optional[UUID]]] = []
    for ref in payload.refs:
        if ref.target_node_id is None and ref.target_plan_anchor is None:
            raise HTTPException(
                status_code=400,
                detail="Each ref requires either target_node_id or target_plan_anchor.",
            )

        target_uuid: Optional[UUID] = None
        if ref.target_node_id is not None:
            target_uuid = _dp._parse_uuid_or_400(ref.target_node_id, field_name="target_node_id")
            target_node = (
                await db.execute(
                    select(PlanReviewNode.id).where(
                        PlanReviewNode.id == target_uuid,
                        PlanReviewNode.plan_id == plan_id,
                    )
                )
            ).scalar_one_or_none()
            if target_node is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Target review node not found for plan '{plan_id}': {target_uuid}",
                )

        if ref.relation in _CAUSAL_REVIEW_RELATIONS and target_uuid is None:
            raise HTTPException(
                status_code=400,
                detail=f"Relation '{ref.relation}' requires target_node_id.",
            )
        parsed_refs.append((ref, target_uuid))

    if parsed_refs:
        adjacency = await _dp._load_causal_review_adjacency(db, plan_id=plan_id)
        source_id = node_row.id
        if source_id is None:
            raise HTTPException(status_code=500, detail="Failed to allocate review node ID.")
        for ref, target_uuid in parsed_refs:
            if ref.relation not in _CAUSAL_REVIEW_RELATIONS or target_uuid is None:
                continue
            if source_id == target_uuid or _dp._graph_has_path(adjacency, target_uuid, source_id):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Causal review link would create a cycle: "
                        f"{source_id} -[{ref.relation}]-> {target_uuid}"
                    ),
                )
            adjacency.setdefault(source_id, set()).add(target_uuid)

    link_rows: List[PlanReviewLink] = []
    for ref, target_uuid in parsed_refs:
        link_row = PlanReviewLink(
            plan_id=plan_id,
            round_id=round_row.id,
            source_node_id=node_row.id,
            target_node_id=target_uuid,
            relation=ref.relation,
            source_anchor=ref.source_anchor,
            target_anchor=ref.target_anchor,
            target_plan_anchor=ref.target_plan_anchor,
            quote=ref.quote,
            meta=ref.meta,
            created_by=actor_source,
            created_at=now,
        )
        db.add(link_row)
        link_rows.append(link_row)

    await _dp._record_plan_participant_from_principal(
        db,
        plan_id=plan_id,
        role="reviewer",
        action="create_review_node",
        principal=principal,
        meta={
            "round_id": str(round_row.id),
            "kind": payload.kind,
            "author_role": payload.author_role,
        },
    )
    await db.commit()
    return PlanReviewNodeCreateResponse(
        node=_dp._review_node_to_entry(node_row),
        links=[_review_link_to_entry(row) for row in link_rows],
    )


@router.get("/reviews/{plan_id}/graph", response_model=PlanReviewGraphResponse)
async def get_plan_review_graph(
    plan_id: str,
    _user: CurrentUser,
    round_number: Optional[int] = Query(
        None, ge=1, description="Optional review round number filter."
    ),
    round_id: Optional[str] = Query(
        None, description="Optional specific review round UUID filter."
    ),
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _dp._ensure_plan_exists(db, plan_id)

    if round_number is not None and round_id is not None:
        raise HTTPException(
            status_code=400,
            detail="Use either round_number or round_id, not both.",
        )

    rounds_stmt = (
        select(PlanReviewRound)
        .where(PlanReviewRound.plan_id == plan_id)
        .order_by(PlanReviewRound.round_number.asc(), PlanReviewRound.created_at.asc())
    )
    if round_number is not None:
        rounds_stmt = rounds_stmt.where(PlanReviewRound.round_number == round_number)
    if round_id is not None:
        round_uuid = _dp._parse_uuid_or_400(round_id, field_name="round_id")
        rounds_stmt = rounds_stmt.where(PlanReviewRound.id == round_uuid)

    round_rows = (await db.execute(rounds_stmt)).scalars().all()
    if (round_number is not None or round_id is not None) and not round_rows:
        detail_target = f"round_number={round_number}" if round_number is not None else f"round_id={round_id}"
        raise HTTPException(
            status_code=404,
            detail=f"Review round not found for plan '{plan_id}' ({detail_target}).",
        )

    round_ids = [row.id for row in round_rows if row.id is not None]
    nodes_stmt = (
        select(PlanReviewNode)
        .where(PlanReviewNode.plan_id == plan_id)
        .order_by(PlanReviewNode.created_at.asc())
    )
    links_stmt = (
        select(PlanReviewLink)
        .where(PlanReviewLink.plan_id == plan_id)
        .order_by(PlanReviewLink.created_at.asc())
    )
    requests_stmt = (
        select(PlanRequest)
        .where(PlanRequest.plan_id == plan_id)
        .order_by(PlanRequest.created_at.asc())
    )
    if round_rows:
        nodes_stmt = nodes_stmt.where(PlanReviewNode.round_id.in_(round_ids))
        links_stmt = links_stmt.where(PlanReviewLink.round_id.in_(round_ids))
        requests_stmt = requests_stmt.where(
            or_(
                PlanRequest.round_id.is_(None),
                PlanRequest.round_id.in_(round_ids),
            )
        )
    elif round_number is not None or round_id is not None:
        nodes_stmt = nodes_stmt.where(False)
        links_stmt = links_stmt.where(False)
        requests_stmt = requests_stmt.where(False)

    node_rows = (await db.execute(nodes_stmt)).scalars().all()
    link_rows = (await db.execute(links_stmt)).scalars().all()
    request_rows = (await db.execute(requests_stmt)).scalars().all()

    return PlanReviewGraphResponse(
        planId=plan_id,
        rounds=[_dp._review_round_to_entry(row) for row in round_rows],
        nodes=[_dp._review_node_to_entry(row) for row in node_rows],
        links=[_review_link_to_entry(row) for row in link_rows],
        requests=[_dp._review_request_to_entry(row) for row in request_rows],
    )


@router.get("/reviews/{plan_id}/source-preview", response_model=PlanSourcePreviewResponse)
async def preview_plan_review_source(
    plan_id: str,
    principal: CurrentUser,
    path: str = Query(..., min_length=1, description="Repo-relative source path, e.g. backend/main/foo.py"),
    start_line: int = Query(..., ge=1, description="Start line (1-based, inclusive)."),
    end_line: Optional[int] = Query(None, ge=1, description="End line (1-based, inclusive). Defaults to start_line."),
    db: AsyncSession = Depends(get_database),
):
    try:
        _validate_plan_id(plan_id, field_name="plan_id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    bundle = await _dp.get_plan_bundle(db, plan_id)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")

    if not _dp._can_preview_plan_source(principal, bundle):
        raise HTTPException(
            status_code=403,
            detail="Source preview is restricted to plan owner or admin.",
        )

    resolved_end = end_line if end_line is not None else start_line
    if resolved_end < start_line:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid line range: {start_line}-{resolved_end}",
        )
    if resolved_end - start_line + 1 > _SOURCE_PREVIEW_MAX_LINES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Line range too large ({start_line}-{resolved_end}). "
                f"Max {_SOURCE_PREVIEW_MAX_LINES} lines."
            ),
        )

    try:
        file_path, relative_path = _dp._resolve_repo_file(path)
        rows, resolved_end = _dp._read_source_snippet(
            file_path,
            start_line=start_line,
            end_line=resolved_end,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return PlanSourcePreviewResponse(
        planId=plan_id,
        path=relative_path,
        startLine=start_line,
        endLine=resolved_end,
        lines=rows,
    )

