"""
Journey Flow Mapping API (v1).

Endpoints:
- GET /dev/flows/graph
- POST /dev/flows/resolve
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Dict, List, Optional, Tuple
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from pixsim7.backend.main.api.dependencies import get_current_user_optional
from pixsim7.backend.main.domain.user import User
from pixsim7.backend.main.shared.path_registry import get_path_registry

from .dev_flows_contract import (
    FlowBlockedStep,
    FlowCandidateTemplate,
    FlowGraphMetrics,
    FlowGraphV1,
    FlowNextStep,
    FlowResolveContext,
    FlowResolveRequest,
    FlowResolveResponse,
    FlowSuggestedPath,
    FlowTemplate,
    FlowTraceRequest,
    FlowTraceResponse,
    FlowRunSummary,
)
from .dev_flows_templates import get_flow_templates

router = APIRouter(prefix="/dev/flows", tags=["dev"])

_TRACE_LOCK = Lock()
_TRACE_MAX_EVENTS = 2000
_TRACE_MAX_RUNS = 1000
_TRACE_SCHEMA_READY = False
_TRACE_DB_PATH = (get_path_registry().cache_root / "flow_traces.sqlite3").resolve()


@dataclass
class _TemplateEvaluation:
    template: FlowTemplate
    progressed_node_ids: List[str]
    next_step: Optional[FlowNextStep]
    blocked_step: Optional[FlowBlockedStep]


@router.get("/graph", response_model=FlowGraphV1)
async def get_flow_graph(
    user: Optional[User] = Depends(get_current_user_optional),
):
    """Return the curated flow template graph."""
    templates = sorted(get_flow_templates(), key=lambda item: item.id)
    runs, blocked_edges_24h = _get_trace_snapshot()
    return FlowGraphV1(
        version="1.0.0",
        generated_at=_utc_now_iso(),
        templates=templates,
        runs=runs,
        metrics=FlowGraphMetrics(
            total_templates=len(templates),
            total_runs=len(runs),
            blocked_edges_24h=blocked_edges_24h,
        ),
    )


@router.post("/resolve", response_model=FlowResolveResponse)
async def resolve_flow(
    payload: FlowResolveRequest,
    user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Resolve candidate templates and valid next steps for a goal + context.

    Returns deterministic ordering for stable machine consumption.
    """
    context = payload.context or FlowResolveContext()
    templates = sorted(
        [
            template
            for template in get_flow_templates()
            if _template_matches_goal(template, payload.goal)
        ],
        key=lambda item: item.id,
    )

    evaluations = [
        _evaluate_template(template=template, context=context)
        for template in templates
    ]
    evaluations.sort(
        key=lambda item: (0 if item.blocked_step is None else 1, item.template.id)
    )

    candidate_templates = [
        FlowCandidateTemplate(
            id=f"candidate:{evaluation.template.id}",
            kind="candidate_template",
            template_id=evaluation.template.id,
            label=evaluation.template.label,
            domain=evaluation.template.domain,
            status="ready" if evaluation.blocked_step is None else "blocked",
            progressed_node_ids=evaluation.progressed_node_ids,
            reason_code=(
                evaluation.blocked_step.reason_code
                if evaluation.blocked_step is not None
                else None
            ),
            reason=(
                evaluation.blocked_step.reason
                if evaluation.blocked_step is not None
                else None
            ),
            blocked_reason_code=(
                evaluation.blocked_step.reason_code
                if evaluation.blocked_step is not None
                else None
            ),
            blocked_reason=(
                evaluation.blocked_step.reason
                if evaluation.blocked_step is not None
                else None
            ),
        )
        for evaluation in evaluations
    ]

    next_steps: List[FlowNextStep] = []
    next_step_seen = set()
    for evaluation in evaluations:
        if evaluation.next_step is None:
            continue
        dedupe_key = (
            evaluation.next_step.template_id,
            evaluation.next_step.node_id,
        )
        if dedupe_key in next_step_seen:
            continue
        next_step_seen.add(dedupe_key)
        next_steps.append(evaluation.next_step)

    blocked_steps = [
        evaluation.blocked_step
        for evaluation in evaluations
        if evaluation.blocked_step is not None
    ]

    suggested_path = _select_suggested_path(evaluations)

    return FlowResolveResponse(
        version="1.0.0",
        generated_at=_utc_now_iso(),
        goal=payload.goal,
        candidate_templates=candidate_templates,
        next_steps=next_steps,
        blocked_steps=blocked_steps,
        suggested_path=suggested_path,
    )


