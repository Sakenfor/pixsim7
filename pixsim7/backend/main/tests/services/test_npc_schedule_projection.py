from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from pixsim7.backend.main.services.game.npc_schedule_projection import (
    SECONDS_PER_DAY,
    NPCScheduleProjection,
    NPCScheduleSlot,
    compile_routines_from_schedule_projections,
    sync_npc_schedule_projection,
)


def _behavior_template() -> dict:
    return {
        "activities": {
            "activity.alpha": {"id": "activity.alpha", "meta": {"location_hint": "deck"}},
            "activity.beta": {"id": "activity.beta", "meta": {"location_hint": "bar"}},
            "activity.gamma": {"id": "activity.gamma", "meta": {"location_hint": "deck"}},
        }
    }


def test_compile_routines_includes_day_scoped_slot_meta() -> None:
    template = _behavior_template()
    projections = [
        NPCScheduleProjection(
            npc_key="gorilla",
            npc_name="Gorilla",
            routine_id="routine.gorilla",
            schedules=[
                NPCScheduleSlot(day_of_week=1, start_time=8 * 3600, end_time=12 * 3600, location_key="deck"),
            ],
        )
    ]

    routines = compile_routines_from_schedule_projections(template, projections, seed_key="seed_1")
    routine = routines["routine.gorilla"]
    node = routine["nodes"][0]

    assert routine["meta"]["source"] == "compiled_from_npc_schedule"
    assert routine["meta"]["seed_key"] == "seed_1"
    assert node["meta"]["day_of_week"] == 1
    assert node["meta"]["location_key"] == "deck"
    assert [item["activityId"] for item in node["preferredActivities"]] == [
        "activity.alpha",
        "activity.gamma",
    ]


def test_compile_routines_splits_overnight_slots() -> None:
    template = _behavior_template()
    projections = [
        NPCScheduleProjection(
            npc_key="banana",
            npc_name="Banana",
            routine_id="routine.banana",
            schedules=[
                NPCScheduleSlot(
                    day_of_week=3,
                    start_time=23 * 3600,
                    end_time=2 * 3600,
                    location_key="bar",
                    label="overnight_shift",
                ),
            ],
        )
    ]

    routines = compile_routines_from_schedule_projections(template, projections)
    nodes = routines["routine.banana"]["nodes"]

    assert len(nodes) == 2
    assert nodes[0]["timeRangeSeconds"] == {"start": float(23 * 3600), "end": float(24 * 3600)}
    assert nodes[1]["timeRangeSeconds"] == {"start": 0.0, "end": float(2 * 3600)}
    assert nodes[0]["meta"]["day_of_week"] == 3
    assert nodes[0]["meta"]["wrap_split"] is True
    assert nodes[1]["meta"]["wrap_split"] is True


def test_compile_routines_uses_fallback_when_location_has_no_activity_match() -> None:
    template = _behavior_template()
    projections = [
        NPCScheduleProjection(
            npc_key="gorilla",
            npc_name="Gorilla",
            routine_id="routine.gorilla",
            schedules=[
                NPCScheduleSlot(day_of_week=0, start_time=0, end_time=3600, location_key="unknown"),
            ],
        )
    ]

    routines = compile_routines_from_schedule_projections(template, projections, fallback_activity_count=2)
    preferred = routines["routine.gorilla"]["nodes"][0]["preferredActivities"]

    assert [item["activityId"] for item in preferred] == ["activity.alpha", "activity.beta"]
    assert [item["weight"] for item in preferred] == [1.0, 0.8]


def test_compile_routines_handles_invalid_and_edge_time_bounds() -> None:
    template = _behavior_template()
    projections = [
        NPCScheduleProjection(
            npc_key="bounds",
            npc_name="Bounds",
            routine_id="routine.bounds",
            schedules=[
                NPCScheduleSlot(day_of_week=8, start_time=-500, end_time=100, location_key="deck"),
                NPCScheduleSlot(day_of_week=-1, start_time=500, end_time=500, location_key="deck"),
                NPCScheduleSlot(day_of_week=0, start_time=0, end_time=SECONDS_PER_DAY, location_key="bar"),
            ],
        )
    ]

    routines = compile_routines_from_schedule_projections(template, projections)
    nodes = routines["routine.bounds"]["nodes"]

    assert len(nodes) == 2
    assert nodes[0]["meta"]["day_of_week"] == 0
    assert nodes[0]["timeRangeSeconds"] == {"start": 0.0, "end": float(SECONDS_PER_DAY)}
    assert nodes[1]["meta"]["day_of_week"] == 1
    assert nodes[1]["timeRangeSeconds"] == {"start": 0.0, "end": 100.0}


def test_compile_routines_node_ordering_is_deterministic() -> None:
    template = _behavior_template()
    slots = [
        NPCScheduleSlot(day_of_week=2, start_time=3600, end_time=7200, location_key="bar"),
        NPCScheduleSlot(day_of_week=1, start_time=100, end_time=200, location_key="deck_b"),
        NPCScheduleSlot(day_of_week=1, start_time=100, end_time=200, location_key="deck_a"),
    ]

    projection_a = NPCScheduleProjection(
        npc_key="det",
        npc_name="Deterministic",
        routine_id="routine.det",
        schedules=slots,
    )
    projection_b = NPCScheduleProjection(
        npc_key="det",
        npc_name="Deterministic",
        routine_id="routine.det",
        schedules=list(reversed(slots)),
    )

    routines_a = compile_routines_from_schedule_projections(template, [projection_a])
    routines_b = compile_routines_from_schedule_projections(template, [projection_b])

    nodes_a = routines_a["routine.det"]["nodes"]
    nodes_b = routines_b["routine.det"]["nodes"]

    assert nodes_a == nodes_b
    assert [node["meta"]["location_key"] for node in nodes_a] == ["deck_a", "deck_b", "bar"]


