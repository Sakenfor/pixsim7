from __future__ import annotations

from typing import List, Optional, Dict, Any, Tuple

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import select

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession, NpcExpressionSvc
from pixsim7.backend.main.domain.game.models import GameNPC, NPCSchedule, NPCState, GameWorldState
from pixsim7.backend.main.services.game.npc_stat_service import NPCStatService


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


class UpdateNpcStatsRequest(BaseModel):
    """Request to update NPC stats."""
    stat_updates: Dict[str, Any]
    runtime: bool = True  # If True, update NPCState; if False, update GameNPC base stats


class NpcStatsResponse(BaseModel):
    """Response containing NPC stats."""
    npc_id: int
    stat_type: str
    stats: Dict[str, Any]
    is_runtime: bool = False  # Indicates if stats include runtime overrides


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


def _filter_schedules_by_location(
    schedules: List[NPCSchedule], location_id: Optional[int]
) -> List[NPCSchedule]:
    """
    If a location_id is provided, filter schedules to those matching that location.
    Otherwise return all schedules.
    """
    if location_id is None:
        return schedules
    return [s for s in schedules if s.location_id == location_id]


def _build_presence_entry(sched: NPCSchedule, npc_state: Optional[NPCState]) -> NpcPresenceDTO:
    """
    Build a presence entry for an NPC based on schedule and state.

    The state can override the location_id from the schedule.
    """
    location_id = sched.location_id
    state_dict = {}
    if npc_state is not None:
        if npc_state.current_location_id is not None:
            location_id = npc_state.current_location_id
        if npc_state.state:
            state_dict = npc_state.state

    return NpcPresenceDTO(
        npc_id=sched.npc_id,
        location_id=location_id,
        state=state_dict,
    )


@router.get("/", response_model=List[NpcSummary])
async def list_npcs(
    user: CurrentUser,
    db: DatabaseSession,
) -> List[NpcSummary]:
    """
    List all NPCs.
    """
    result = await db.execute(select(GameNPC))
    npcs = list(result.scalars().all())
    return [NpcSummary(id=npc.id, name=npc.name) for npc in npcs]


@router.get("/{npc_id}/expressions", response_model=List[NpcExpressionDTO])
async def get_npc_expressions(
    npc_id: int,
    user: CurrentUser,
    npc_expression_svc: NpcExpressionSvc,
) -> List[NpcExpressionDTO]:
    """
    Retrieve all expressions (portraits/animations) for an NPC.
    """
    expressions = await npc_expression_svc.get_expressions_for_npc(npc_id)
    return [
        NpcExpressionDTO(
            id=expr.id,
            state=expr.state,
            asset_id=expr.asset_id,
            crop=expr.crop,
            meta=expr.meta,
        )
        for expr in expressions
    ]


@router.post("/{npc_id}/expressions", response_model=NpcExpressionDTO)
async def create_npc_expression(
    npc_id: int,
    req: NpcExpressionDTO,
    user: CurrentUser,
    npc_expression_svc: NpcExpressionSvc,
) -> NpcExpressionDTO:
    """
    Create a new expression mapping for an NPC.
    """
    expr = await npc_expression_svc.create_expression(
        npc_id=npc_id,
        state=req.state,
        asset_id=req.asset_id,
        crop=req.crop or {},
        meta=req.meta or {},
    )
    return NpcExpressionDTO(
        id=expr.id,
        state=expr.state,
        asset_id=expr.asset_id,
        crop=expr.crop,
        meta=expr.meta,
    )


@router.delete("/{npc_id}/expressions/{expression_id}")
async def delete_npc_expression(
    npc_id: int,
    expression_id: int,
    user: CurrentUser,
    npc_expression_svc: NpcExpressionSvc,
):
    """
    Delete an expression mapping for an NPC.
    """
    await npc_expression_svc.delete_expression(expression_id)
    return {"ok": True}


@router.get("/presence", response_model=List[NpcPresenceDTO])
async def get_npc_presence(
    db: DatabaseSession,
    user: CurrentUser,
    world_id: Optional[int] = None,
    location_id: Optional[int] = None,
) -> List[NpcPresenceDTO]:
    """
    Get NPCs present at a specific location and time based on their schedules.

    Args:
        world_id: Optional world ID to get world time from
        location_id: Optional location ID to filter by

    Returns:
        List of NPCs present at the current world time
    """
    # Determine effective world time
    effective_world_time = 0.0
    if world_id is not None:
        result = await db.execute(
            select(GameWorldState.world_time).where(GameWorldState.world_id == world_id)
        )
        state_row = result.one_or_none()
        if state_row is not None:
            effective_world_time = float(state_row[0])
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