@router.post("/trace", response_model=FlowTraceResponse)
async def trace_flow_event(
    payload: FlowTraceRequest,
    user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Ingest compact flow trace events.

    v1 stores traces in a lightweight persistent SQLite sink.
    """
    templates = get_flow_templates()
    template_ids = {template.id for template in templates}
    if payload.template_id not in template_ids:
        raise HTTPException(
            status_code=404,
            detail=f'Unknown template_id "{payload.template_id}".',
        )

    run_id, run_summary, blocked_edges_24h = _record_trace_event(payload)
    return FlowTraceResponse(
        accepted=True,
        template_id=payload.template_id,
        run_id=run_id,
        run_summary=run_summary,
        blocked_edges_24h=blocked_edges_24h,
    )


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso_datetime(value: Optional[str]) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    normalized = value.strip().replace("Z", "+00:00")
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _connect_trace_db() -> sqlite3.Connection:
    conn = sqlite3.connect(_TRACE_DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_trace_storage_locked() -> None:
    global _TRACE_SCHEMA_READY
    if _TRACE_SCHEMA_READY:
        return

    with _connect_trace_db() as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS flow_trace_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                template_id TEXT NOT NULL,
                run_id TEXT NOT NULL,
                node_id TEXT NOT NULL,
                status TEXT NOT NULL,
                reason_code TEXT,
                reason TEXT,
                occurred_at TEXT NOT NULL,
                occurred_at_unix INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS flow_trace_runs (
                template_id TEXT NOT NULL,
                run_id TEXT NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                status TEXT NOT NULL,
                last_node_id TEXT,
                PRIMARY KEY (template_id, run_id)
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS ix_flow_trace_events_status_time
            ON flow_trace_events(status, occurred_at_unix)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS ix_flow_trace_events_template_run
            ON flow_trace_events(template_id, run_id)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS ix_flow_trace_runs_template_started
            ON flow_trace_runs(template_id, started_at)
            """
        )

    _TRACE_SCHEMA_READY = True


def _row_to_run_summary(row: sqlite3.Row) -> FlowRunSummary:
    return FlowRunSummary(
        template_id=str(row["template_id"]),
        started_at=str(row["started_at"]),
        ended_at=row["ended_at"],
        status=str(row["status"]),
        last_node_id=row["last_node_id"],
    )


def _record_trace_event(
    payload: FlowTraceRequest,
) -> Tuple[str, FlowRunSummary, int]:
    occurred_at_dt = _parse_iso_datetime(payload.occurred_at)
    occurred_at_iso = occurred_at_dt.isoformat()
    occurred_at_unix = int(occurred_at_dt.timestamp())
    run_id = (payload.run_id or "").strip() or f"run_{uuid4().hex[:12]}"
    is_terminal = payload.status in ("completed", "blocked", "abandoned")
    ended_at_iso = occurred_at_iso if is_terminal else None

    with _TRACE_LOCK:
        _ensure_trace_storage_locked()
        with _connect_trace_db() as conn:
            existing_run = conn.execute(
                """
                SELECT started_at
                FROM flow_trace_runs
                WHERE template_id = ? AND run_id = ?
                """,
                (payload.template_id, run_id),
            ).fetchone()

            started_at = (
                str(existing_run["started_at"])
                if existing_run is not None
                else occurred_at_iso
            )

            if existing_run is None:
                conn.execute(
                    """
                    INSERT INTO flow_trace_runs (
                        template_id,
                        run_id,
                        started_at,
                        ended_at,
                        status,
                        last_node_id
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        payload.template_id,
                        run_id,
                        started_at,
                        ended_at_iso,
                        payload.status,
                        payload.node_id,
                    ),
                )
            else:
                conn.execute(
                    """
                    UPDATE flow_trace_runs
                    SET ended_at = ?, status = ?, last_node_id = ?
                    WHERE template_id = ? AND run_id = ?
                    """,
                    (
                        ended_at_iso,
                        payload.status,
                        payload.node_id,
                        payload.template_id,
                        run_id,
                    ),
                )

            conn.execute(
                """
                INSERT INTO flow_trace_events (
                    template_id,
                    run_id,
                    node_id,
                    status,
                    reason_code,
                    reason,
                    occurred_at,
                    occurred_at_unix
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload.template_id,
                    run_id,
                    payload.node_id,
                    payload.status,
                    payload.reason_code,
                    payload.reason,
                    occurred_at_iso,
                    occurred_at_unix,
                ),
            )

            _prune_trace_state_locked(conn)
            blocked_edges_24h = _count_blocked_edges_24h_locked(
                conn, datetime.now(timezone.utc)
            )
            run_row = conn.execute(
                """
                SELECT template_id, started_at, ended_at, status, last_node_id
                FROM flow_trace_runs
                WHERE template_id = ? AND run_id = ?
                """,
                (payload.template_id, run_id),
            ).fetchone()

    if run_row is None:
        run_summary = FlowRunSummary(
            template_id=payload.template_id,
            started_at=occurred_at_iso,
            ended_at=ended_at_iso,
            status=payload.status,
            last_node_id=payload.node_id,
        )
    else:
        run_summary = _row_to_run_summary(run_row)

    return run_id, run_summary, blocked_edges_24h


