from __future__ import annotations

from typing import List, Optional, Dict, Any, Tuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession, NpcExpressionSvc
from pixsim7.backend.main.domain.game.models import GameNPC, NPCSchedule, NPCState, GameWorldState


router = APIRouter()


class NpcSummary(BaseModel):
    id: int
    name: str


class NpcExpressionDTO(BaseModel):
    id: Optional[int] = None
    state: str
    asset_id: int
    crop: Optional[Dict[str, Any]] = None
    meta: Optional[Dict[str, Any]] = None


class NpcPresenceDTO(BaseModel):
    npc_id: int
    location_id: int
    state: Dict[str, Any]


SECONDS_PER_DAY = 24 * 60 * 60
DAYS_PER_WEEK = 7


def _split_world_time(world_time: float) -> Tuple[int, float]:
    """
    Map a continuous world_time (seconds) into (day_of_week, seconds_in_day).

    day_of_week uses the same convention as NPCSchedule: 0 = Monday.
    """
    if world_time < 0:
        world_time = 0.0
    day_index = int(world_time // SECONDS_PER_DAY)
    day_of_week = day_index % DAYS_PER_WEEK
    seconds_in_day = float(world_time % SECONDS_PER_DAY)
    return day_of_week, seconds_in_day


def _serialize_expression(expression) -> NpcExpressionDTO:
    """Convert an expression ORM row into the API DTO."""

    return NpcExpressionDTO(
        id=expression.id,
        state=expression.state,
        asset_id=expression.asset_id,
        crop=expression.crop,
        meta=expression.meta,
    )


def _filter_schedules_by_location(
    schedules: List[NPCSchedule], location_id: Optional[int]
) -> List[NPCSchedule]:
    if location_id is None:
        return schedules
    return [s for s in schedules if s.location_id == location_id]


def _build_presence_entry(
    schedule: NPCSchedule, npc_state: Optional[NPCState]
) -> NpcPresenceDTO:
    base_state: Dict[str, Any] = {}
    if npc_state and npc_state.state:
        base_state = dict(npc_state.state)

    # Include lightweight schedule context so callers can derive activity.
    state = dict(base_state)
    schedule_info = state.setdefault("schedule", {})
    if isinstance(schedule_info, dict):
        schedule_info.setdefault("day_of_week", schedule.day_of_week)
        schedule_info.setdefault("start_time", schedule.start_time)
        schedule_info.setdefault("end_time", schedule.end_time)

    return NpcPresenceDTO(
        npc_id=schedule.npc_id,
        location_id=schedule.location_id,
        state=state,
    )


@router.get("/", response_model=List[NpcSummary])
async def list_npcs(
    db: DatabaseSession,
    user: CurrentUser,
) -> List[NpcSummary]:
    """
    List game NPCs.

    Currently returns all NPCs; future versions may filter by workspace/user.
    """
    result = await db.execute(select(GameNPC).order_by(GameNPC.id))
    npcs = result.scalars().all()
    return [NpcSummary(id=n.id, name=n.name) for n in npcs]


@router.get("/{npc_id}/expressions", response_model=List[NpcExpressionDTO])
async def get_npc_expressions(
    npc_id: int,
    npc_expression_service: NpcExpressionSvc,
    user: CurrentUser,
) -> List[NpcExpressionDTO]:
    """
    Get all expression mappings for an NPC.
    """
    expressions = await npc_expression_service.list_expressions(npc_id)
    return [_serialize_expression(e) for e in expressions]


@router.put("/{npc_id}/expressions", response_model=List[NpcExpressionDTO])
async def replace_npc_expressions(
    npc_id: int,
    payload: Dict[str, Any],
    npc_expression_service: NpcExpressionSvc,
    user: CurrentUser,
) -> List[NpcExpressionDTO]:
    """
    Replace all expressions for an NPC.

    Body shape:
      {
        "expressions": [
          { "state": "idle", "asset_id": 123, "crop": {...}, "meta": {...} },
          ...
        ]
      }
    """
    rows = payload.get("expressions") or []
    if not isinstance(rows, list):
        raise HTTPException(status_code=400, detail="expressions must be a list")

    created = await npc_expression_service.replace_expressions(npc_id, rows)
    return [_serialize_expression(e) for e in created]


@router.get("/presence", response_model=List[NpcPresenceDTO])
async def get_npc_presence(
    world_time: Optional[float] = None,
    world_id: Optional[int] = None,
    location_id: Optional[int] = None,
    db: DatabaseSession = None,
    user: CurrentUser = None,
) -> List[NpcPresenceDTO]:
    """
    Compute NPC presence for a given world_time (in seconds).

    This endpoint is backend-agnostic w.r.t. presentation (2D/3D) and simply
    answers: "which NPCs are scheduled to be where at this time?"

    - world_time: continuous game time in seconds (0 = Monday 00:00).
    - world_id: optional world identifier; when provided and world_time is
      omitted, the server will use the global world_time from game_world_states.
    - location_id: optional filter; if provided, only NPCs at this location
      are returned.

    TODO: Add Redis caching for performance optimization
    Cache key format: f"npc_presence:{world_id}:{location_id}:{round(world_time/3600)}"
    This would group by hour to maximize cache hits while maintaining accuracy.
    Suggested TTL: Until next turn in turn-based mode, or 60s in real-time mode.
    """
    effective_world_time: float
    if world_time is not None:
      effective_world_time = float(world_time)
    elif world_id is not None:
      state = await db.get(GameWorldState, world_id)
      effective_world_time = float(state.world_time or 0.0) if state else 0.0
    else:
      effective_world_time = 0.0

    day_of_week, seconds_in_day = _split_world_time(effective_world_time)

    # Find schedule entries that are active at this time.
    schedules_result = await db.execute(
        select(NPCSchedule).where(
            NPCSchedule.day_of_week == day_of_week,
            NPCSchedule.start_time <= seconds_in_day,
            NPCSchedule.end_time > seconds_in_day,
        )
    )
    schedules = list(schedules_result.scalars().all())
    schedules = _filter_schedules_by_location(schedules, location_id)

    if not schedules:
        return []

    npc_ids = {s.npc_id for s in schedules}

    # Load any explicit NPCState overrides for these NPCs.
    states_result = await db.execute(select(NPCState).where(NPCState.npc_id.in_(npc_ids)))
    state_rows = list(states_result.scalars().all())
    state_by_npc: Dict[int, NPCState] = {row.npc_id: row for row in state_rows}

    return [
        _build_presence_entry(sched, state_by_npc.get(sched.npc_id))
        for sched in schedules
    ]
