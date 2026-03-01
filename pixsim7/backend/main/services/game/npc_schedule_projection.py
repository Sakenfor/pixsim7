from __future__ import annotations

from dataclasses import dataclass
import logging
import re
from typing import Any, Dict, List, Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.game import GameLocation, GameNPC, GameWorld, NPCSchedule


SECONDS_PER_DAY = 24 * 3600
SCHEDULE_ROUTINE_SOURCE = "compiled_from_npc_schedule"

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class NPCScheduleSlot:
    day_of_week: int
    start_time: float
    end_time: float
    location_key: str
    label: Optional[str] = None


@dataclass(frozen=True)
class NPCScheduleProjection:
    npc_key: str
    npc_name: str
    routine_id: str
    schedules: Sequence[NPCScheduleSlot]
    default_preferences: Optional[Dict[str, Any]] = None


def _activity_ids_by_location(behavior_template: Dict[str, Any]) -> Dict[str, List[str]]:
    activities = behavior_template.get("activities")
    if not isinstance(activities, dict):
        return {}

    by_location: Dict[str, List[str]] = {}
    for activity_id in sorted(activities.keys()):
        activity = activities.get(activity_id)
        if not isinstance(activity, dict):
            continue
        meta = activity.get("meta")
        if not isinstance(meta, dict):
            continue
        location_key = meta.get("location_hint")
        if isinstance(location_key, str) and location_key:
            by_location.setdefault(location_key, []).append(str(activity_id))
    return by_location


def _preferred_activities_for_schedule_slot(
    *,
    schedule: NPCScheduleSlot,
    activity_ids_by_location: Dict[str, List[str]],
    fallback_activity_ids: List[str],
) -> List[Dict[str, Any]]:
    activity_ids = list(activity_ids_by_location.get(schedule.location_key) or [])
    if not activity_ids:
        activity_ids = list(fallback_activity_ids)

    preferred: List[Dict[str, Any]] = []
    for index, activity_id in enumerate(activity_ids):
        # Keep deterministic descending preference while still offering alternatives.
        weight = max(0.35, 1.0 - (index * 0.2))
        preferred.append({"activityId": activity_id, "weight": round(weight, 2)})
    return preferred


def compile_routines_from_schedule_projections(
    behavior_template: Dict[str, Any],
    projections: Sequence[NPCScheduleProjection],
    *,
    source: str = "compiled_from_npc_schedule",
    seed_key: Optional[str] = None,
    fallback_activity_count: int = 2,
) -> Dict[str, Dict[str, Any]]:
    """
    Compile schedule projections into behavior routines.

    This keeps authored schedule data (storage/projection) separate from the
    runtime decision graph shape used by the behavior engine.
    """
    activities = behavior_template.get("activities")
    if not isinstance(activities, dict) or not activities:
        return {}

    activity_ids_by_location = _activity_ids_by_location(behavior_template)
    fallback_count = max(1, int(fallback_activity_count))
    fallback_activity_ids = [str(activity_id) for activity_id in sorted(activities.keys())[:fallback_count]]

    compiled_routines: Dict[str, Dict[str, Any]] = {}

    for projection in projections:
        ordered_slots = sorted(
            projection.schedules,
            key=lambda slot: (slot.day_of_week, slot.start_time, slot.end_time, slot.location_key),
        )

        nodes: List[Dict[str, Any]] = []
        for index, schedule in enumerate(ordered_slots):
            preferred = _preferred_activities_for_schedule_slot(
                schedule=schedule,
                activity_ids_by_location=activity_ids_by_location,
                fallback_activity_ids=fallback_activity_ids,
            )
            if not preferred:
                continue

            start = float(schedule.start_time)
            end = float(schedule.end_time)
            day_of_week = int(schedule.day_of_week)

            if end <= start:
                # Routine schema requires start < end. Split overnight slots into two nodes.
                wrap_nodes = [
                    (start, float(SECONDS_PER_DAY), "part_a"),
                    (0.0, end, "part_b"),
                ]
                for wrap_start, wrap_end, suffix in wrap_nodes:
                    if wrap_end <= wrap_start:
                        continue
                    nodes.append(
                        {
                            "id": f"slot_{projection.npc_key}_{index}_{suffix}",
                            "nodeType": "time_slot",
                            "timeRangeSeconds": {"start": wrap_start, "end": wrap_end},
                            "preferredActivities": preferred,
                            "meta": {
                                "source": source,
                                "day_of_week": day_of_week,
                                "location_key": schedule.location_key,
                                "label": schedule.label,
                                "wrap_split": True,
                            },
                        }
                    )
                continue

            nodes.append(
                {
                    "id": f"slot_{projection.npc_key}_{index}",
                    "nodeType": "time_slot",
                    "timeRangeSeconds": {"start": start, "end": end},
                    "preferredActivities": preferred,
                    "meta": {
                        "source": source,
                        "day_of_week": day_of_week,
                        "location_key": schedule.location_key,
                        "label": schedule.label,
                    },
                }
            )

        if not nodes:
            continue

        routine_meta: Dict[str, Any] = {
            "source": source,
            "npc_key": projection.npc_key,
        }
        if seed_key:
            routine_meta["seed_key"] = seed_key

        compiled_routines[projection.routine_id] = {
            "version": 1,
            "id": projection.routine_id,
            "name": f"{projection.npc_name} Schedule Routine",
            "nodes": nodes,
            "edges": [],
            "defaultPreferences": (
                dict(projection.default_preferences)
                if isinstance(projection.default_preferences, dict)
                else None
            ),
            "meta": routine_meta,
        }

    return compiled_routines


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _slugify(value: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9]+", "_", value.strip().lower()).strip("_")
    return base or "unknown_location"