def _prune_trace_state_locked(conn: sqlite3.Connection) -> None:
    event_count_row = conn.execute(
        "SELECT COUNT(1) AS count FROM flow_trace_events"
    ).fetchone()
    event_count = int(event_count_row["count"]) if event_count_row is not None else 0
    excess_events = event_count - _TRACE_MAX_EVENTS
    if excess_events > 0:
        conn.execute(
            """
            DELETE FROM flow_trace_events
            WHERE id IN (
                SELECT id
                FROM flow_trace_events
                ORDER BY id ASC
                LIMIT ?
            )
            """,
            (excess_events,),
        )

    run_count_row = conn.execute("SELECT COUNT(1) AS count FROM flow_trace_runs").fetchone()
    run_count = int(run_count_row["count"]) if run_count_row is not None else 0
    excess_runs = run_count - _TRACE_MAX_RUNS
    if excess_runs > 0:
        conn.execute(
            """
            DELETE FROM flow_trace_runs
            WHERE rowid IN (
                SELECT rowid
                FROM flow_trace_runs
                ORDER BY
                    COALESCE(ended_at, ''),
                    started_at,
                    template_id,
                    run_id
                LIMIT ?
            )
            """,
            (excess_runs,),
        )


def _count_blocked_edges_24h_locked(
    conn: sqlite3.Connection,
    now_utc: datetime,
) -> int:
    cutoff_unix = int((now_utc - timedelta(hours=24)).timestamp())
    row = conn.execute(
        """
        SELECT COUNT(1) AS blocked_count
        FROM flow_trace_events
        WHERE status = 'blocked' AND occurred_at_unix >= ?
        """,
        (cutoff_unix,),
    ).fetchone()
    return int(row["blocked_count"]) if row is not None else 0


def _get_trace_snapshot() -> Tuple[List[FlowRunSummary], int]:
    with _TRACE_LOCK:
        _ensure_trace_storage_locked()
        with _connect_trace_db() as conn:
            run_rows = conn.execute(
                """
                SELECT template_id, started_at, ended_at, status, last_node_id
                FROM flow_trace_runs
                ORDER BY template_id, started_at, COALESCE(ended_at, ''), COALESCE(last_node_id, '')
                """
            ).fetchall()
            runs = [_row_to_run_summary(row) for row in run_rows]
            blocked_edges_24h = _count_blocked_edges_24h_locked(
                conn, datetime.now(timezone.utc)
            )

    return runs, blocked_edges_24h


def _reset_trace_state_for_tests() -> None:
    """Test helper: clear persistent trace sink state."""
    with _TRACE_LOCK:
        _ensure_trace_storage_locked()
        with _connect_trace_db() as conn:
            conn.execute("DELETE FROM flow_trace_events")
            conn.execute("DELETE FROM flow_trace_runs")


def _template_matches_goal(template: FlowTemplate, goal: str) -> bool:
    normalized_goal = (goal or "").strip().lower()
    if not normalized_goal:
        return True
    template_id = template.id.lower()
    domain = template.domain.lower()
    return (
        template_id.startswith(normalized_goal)
        or normalized_goal == domain
        or normalized_goal.startswith(f"{domain}.")
    )


