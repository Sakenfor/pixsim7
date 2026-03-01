from __future__ import annotations

from pixsim7.backend.main.services.game.npc_schedule_projection import (
    NPCScheduleProjection,
    NPCScheduleSlot,
    compile_routines_from_schedule_projections,
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
