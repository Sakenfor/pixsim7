"""Todo-summary route — open-work view across plans.

Purpose-built endpoint that answers "which plans have open work to continue?"
without forcing the caller to dump every plan's full detail. Pairs with the
``plans.activity`` C-lite trim (in ``routes_admin.py``) for AI-agent plan
discovery: activity feed shows what's hot, this endpoint shows what's open.

Open-work signal is computed from ``points_done < points_total`` per
checkpoint — checkpoint ``status`` is rarely flipped from "pending" in
practice, so it cannot be used as a completion signal.
"""
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database
from pixsim7.backend.main.api.v1.plans import helpers as _h
from pixsim7.backend.main.api.v1.plans.schemas import (
    PlanTodoSummary,
    PlanTodoSummaryResponse,
)
from pixsim7.backend.main.services.docs.plan_write import list_plan_bundles
from pixsim7.backend.main.shared.datetime_utils import utcnow

router = APIRouter()


@router.get("/todo-summary", response_model=PlanTodoSummaryResponse)
async def get_todo_summary(
    _user: CurrentUser,
    stage: Optional[str] = Query(
        None,
        description="Filter by plan stage (e.g. 'implementation', 'design', 'rollout').",
    ),
    tag: Optional[str] = Query(None, description="Filter by tag (exact match)."),
    owner: Optional[str] = Query(None, description="Substring match on owner."),
    q: Optional[str] = Query(
        None,
        description=(
            "Free-text search. Same scope as plans.list: scalars + list "
            "fields + checkpoint text (label, description, note, criteria, "
            "steps[].label, last_update.note). Lets callers ask 'which "
            "plans about X have open work?'."
        ),
    ),
    q_includes_body: bool = Query(
        False,
        description=(
            "When true and ``q`` is set, also search the plan markdown body."
        ),
    ),
    status: str = Query(
        "active",
        description="Plan status filter. Default 'active'; pass empty string to include all.",
    ),
    min_open_points: int = Query(
        1,
        ge=0,
        description="Only include plans with at least this many open points (default 1 — hides plans where all checkpoints are done).",
    ),
    since_days: Optional[int] = Query(
        None,
        ge=1,
        le=365,
        description="Only include plans whose last_touched_at is within the last N days.",
    ),
    limit: int = Query(50, ge=1, le=200, description="Max plans in result."),
    max_open_checkpoints: int = Query(
        8,
        ge=1,
        le=50,
        description="Cap the open-checkpoint list per plan (default 8). Full detail via plans.detail.",
    ),
    include_hidden: bool = Query(False, description="Include archived/removed plans."),
    db: AsyncSession = Depends(get_database),
):
    """Per-plan open-checkpoint summary, sorted by last_touched_at desc.

    Empty ``status`` ('') skips the status filter so callers can see open work
    across done/parked plans too.
    """
    bundles = await list_plan_bundles(db)
    bundles = _h._filter_bundles(
        bundles,
        status=status if status else None,
        owner=owner,
        tag=tag,
        q=q,
        include_hidden=include_hidden,
        include_body=q_includes_body,
    )
    if stage:
        bundles = [
            b for b in bundles
            if _h._normalize_stage_for_response(b.plan.stage) == stage
        ]

    cutoff_iso: Optional[str] = None
    if since_days:
        cutoff_iso = (
            datetime.now(tz=timezone.utc) - timedelta(days=since_days)
        ).isoformat()

    summaries: List[PlanTodoSummary] = []
    for b in bundles:
        matched_cp_ids = (
            _h._collect_matched_checkpoint_ids(b, q, include_body=q_includes_body)
            if q
            else None
        )
        s = _h._bundle_to_todo_summary(
            b,
            max_open_checkpoints=max_open_checkpoints,
            matched_checkpoint_ids=matched_cp_ids,
        )
        if s is None:
            continue
        if s.open_points < min_open_points:
            continue
        if cutoff_iso and s.last_touched_at and s.last_touched_at < cutoff_iso:
            continue
        summaries.append(s)

    summaries.sort(key=lambda s: s.last_touched_at, reverse=True)
    summaries = summaries[:limit]

    return PlanTodoSummaryResponse(
        version="1",
        generated_at=utcnow().isoformat(),
        plans=summaries,
        total=len(summaries),
    )