def _evaluate_template(
    template: FlowTemplate,
    context: FlowResolveContext,
) -> _TemplateEvaluation:
    nodes_by_id = {node.id: node for node in template.nodes}
    outgoing_by_node: Dict[str, List] = {}
    for edge in template.edges:
        outgoing_by_node.setdefault(edge.from_, []).append(edge)
    for edges in outgoing_by_node.values():
        edges.sort(key=lambda item: (item.id, item.to))

    progressed_node_ids = [template.start_node_id]
    current_node_id = template.start_node_id
    next_step: Optional[FlowNextStep] = None
    blocked_step: Optional[FlowBlockedStep] = None
    visited_node_ids = set()

    while True:
        if current_node_id in visited_node_ids:
            node_label = nodes_by_id.get(current_node_id).label if current_node_id in nodes_by_id else current_node_id
            blocked_step = FlowBlockedStep(
                id=f"blocked:{template.id}:cycle_detected",
                kind="blocked_step",
                template_id=template.id,
                edge_id="cycle_detected",
                node_id=current_node_id,
                label=node_label,
                reason_code="cycle_detected",
                reason="Template contains a cycle and cannot be resolved deterministically.",
            )
            break
        visited_node_ids.add(current_node_id)

        outgoing_edges = outgoing_by_node.get(current_node_id, [])
        if not outgoing_edges:
            break

        edge = outgoing_edges[0]
        target_node = nodes_by_id.get(edge.to)
        target_label = target_node.label if target_node is not None else edge.to

        is_allowed, reason_code, reason = _check_condition(
            condition=edge.condition,
            on_fail_reason=edge.on_fail_reason,
            context=context,
        )
        if not is_allowed:
            blocked_step = FlowBlockedStep(
                id=f"blocked:{template.id}:{edge.id}",
                kind="blocked_step",
                template_id=template.id,
                edge_id=edge.id,
                node_id=edge.to,
                label=target_label,
                reason_code=reason_code,
                reason=reason,
            )
            break

        progressed_node_ids.append(edge.to)
        if next_step is None and target_node is not None:
            next_step = FlowNextStep(
                id=f"step:{template.id}:{target_node.id}",
                template_id=template.id,
                node_id=target_node.id,
                label=target_node.label,
                kind=target_node.kind,
                ref=target_node.ref,
            )
        current_node_id = edge.to

    return _TemplateEvaluation(
        template=template,
        progressed_node_ids=progressed_node_ids,
        next_step=next_step,
        blocked_step=blocked_step,
    )


def _check_condition(
    condition: Optional[str],
    on_fail_reason: Optional[str],
    context: FlowResolveContext,
) -> Tuple[bool, str, str]:
    if not condition:
        return True, "", ""

    capabilities = set(context.capabilities or [])
    flags = set(context.flags or [])

    condition_checks = {
        "requires_project": bool(context.project_id),
        "requires_world": bool(context.world_id),
        "requires_location": bool(context.location_id),
        "requires_character": bool(context.active_character_id),
        "requires_generation_capability": "generation" in capabilities,
        "requires_scene_prep_capability": "scene_prep" in capabilities,
        "requires_room_navigation": "room_navigation_enabled" in flags,
    }

    reason_code_by_condition = {
        "requires_project": "missing_project",
        "requires_world": "missing_world",
        "requires_location": "missing_location",
        "requires_character": "missing_character",
        "requires_generation_capability": "missing_generation_capability",
        "requires_scene_prep_capability": "missing_scene_prep_capability",
        "requires_room_navigation": "room_navigation_not_enabled",
    }

    default_reason_by_condition = {
        "requires_project": "A project is required for this step.",
        "requires_world": "A world is required for this step.",
        "requires_location": "A location is required for this step.",
        "requires_character": "An active character is required for this step.",
        "requires_generation_capability": "Generation capability is required for this step.",
        "requires_scene_prep_capability": "Scene prep capability is required for this step.",
        "requires_room_navigation": "Room navigation must be enabled for this step.",
    }

    if condition not in condition_checks:
        return (
            False,
            "unknown_condition",
            on_fail_reason or f'Unsupported condition "{condition}".',
        )

    if condition_checks[condition]:
        return True, "", ""

    return (
        False,
        reason_code_by_condition[condition],
        on_fail_reason or default_reason_by_condition[condition],
    )


def _select_suggested_path(
    evaluations: List[_TemplateEvaluation],
) -> Optional[FlowSuggestedPath]:
    if not evaluations:
        return None

    ready_evaluations = [
        evaluation for evaluation in evaluations if evaluation.blocked_step is None
    ]
    if ready_evaluations:
        chosen = sorted(
            ready_evaluations,
            key=lambda item: (len(item.progressed_node_ids), item.template.id),
        )[0]
    else:
        chosen = sorted(
            evaluations,
            key=lambda item: (-len(item.progressed_node_ids), item.template.id),
        )[0]

    node_ids = list(chosen.progressed_node_ids)
    blocked = chosen.blocked_step is not None
    blocked_reason_code = None
    blocked_reason = None
    if chosen.blocked_step is not None:
        if not node_ids or node_ids[-1] != chosen.blocked_step.node_id:
            node_ids.append(chosen.blocked_step.node_id)
        blocked_reason_code = chosen.blocked_step.reason_code
        blocked_reason = chosen.blocked_step.reason

    return FlowSuggestedPath(
        id=f"path:{chosen.template.id}",
        kind="suggested_path",
        template_id=chosen.template.id,
        node_ids=node_ids,
        blocked=blocked,
        reason_code=blocked_reason_code,
        reason=blocked_reason,
        blocked_reason_code=blocked_reason_code,
        blocked_reason=blocked_reason,
    )