def _resolve_schedule_location_key(schedule: NPCSchedule, location: Optional[GameLocation]) -> str:
    if location is not None:
        location_meta = _as_dict(getattr(location, "meta", {}))
        location_key = location_meta.get("location_key")
        if isinstance(location_key, str) and location_key.strip():
            return location_key.strip()
        if isinstance(location.name, str) and location.name.strip():
            return _slugify(location.name)
    return f"location_{int(schedule.location_id)}"


def _resolve_schedule_label(schedule: NPCSchedule) -> Optional[str]:
    rule = _as_dict(schedule.rule)
    label = rule.get("label")
    if isinstance(label, str) and label.strip():
        return label.strip()
    return None


def _resolve_npc_routine_binding(npc: GameNPC) -> tuple[str, Optional[Dict[str, Any]], bool]:
    personality = _as_dict(getattr(npc, "personality", {}))
    behavior = _as_dict(personality.get("behavior"))

    routine_id_raw = behavior.get("routineId") or personality.get("routineId")
    if isinstance(routine_id_raw, str) and routine_id_raw.strip():
        routine_id = routine_id_raw.strip()
        preferences = behavior.get("preferences")
        return (
            routine_id,
            dict(preferences) if isinstance(preferences, dict) else None,
            False,
        )

    routine_id = f"npc.schedule.{int(npc.id)}"
    behavior["routineId"] = routine_id
    personality["routineId"] = routine_id
    personality["behavior"] = behavior
    npc.personality = personality

    preferences = behavior.get("preferences")
    return (
        routine_id,
        dict(preferences) if isinstance(preferences, dict) else None,
        True,
    )


def _is_schedule_compiled_routine(value: Any, *, source: str = SCHEDULE_ROUTINE_SOURCE) -> bool:
    if not isinstance(value, dict):
        return False
    meta = _as_dict(value.get("meta"))
    return meta.get("source") == source


async def sync_npc_schedule_projection(db: AsyncSession, npc_id: int) -> None:
    """
    Sync one NPC's authored schedule rows into the world's behavior routine graph.

    Intended to be called by schedule CRUD hooks after schedule mutations.
    """
    npc = await db.get(GameNPC, int(npc_id))
    if npc is None or npc.id is None or npc.world_id is None:
        return

    world = await db.get(GameWorld, int(npc.world_id))
    if world is None:
        return

    schedules_result = await db.execute(
        select(NPCSchedule)
        .where(NPCSchedule.npc_id == int(npc.id))
        .order_by(NPCSchedule.day_of_week, NPCSchedule.start_time, NPCSchedule.end_time, NPCSchedule.id)
    )
    schedules = list(schedules_result.scalars().all())

    location_ids = sorted({int(schedule.location_id) for schedule in schedules})
    locations_by_id: Dict[int, GameLocation] = {}
    if location_ids:
        locations_result = await db.execute(
            select(GameLocation).where(GameLocation.id.in_(location_ids))
        )
        for location in locations_result.scalars().all():
            if location.id is not None:
                locations_by_id[int(location.id)] = location

    routine_id, default_preferences, personality_changed = _resolve_npc_routine_binding(npc)

    projection = NPCScheduleProjection(
        npc_key=f"npc_{int(npc.id)}",
        npc_name=str(npc.name),
        routine_id=routine_id,
        default_preferences=default_preferences,
        schedules=[
            NPCScheduleSlot(
                day_of_week=int(schedule.day_of_week),
                start_time=float(schedule.start_time),
                end_time=float(schedule.end_time),
                location_key=_resolve_schedule_location_key(
                    schedule,
                    locations_by_id.get(int(schedule.location_id)),
                ),
                label=_resolve_schedule_label(schedule),
            )
            for schedule in schedules
        ],
    )

    world_meta = _as_dict(getattr(world, "meta", {}))
    behavior_config = _as_dict(world_meta.get("behavior"))
    routines = _as_dict(behavior_config.get("routines"))

    compiled = compile_routines_from_schedule_projections(
        behavior_config,
        [projection],
        source=SCHEDULE_ROUTINE_SOURCE,
    )

    changed = False
    if routine_id in compiled:
        next_routine = compiled[routine_id]
        if routines.get(routine_id) != next_routine:
            routines[routine_id] = next_routine
            changed = True
    else:
        existing = routines.get(routine_id)
        if _is_schedule_compiled_routine(existing):
            routines.pop(routine_id, None)
            changed = True

    if changed:
        behavior_config = dict(behavior_config)
        behavior_config["routines"] = routines
        if "version" not in behavior_config:
            behavior_config["version"] = 1

        behavior_meta = _as_dict(behavior_config.get("meta"))
        behavior_meta.setdefault("routine_source", "compiled_from_npc_schedules")
        behavior_config["meta"] = behavior_meta

        world_meta = dict(world_meta)
        world_meta["behavior"] = behavior_config
        world.meta = world_meta
        db.add(world)

    if personality_changed:
        db.add(npc)
        changed = True

    if changed:
        await db.commit()
        logger.debug("Synced schedule projection for npc_id=%s (routine=%s)", npc.id, routine_id)
