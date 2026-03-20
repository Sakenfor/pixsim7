from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import Field
from sqlalchemy import delete, select

from pixsim7.backend.main.api.dependencies import CurrentGamePrincipal, DatabaseSession
from pixsim7.backend.main.domain.game import GameLocation, GameNPC, NPCSchedule
from pixsim7.backend.main.services.game.npc_schedule_projection import (
    sync_npc_schedule_projection,
)
from pixsim7.backend.main.shared.schemas.api_base import ApiModel


router = APIRouter()


class GameNPCSummary(ApiModel):
    id: int
    world_id: Optional[int] = None
    name: str
    home_location_id: Optional[int] = None


class GameNPCDetail(GameNPCSummary):
    personality: Dict[str, Any] = Field(default_factory=dict)


class CreateNPCPayload(ApiModel):
    world_id: Optional[int] = None
    name: str
    home_location_id: Optional[int] = None
    personality: Dict[str, Any] = Field(default_factory=dict)


class PutNPCPayload(ApiModel):
    world_id: Optional[int] = None
    name: str
    home_location_id: Optional[int] = None
    personality: Dict[str, Any] = Field(default_factory=dict)


class NPCScheduleDTO(ApiModel):
    id: Optional[int] = None
    day_of_week: int = Field(ge=0, le=6)
    start_time: float
    end_time: float
    location_id: int
    rule: Optional[Dict[str, Any]] = None


class ReplaceNPCSchedulesPayload(ApiModel):
    items: List[NPCScheduleDTO] = Field(default_factory=list)


class NPCScheduleListResponse(ApiModel):
    items: List[NPCScheduleDTO] = Field(default_factory=list)


def _serialize_npc_summary(npc: GameNPC) -> GameNPCSummary:
    return GameNPCSummary(
        id=int(npc.id),
        world_id=npc.world_id,
        name=str(npc.name),
        home_location_id=npc.home_location_id,
    )


def _serialize_npc_detail(npc: GameNPC) -> GameNPCDetail:
    personality = npc.personality if isinstance(npc.personality, dict) else {}
    return GameNPCDetail(
        id=int(npc.id),
        world_id=npc.world_id,
        name=str(npc.name),
        home_location_id=npc.home_location_id,
        personality=personality,
    )


def _serialize_schedule(schedule: NPCSchedule) -> NPCScheduleDTO:
    return NPCScheduleDTO(
        id=int(schedule.id),
        day_of_week=int(schedule.day_of_week),
        start_time=float(schedule.start_time),
        end_time=float(schedule.end_time),
        location_id=int(schedule.location_id),
        rule=schedule.rule if isinstance(schedule.rule, dict) else None,
    )


async def _load_npc_or_404(
    db: DatabaseSession,
    npc_id: int,
    *,
    world_id: Optional[int] = None,
) -> GameNPC:
    npc = await db.get(GameNPC, npc_id)
    if not npc:
        raise HTTPException(status_code=404, detail="NPC not found")

    if world_id is not None and npc.world_id is not None and int(npc.world_id) != int(world_id):
        raise HTTPException(status_code=404, detail="NPC not found")
    return npc


async def _validate_location_ids(
    db: DatabaseSession,
    location_ids: List[int],
    *,
    world_id: Optional[int],
) -> None:
    if not location_ids:
        return

    unique_ids = sorted({int(location_id) for location_id in location_ids})
    rows = await db.execute(
        select(GameLocation.id, GameLocation.world_id).where(GameLocation.id.in_(unique_ids))
    )
    found: Dict[int, Optional[int]] = {int(location_id): location_world_id for location_id, location_world_id in rows.all()}

    missing = [location_id for location_id in unique_ids if location_id not in found]
    if missing:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_location_ids",
                "location_ids": missing,
            },
        )

    if world_id is None:
        return

    mismatched = [
        location_id
        for location_id, location_world_id in found.items()
        if location_world_id is not None and int(location_world_id) != int(world_id)
    ]
    if mismatched:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "location_world_mismatch",
                "world_id": int(world_id),
                "location_ids": sorted(mismatched),
            },
        )


async def _list_npc_schedules(db: DatabaseSession, npc_id: int) -> List[NPCSchedule]:
    rows = await db.execute(
        select(NPCSchedule)
        .where(NPCSchedule.npc_id == npc_id)
        .order_by(NPCSchedule.day_of_week, NPCSchedule.start_time, NPCSchedule.end_time, NPCSchedule.id)
    )
    return list(rows.scalars().all())