# ============================================================================
# NPC STAT ENDPOINTS (NEW)
# ============================================================================


def get_npc_stat_service(db: DatabaseSession) -> NPCStatService:
    """Dependency injection for NPCStatService."""
    return NPCStatService(db)


@router.get("/{npc_id}/stats/{stat_type}", response_model=NpcStatsResponse)
async def get_npc_stats(
    npc_id: int,
    stat_type: str,
    user: CurrentUser,
    npc_stat_service: NPCStatService = Depends(get_npc_stat_service),
    world_id: Optional[int] = None,
) -> NpcStatsResponse:
    """
    Get NPC's effective stats (base + runtime overrides).

    Args:
        npc_id: The NPC ID
        stat_type: The stat definition ID (e.g., "combat_skills", "attributes")
        world_id: Optional world ID for stat definition lookup

    Returns:
        Normalized stats with computed tiers/levels

    Example:
        GET /npcs/1/stats/combat_skills?world_id=5
        → {"npc_id": 1, "stat_type": "combat_skills", "stats": {"strength": 100, "strengthTierId": "expert"}}
    """
    try:
        stats = await npc_stat_service.get_npc_effective_stats(
            npc_id,
            stat_type,
            world_id=world_id
        )
        return NpcStatsResponse(
            npc_id=npc_id,
            stat_type=stat_type,
            stats=stats,
            is_runtime=True
        )
    except ValueError as e:
        if str(e) == "npc_not_found":
            raise HTTPException(status_code=404, detail="NPC not found")
        raise


@router.patch("/{npc_id}/stats/{stat_type}", response_model=NpcStatsResponse)
async def update_npc_stats(
    npc_id: int,
    stat_type: str,
    req: UpdateNpcStatsRequest,
    user: CurrentUser,
    npc_stat_service: NPCStatService = Depends(get_npc_stat_service),
    world_id: Optional[int] = None,
) -> NpcStatsResponse:
    """
    Update NPC's stats (base or runtime).

    Args:
        npc_id: The NPC ID
        stat_type: The stat definition ID
        req: Stat updates and whether to update runtime vs base
        world_id: Optional world ID for stat definition lookup

    Returns:
        Updated stats

    Example:
        PATCH /npcs/1/stats/attributes
        {"stat_updates": {"health": 65}, "runtime": true}
        → Updates runtime stats (NPC took damage)

        PATCH /npcs/1/stats/combat_skills
        {"stat_updates": {"strength": 95}, "runtime": false}
        → Updates base stats (NPC leveled up)
    """
    try:
        if req.runtime:
            # Update runtime stats (NPCState)
            await npc_stat_service.update_npc_runtime_stats(
                npc_id,
                stat_type,
                req.stat_updates
            )
        else:
            # Update base stats (GameNPC)
            await npc_stat_service.update_npc_base_stats(
                npc_id,
                stat_type,
                req.stat_updates
            )

        # Return effective stats
        stats = await npc_stat_service.get_npc_effective_stats(
            npc_id,
            stat_type,
            world_id=world_id
        )

        return NpcStatsResponse(
            npc_id=npc_id,
            stat_type=stat_type,
            stats=stats,
            is_runtime=req.runtime
        )
    except ValueError as e:
        if str(e) == "npc_not_found":
            raise HTTPException(status_code=404, detail="NPC not found")
        raise


@router.delete("/{npc_id}/stats/{stat_type}")
async def reset_npc_runtime_stats(
    npc_id: int,
    stat_type: str,
    user: CurrentUser,
    npc_stat_service: NPCStatService = Depends(get_npc_stat_service),
) -> Dict[str, Any]:
    """
    Reset NPC's runtime stats for a specific stat type.

    This clears all runtime overrides, reverting the NPC to base stats.

    Args:
        npc_id: The NPC ID
        stat_type: The stat definition ID to reset

    Returns:
        Success message

    Example:
        DELETE /npcs/1/stats/attributes
        → Heals NPC back to full health (base stats)
    """
    await npc_stat_service.reset_npc_runtime_stats(npc_id, stat_type)
    return {"ok": True, "message": f"Reset runtime stats for {stat_type}"}