class _RowsResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return list(self._rows)


def _mock_db(**overrides) -> AsyncMock:
    db = AsyncMock()
    db.add = MagicMock()
    for key, value in overrides.items():
        setattr(db, key, value)
    return db


def _make_npc(
    *,
    npc_id: int = 1,
    world_id: int = 10,
    personality: dict | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=npc_id,
        world_id=world_id,
        name="TestNPC",
        personality=personality or {},
    )


def _make_world(meta: dict) -> SimpleNamespace:
    return SimpleNamespace(
        id=10,
        owner_user_id=1,
        name="TestWorld",
        meta=meta,
    )


def _make_schedule(
    *,
    schedule_id: int = 1,
    npc_id: int = 1,
    day_of_week: int = 0,
    start_time: float = 0.0,
    end_time: float = 3600.0,
    location_id: int = 1,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=schedule_id,
        npc_id=npc_id,
        day_of_week=day_of_week,
        start_time=start_time,
        end_time=end_time,
        location_id=location_id,
        rule=None,
    )


@pytest.mark.asyncio
async def test_sync_uses_location_id_fallback_key_when_location_record_missing() -> None:
    npc = _make_npc(npc_id=1, world_id=10, personality={})
    world = _make_world(
        {
            "behavior": {
                "activities": {
                    "activity.location_77": {
                        "id": "activity.location_77",
                        "meta": {"location_hint": "location_77"},
                    }
                },
                "routines": {},
            }
        }
    )
    schedule = _make_schedule(
        npc_id=1,
        day_of_week=2,
        start_time=9 * 3600,
        end_time=10 * 3600,
        location_id=77,
    )

    async def _mock_get(model, pk):
        if model.__name__ == "GameNPC":
            return npc
        if model.__name__ == "GameWorld":
            return world
        return None

    db = _mock_db(
        get=AsyncMock(side_effect=_mock_get),
        execute=AsyncMock(side_effect=[_RowsResult([schedule]), _RowsResult([])]),
        commit=AsyncMock(),
    )

    await sync_npc_schedule_projection(db, 1)

    routine_id = npc.personality["behavior"]["routineId"]
    node = world.meta["behavior"]["routines"][routine_id]["nodes"][0]
    assert node["meta"]["location_key"] == "location_77"
    assert node["preferredActivities"][0]["activityId"] == "activity.location_77"


@pytest.mark.asyncio
async def test_sync_preserves_non_compiled_routine_when_schedules_disappear() -> None:
    routine_id = "routine.authored"
    npc = _make_npc(
        npc_id=1,
        world_id=10,
        personality={"behavior": {"routineId": routine_id}, "routineId": routine_id},
    )
    world = _make_world(
        {
            "behavior": {
                "activities": {"activity.alpha": {"id": "activity.alpha", "meta": {"location_hint": "deck"}}},
                "routines": {
                    routine_id: {
                        "id": routine_id,
                        "name": "Authored Routine",
                        "nodes": [],
                        "edges": [],
                        "meta": {"source": "author_defined"},
                    }
                },
            }
        }
    )

    async def _mock_get(model, pk):
        if model.__name__ == "GameNPC":
            return npc
        if model.__name__ == "GameWorld":
            return world
        return None

    db = _mock_db(
        get=AsyncMock(side_effect=_mock_get),
        execute=AsyncMock(return_value=_RowsResult([])),
        commit=AsyncMock(),
    )

    await sync_npc_schedule_projection(db, 1)

    assert routine_id in world.meta["behavior"]["routines"]
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_sync_removes_only_target_compiled_routine_when_schedules_disappear() -> None:
    target_routine_id = "npc.schedule.1"
    npc = _make_npc(
        npc_id=1,
        world_id=10,
        personality={"behavior": {"routineId": target_routine_id}, "routineId": target_routine_id},
    )
    world = _make_world(
        {
            "behavior": {
                "activities": {"activity.alpha": {"id": "activity.alpha", "meta": {"location_hint": "deck"}}},
                "routines": {
                    target_routine_id: {
                        "id": target_routine_id,
                        "nodes": [],
                        "edges": [],
                        "meta": {"source": "compiled_from_npc_schedule"},
                    },
                    "npc.schedule.2": {
                        "id": "npc.schedule.2",
                        "nodes": [],
                        "edges": [],
                        "meta": {"source": "compiled_from_npc_schedule"},
                    },
                    "routine.authored": {
                        "id": "routine.authored",
                        "nodes": [],
                        "edges": [],
                        "meta": {"source": "author_defined"},
                    },
                },
            }
        }
    )

    async def _mock_get(model, pk):
        if model.__name__ == "GameNPC":
            return npc
        if model.__name__ == "GameWorld":
            return world
        return None

    db = _mock_db(
        get=AsyncMock(side_effect=_mock_get),
        execute=AsyncMock(return_value=_RowsResult([])),
        commit=AsyncMock(),
    )

    await sync_npc_schedule_projection(db, 1)

    routines = world.meta["behavior"]["routines"]
    assert target_routine_id not in routines
    assert "npc.schedule.2" in routines
    assert "routine.authored" in routines
    db.commit.assert_awaited_once()