@router.get("/", response_model=List[GameNPCSummary])
async def list_npcs(
    db: DatabaseSession,
    user: CurrentGamePrincipal,
    world_id: Optional[int] = None,
) -> List[GameNPCSummary]:
    stmt = select(GameNPC).order_by(GameNPC.id)
    if world_id is not None:
        stmt = stmt.where(GameNPC.world_id == world_id)
    rows = await db.execute(stmt)
    npcs = list(rows.scalars().all())
    return [_serialize_npc_summary(npc) for npc in npcs]


@router.get("/{npc_id}", response_model=GameNPCDetail)
async def get_npc(
    npc_id: int,
    db: DatabaseSession,
    user: CurrentGamePrincipal,
    world_id: Optional[int] = None,
) -> GameNPCDetail:
    npc = await _load_npc_or_404(db, npc_id, world_id=world_id)
    return _serialize_npc_detail(npc)


@router.post("/", response_model=GameNPCDetail, status_code=201)
async def create_npc(
    payload: CreateNPCPayload,
    db: DatabaseSession,
    user: CurrentGamePrincipal,
    world_id: Optional[int] = None,
) -> GameNPCDetail:
    effective_world_id = world_id if world_id is not None else payload.world_id
    if payload.home_location_id is not None:
        await _validate_location_ids(
            db,
            [int(payload.home_location_id)],
            world_id=effective_world_id,
        )

    npc = GameNPC(
        world_id=effective_world_id,
        name=payload.name,
        home_location_id=payload.home_location_id,
        personality=payload.personality or {},
    )
    db.add(npc)
    await db.commit()
    await db.refresh(npc)
    return _serialize_npc_detail(npc)


@router.put("/{npc_id}", response_model=GameNPCDetail)
async def put_npc(
    npc_id: int,
    payload: PutNPCPayload,
    db: DatabaseSession,
    user: CurrentGamePrincipal,
    world_id: Optional[int] = None,
) -> GameNPCDetail:
    npc = await _load_npc_or_404(db, npc_id, world_id=world_id)

    effective_world_id = world_id if world_id is not None else payload.world_id
    validation_world_id = effective_world_id if effective_world_id is not None else npc.world_id
    if payload.home_location_id is not None:
        await _validate_location_ids(
            db,
            [int(payload.home_location_id)],
            world_id=validation_world_id,
        )

    npc.name = payload.name
    npc.home_location_id = payload.home_location_id
    npc.personality = payload.personality or {}
    if effective_world_id is not None:
        npc.world_id = int(effective_world_id)

    db.add(npc)
    await db.commit()
    await db.refresh(npc)
    return _serialize_npc_detail(npc)


@router.get("/{npc_id}/schedules", response_model=NPCScheduleListResponse)
async def list_npc_schedules(
    npc_id: int,
    db: DatabaseSession,
    user: CurrentGamePrincipal,
    world_id: Optional[int] = None,
) -> NPCScheduleListResponse:
    npc = await _load_npc_or_404(db, npc_id, world_id=world_id)
    schedules = await _list_npc_schedules(db, int(npc.id))
    return NPCScheduleListResponse(items=[_serialize_schedule(schedule) for schedule in schedules])


@router.put("/{npc_id}/schedules", response_model=NPCScheduleListResponse)
async def replace_npc_schedules(
    npc_id: int,
    payload: ReplaceNPCSchedulesPayload,
    db: DatabaseSession,
    user: CurrentGamePrincipal,
    world_id: Optional[int] = None,
) -> NPCScheduleListResponse:
    npc = await _load_npc_or_404(db, npc_id, world_id=world_id)

    validation_world_id = world_id if world_id is not None else npc.world_id
    await _validate_location_ids(
        db,
        [int(item.location_id) for item in payload.items],
        world_id=validation_world_id,
    )

    await db.execute(delete(NPCSchedule).where(NPCSchedule.npc_id == int(npc.id)))

    created: List[NPCSchedule] = []
    for item in payload.items:
        schedule = NPCSchedule(
            npc_id=int(npc.id),
            day_of_week=int(item.day_of_week),
            start_time=float(item.start_time),
            end_time=float(item.end_time),
            location_id=int(item.location_id),
            rule=item.rule if isinstance(item.rule, dict) else None,
        )
        db.add(schedule)
        created.append(schedule)

    await db.commit()
    for schedule in created:
        await db.refresh(schedule)

    await sync_npc_schedule_projection(db, int(npc.id))
    return NPCScheduleListResponse(items=[_serialize_schedule(schedule) for schedule in created])
