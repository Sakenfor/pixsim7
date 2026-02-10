"""
Game NPCs Plugin

Provides NPC management, expressions, schedules, and presence tracking.
Converted from api/v1/game_npcs.py to plugin format.
"""

from __future__ import annotations

from typing import List, Optional, Dict, Any, Tuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession, NpcExpressionSvc
from pixsim7.backend.main.domain.game.core.models import GameNPC, NPCSchedule, NPCState, GameWorldState
from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest


# ===== PLUGIN MANIFEST =====

manifest = PluginManifest(
    id="game_npcs",
    name="Game NPCs & Schedules",
    version="1.0.0",
    description="Provides NPC management, expressions, schedules, and presence tracking",
    author="PixSim Team",
    kind="feature",
    prefix="/api/v1/game/npcs",
    tags=["game-npcs"],
    dependencies=[],  # Independent - no dependencies
    requires_db=True,
    requires_redis=False,
    enabled=True,
)


# ===== API ROUTER =====

router = APIRouter(tags=["game-npcs"])


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
    return [
        NpcExpressionDTO(
            id=e.id,
            state=e.state,
            asset_id=e.asset_id,
            crop=e.crop,
            meta=e.meta,
        )
        for e in expressions
    ]


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
    return [
        NpcExpressionDTO(
            id=e.id,
            state=e.state,
            asset_id=e.asset_id,
            crop=e.crop,
            meta=e.meta,
        )
        for e in created
    ]


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

    if location_id is not None:
        schedules = [s for s in schedules if s.location_id == location_id]

    if not schedules:
        return []

    npc_ids = {s.npc_id for s in schedules}

    # Load any explicit NPCState overrides for these NPCs.
    states_result = await db.execute(select(NPCState).where(NPCState.npc_id.in_(npc_ids)))
    state_rows = list(states_result.scalars().all())
    state_by_npc: Dict[int, NPCState] = {row.npc_id: row for row in state_rows}

    presences: List[NpcPresenceDTO] = []
    for sched in schedules:
        base_state: Dict[str, Any] = {}
        npc_state = state_by_npc.get(sched.npc_id)
        if npc_state and npc_state.state:
            base_state = dict(npc_state.state)

        # Include lightweight schedule context so callers can derive activity.
        state = dict(base_state)
        schedule_info = state.setdefault("schedule", {})
        if isinstance(schedule_info, dict):
            schedule_info.setdefault("day_of_week", sched.day_of_week)
            schedule_info.setdefault("start_time", sched.start_time)
            schedule_info.setdefault("end_time", sched.end_time)

        presences.append(
            NpcPresenceDTO(
                npc_id=sched.npc_id,
                location_id=sched.location_id,
                state=state,
            )
        )

    return presences


# ===== NPC SURFACE PACKAGES =====

class NpcSurfacePackageDTO(BaseModel):
    """DTO for NPC surface packages"""
    id: str
    label: str
    description: Optional[str] = None
    category: Optional[str] = None
    surface_types: Dict[str, Dict[str, Any]]
    source_plugin_id: Optional[str] = None


@router.get("/surface-packages", response_model=List[NpcSurfacePackageDTO])
async def list_npc_surface_packages(
    user: CurrentUser,
) -> List[NpcSurfacePackageDTO]:
    """
    List all registered NPC surface packages.

    Surface packages define available expression surface types (portrait, dialogue,
    closeup, mood, etc.) that can be used when creating NPC expressions.

    Returns a list of all surface packages registered by core and plugins.
    """
    from pixsim7.backend.main.domain.game.entities.npc_surfaces import list_npc_surface_packages

    packages = list_npc_surface_packages()
    return [
        NpcSurfacePackageDTO(
            id=pkg.id,
            label=pkg.label,
            description=pkg.description,
            category=pkg.category,
            surface_types=pkg.surface_types,
            source_plugin_id=pkg.source_plugin_id,
        )
        for pkg in packages.values()
    ]


# ===== LIFECYCLE HOOKS =====

def on_load(app):
    """Called when plugin is loaded (before app starts)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.game-npcs")
    logger.info("Game NPCs plugin loaded")


async def on_enable():
    """Called when plugin is enabled (after app starts)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.game-npcs")
    logger.info("Game NPCs plugin enabled")


async def on_disable():
    """Called when plugin is disabled (before app shuts down)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.game-npcs")
    logger.info("Game NPCs plugin disabled")
