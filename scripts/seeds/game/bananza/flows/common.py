from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict, List

from pixsim7.backend.main.services.game.npc_schedule_projection import (
    NPCScheduleProjection,
    NPCScheduleSlot,
    compile_routines_from_schedule_projections,
)

from ..seed_data import (
    BEHAVIOR_TEMPLATE,
    BOOTSTRAP_PROFILE,
    BOOTSTRAP_SOURCE_KEY,
    NPC_BEHAVIOR_BINDINGS,
    NPC_SEEDS,
    REGISTERED_SOURCE_PACKS,
    REGISTERED_TEMPLATE_PACKS,
)


def build_behavior_config() -> Dict[str, Any]:
    behavior_config = deepcopy(BEHAVIOR_TEMPLATE)
    projections: List[NPCScheduleProjection] = []
    for npc_seed in NPC_SEEDS:
        binding = NPC_BEHAVIOR_BINDINGS.get(npc_seed.key, {})
        routine_id = str(
            binding.get("routineId") or f"bananza.routine.{npc_seed.key}.schedule_compiled"
        )
        default_preferences = (
            dict(binding.get("preferences"))
            if isinstance(binding.get("preferences"), dict)
            else None
        )

        projections.append(
            NPCScheduleProjection(
                npc_key=npc_seed.key,
                npc_name=npc_seed.name,
                routine_id=routine_id,
                default_preferences=default_preferences,
                schedules=[
                    NPCScheduleSlot(
                        day_of_week=schedule.day_of_week,
                        start_time=schedule.start_time,
                        end_time=schedule.end_time,
                        location_key=schedule.location_key,
                        label=schedule.label,
                    )
                    for schedule in npc_seed.schedules
                ],
            )
        )

    compiled_routines = compile_routines_from_schedule_projections(
        behavior_config,
        projections,
        source="compiled_from_npc_schedule",
    )

    if compiled_routines:
        behavior_config["routines"] = compiled_routines

    meta = behavior_config.get("meta")
    if not isinstance(meta, dict):
        meta = {}
    meta["bootstrap_source"] = BOOTSTRAP_SOURCE_KEY
    meta["routine_source"] = "compiled_from_npc_schedules"
    behavior_config["meta"] = meta
    return behavior_config


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def base_world_meta(world_name: str = "") -> Dict[str, Any]:
    normalized = world_name.strip() or "world"
    upsert_key = f"{BOOTSTRAP_SOURCE_KEY}:world:{normalized}"
    return {
        "genre": "comedy_adventure",
        "premise": (
            "A silly turn-based cruise where Gorilla and Banana trade jokes, "
            "flirt, and chase small goals while schedules keep the world moving."
        ),
        "style": "leisure-suit-larry-inspired parody tone",
        "turn_model": "turn_based",
        "project_world_upsert_key": upsert_key,
        "project_content_packs": {
            "registration_mode": "explicit",
            "registered_source_packs": list(REGISTERED_SOURCE_PACKS),
            "registered_template_packs": list(REGISTERED_TEMPLATE_PACKS),
        },
        "bootstrap": {
            "source": BOOTSTRAP_SOURCE_KEY,
            "profile": BOOTSTRAP_PROFILE,
        },
    }
