from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
import os
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy import delete, select
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

# Allow direct execution via `python scripts/seed_bananza_boat_slice.py`.
REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from pixsim7.backend.main.domain.blocks import BlockPrimitive
from pixsim7.backend.main.domain.game import (
    GameLocation,
    GameNPC,
    GameProjectSnapshot,
    GameWorld,
    GameWorldState,
    NPCSchedule,
)
from pixsim7.backend.main.infrastructure.database.session import (
    get_async_blocks_session,
    get_async_session,
)
from pixsim7.backend.main.domain.game.schemas.project_bundle import (
    BundleLocationData,
    BundleNpcData,
    BundleNpcScheduleData,
    BundleWorldData,
    GameProjectBundle,
    GameProjectCoreBundle,
)
from pixsim7.backend.main.services.game.project_bundle import GameProjectBundleService
from pixsim7.backend.main.services.game.project_storage import GameProjectStorageService


DEMO_WORLD_NAME = "Bananza Boat"
DEMO_PACK = "bananza_boat_demo"
DEMO_PROJECT_NAME = "Bananza Boat Seed Project"
SEED_KEY = "bananza_boat_slice_v1"


@dataclass(frozen=True)
class LocationSeed:
    key: str
    name: str
    x: float
    y: float
    description: str


@dataclass(frozen=True)
class ScheduleSeed:
    day_of_week: int
    start_time: float
    end_time: float
    location_key: str
    label: str


@dataclass(frozen=True)
class NpcSeed:
    key: str
    name: str
    home_location_key: str
    personality: Dict[str, Any]
    schedules: List[ScheduleSeed]


LOCATION_SEEDS: List[LocationSeed] = [
    LocationSeed(
        key="main_deck",
        name="Main Deck",
        x=0.0,
        y=0.0,
        description="Open-air deck where most silly banter starts.",
    ),
    LocationSeed(
        key="captain_cabin",
        name="Captain Cabin",
        x=12.0,
        y=6.0,
        description="Small cabin full of maps, jackets, and bad plans.",
    ),
    LocationSeed(
        key="engine_room",
        name="Engine Room",
        x=-9.0,
        y=-4.0,
        description="Noisy room where the banana-fueled engine lives.",
    ),
    LocationSeed(
        key="banana_bar",
        name="Banana Bar",
        x=5.0,
        y=-2.0,
        description="Tiny cocktail corner serving tropical nonsense.",
    ),
]


NPC_SEEDS: List[NpcSeed] = [
    NpcSeed(
        key="gorilla",
        name="Gorilla",
        home_location_key="captain_cabin",
        personality={
            "archetype": "bumbling_captain",
            "tone": "playful_confident",
            "hook": "tries smooth lines, usually trips over props",
        },
        schedules=[
            ScheduleSeed(0, 8 * 3600, 12 * 3600, "main_deck", "Morning pep walk"),
            ScheduleSeed(0, 12 * 3600, 16 * 3600, "engine_room", "Checks the banana engine"),
            ScheduleSeed(0, 16 * 3600, 22 * 3600, "banana_bar", "Evening charm attempts"),
        ],
    ),
    NpcSeed(
        key="banana",
        name="Banana",
        home_location_key="banana_bar",
        personality={
            "archetype": "quick_witted_host",
            "tone": "flirty_sardonic",
            "hook": "runs circles around Gorilla with dry humor",
        },
        schedules=[
            ScheduleSeed(0, 7 * 3600, 14 * 3600, "banana_bar", "Runs bar and gossips"),
            ScheduleSeed(0, 14 * 3600, 18 * 3600, "main_deck", "Deck social rounds"),
            ScheduleSeed(0, 18 * 3600, 23 * 3600, "captain_cabin", "Night cap strategy talks"),
        ],
    ),
]


PRIMITIVE_SEEDS: List[Dict[str, Any]] = [
    {
        "block_id": "bananza.environment.main_deck.day",
        "category": "environment",
        "text": "Sunlit cruise deck with bright railings and comic tropical energy.",
        "tags": {
            "setting": "main_deck",
            "mood": "playful",
            "source_pack": DEMO_PACK,
            "world": "bananza_boat",
            "duration_sec": 6.0,
        },
    },
    {
        "block_id": "bananza.environment.captain_cabin.evening",
        "category": "environment",
        "text": "Cozy captain cabin with nautical clutter and warm evening glow.",
        "tags": {
            "setting": "captain_cabin",
            "mood": "cozy",
            "source_pack": DEMO_PACK,
            "world": "bananza_boat",
            "duration_sec": 6.0,
        },
    },
    {
        "block_id": "bananza.light.tropical_noon",
        "category": "light",
        "text": "Crisp tropical noon lighting with high contrast and bright highlights.",
        "tags": {
            "lighting": "daylight_hard",
            "source_pack": DEMO_PACK,
            "world": "bananza_boat",
            "duration_sec": 5.0,
        },
    },
    {
        "block_id": "bananza.light.sunset_reflections",
        "category": "light",
        "text": "Golden sunset light reflecting off water and polished wood.",
        "tags": {
            "lighting": "golden_hour",
            "mood": "romantic",
            "source_pack": DEMO_PACK,
            "world": "bananza_boat",
            "duration_sec": 5.0,
        },
    },
    {
        "block_id": "bananza.camera.two_shot.deck",
        "category": "camera",
        "text": "Medium two-shot framing both characters while tracking deck movement.",
        "tags": {
            "framing": "two_shot_medium",
            "location_hint": "main_deck",
            "source_pack": DEMO_PACK,
            "world": "bananza_boat",
            "duration_sec": 6.0,
        },
    },
    {
        "block_id": "bananza.camera.wide_boat_reveal",
        "category": "camera",
        "text": "Wide establishing shot revealing boat scale and comic stage space.",
        "tags": {
            "framing": "wide_establishing",
            "source_pack": DEMO_PACK,
            "world": "bananza_boat",
            "duration_sec": 6.0,
        },
    },
    {
        "block_id": "bananza.pose.gorilla.relaxed_standing",
        "category": "character_pose",
        "text": "Gorilla stands relaxed with exaggerated confidence and open shoulders.",
        "tags": {
            "stance": "standing",
            "actor": "gorilla",
            "source_pack": DEMO_PACK,
            "world": "bananza_boat",
            "duration_sec": 6.0,
        },
    },
    {
        "block_id": "bananza.pose.banana.confident_standing",
        "category": "character_pose",
        "text": "Banana stands with playful confidence and sharp expression timing.",
        "tags": {
            "stance": "standing",
            "actor": "banana",
            "source_pack": DEMO_PACK,
            "world": "bananza_boat",
            "duration_sec": 6.0,
        },
    },
    {
        "block_id": "bananza.location.deck_railing",
        "category": "location",
        "text": "Character positioned near deck railing with ocean horizon behind.",
        "tags": {
            "position": "deck_railing",
            "setting": "main_deck",
            "source_pack": DEMO_PACK,
            "world": "bananza_boat",
            "duration_sec": 5.0,
        },
    },
    {
        "block_id": "bananza.location.bar_counter",
        "category": "location",
        "text": "Character anchored at banana bar counter with props in foreground.",
        "tags": {
            "position": "bar_counter",
            "setting": "banana_bar",
            "source_pack": DEMO_PACK,
            "world": "bananza_boat",
            "duration_sec": 5.0,
        },
    },
    {
        "block_id": "bananza.mood.slapstick_flirt",
        "category": "mood",
        "text": "Comedic flirtation energy with mischievous timing and light teasing.",
        "tags": {
            "mood": "playful",
            "tone": "slapstick",
            "source_pack": DEMO_PACK,
            "world": "bananza_boat",
            "duration_sec": 4.0,
        },
    },
    {
        "block_id": "bananza.mood.awkward_pause",
        "category": "mood",
        "text": "Awkward beat with expressive silence before the next punchline.",
        "tags": {
            "mood": "awkward",
            "tone": "comic_pause",
            "source_pack": DEMO_PACK,
            "world": "bananza_boat",
            "duration_sec": 4.0,
        },
    },
    {
        "block_id": "bananza.wardrobe.gorilla.leisure_suit",
        "category": "wardrobe",
        "text": "Turquoise leisure suit with loud lapels and intentionally bad taste.",
        "tags": {
            "intimacy_level": "romantic",
            "outfit": "gorilla_leisure_suit",
            "source_pack": DEMO_PACK,
            "world": "bananza_boat",
            "duration_sec": 4.0,
        },
    },
    {
        "block_id": "bananza.wardrobe.banana.sun_dress",
        "category": "wardrobe",
        "text": "Bright yellow sun dress styled for tropical evening banter scenes.",
        "tags": {
            "intimacy_level": "romantic",
            "outfit": "banana_sun_dress",
            "source_pack": DEMO_PACK,
            "world": "bananza_boat",
            "duration_sec": 4.0,
        },
    },
]


BEHAVIOR_TEMPLATE: Dict[str, Any] = {
    "version": 2,
    "npcConfig": {
        "defaultArchetypeId": "bananza.playful_captain",
        "archetypes": {
            "bananza.playful_captain": {
                "id": "bananza.playful_captain",
                "name": "Playful Captain",
                "description": "Showy confidence, high social drive, light work focus.",
                "traits": {
                    "extraversion": "high",
                    "conscientiousness": "medium",
                    "openness": "medium",
                },
                "behaviorModifiers": {
                    "categoryWeights": {
                        "social": 1.35,
                        "work": 1.1,
                        "rest": 0.8,
                    }
                },
                "tags": ["bananza", "captain"],
            },
            "bananza.quick_wit_host": {
                "id": "bananza.quick_wit_host",
                "name": "Quick-Wit Host",
                "description": "Social, observant, and in-control.",
                "traits": {
                    "extraversion": "medium",
                    "conscientiousness": "high",
                    "openness": "high",
                },
                "behaviorModifiers": {
                    "categoryWeights": {
                        "social": 1.3,
                        "work": 1.2,
                        "rest": 0.75,
                    }
                },
                "tags": ["bananza", "host"],
            },
        },
    },
    "activityCategories": {
        "social": {"id": "social", "label": "Social", "defaultWeight": 0.65},
        "work": {"id": "work", "label": "Work", "defaultWeight": 0.55},
        "rest": {"id": "rest", "label": "Rest", "defaultWeight": 0.5},
    },
    "activities": {
        "bananza.activity.deck_charm_rounds": {
            "id": "bananza.activity.deck_charm_rounds",
            "name": "Deck Charm Rounds",
            "category": "social",
            "minDurationSeconds": 1200.0,
            "visual": {"sceneIntent": "bananza.deck.social_rounds"},
            "meta": {"location_hint": "main_deck"},
        },
        "bananza.activity.engine_checks": {
            "id": "bananza.activity.engine_checks",
            "name": "Banana Engine Checks",
            "category": "work",
            "minDurationSeconds": 1500.0,
            "visual": {"sceneIntent": "bananza.engine.room_check"},
            "meta": {"location_hint": "engine_room"},
        },
        "bananza.activity.bar_hosting": {
            "id": "bananza.activity.bar_hosting",
            "name": "Bar Hosting",
            "category": "work",
            "minDurationSeconds": 1800.0,
            "visual": {"sceneIntent": "bananza.bar.hosting"},
            "meta": {"location_hint": "banana_bar"},
        },
        "bananza.activity.cabin_banter": {
            "id": "bananza.activity.cabin_banter",
            "name": "Cabin Banter",
            "category": "social",
            "minDurationSeconds": 1200.0,
            "visual": {"sceneIntent": "bananza.cabin.banter"},
            "meta": {"location_hint": "captain_cabin"},
        },
    },
    "routines": {
        "bananza.routine.gorilla.day_cycle": {
            "version": 1,
            "id": "bananza.routine.gorilla.day_cycle",
            "name": "Gorilla Daily Cycle",
            "nodes": [
                {
                    "id": "slot_morning",
                    "nodeType": "time_slot",
                    "timeRangeSeconds": {"start": 8 * 3600, "end": 12 * 3600},
                    "preferredActivities": [
                        {"activityId": "bananza.activity.deck_charm_rounds", "weight": 1.0}
                    ],
                },
                {
                    "id": "slot_afternoon",
                    "nodeType": "time_slot",
                    "timeRangeSeconds": {"start": 12 * 3600, "end": 16 * 3600},
                    "preferredActivities": [
                        {"activityId": "bananza.activity.engine_checks", "weight": 1.0}
                    ],
                },
                {
                    "id": "slot_evening",
                    "nodeType": "time_slot",
                    "timeRangeSeconds": {"start": 16 * 3600, "end": 23 * 3600},
                    "preferredActivities": [
                        {"activityId": "bananza.activity.bar_hosting", "weight": 0.8},
                        {"activityId": "bananza.activity.cabin_banter", "weight": 0.6},
                    ],
                },
            ],
            "edges": [],
            "defaultPreferences": {
                "categoryWeights": {"social": 0.8, "work": 0.7, "rest": 0.4}
            },
        },
        "bananza.routine.banana.day_cycle": {
            "version": 1,
            "id": "bananza.routine.banana.day_cycle",
            "name": "Banana Daily Cycle",
            "nodes": [
                {
                    "id": "slot_morning",
                    "nodeType": "time_slot",
                    "timeRangeSeconds": {"start": 7 * 3600, "end": 14 * 3600},
                    "preferredActivities": [
                        {"activityId": "bananza.activity.bar_hosting", "weight": 1.0}
                    ],
                },
                {
                    "id": "slot_afternoon",
                    "nodeType": "time_slot",
                    "timeRangeSeconds": {"start": 14 * 3600, "end": 18 * 3600},
                    "preferredActivities": [
                        {"activityId": "bananza.activity.deck_charm_rounds", "weight": 0.9},
                        {"activityId": "bananza.activity.cabin_banter", "weight": 0.5},
                    ],
                },
                {
                    "id": "slot_evening",
                    "nodeType": "time_slot",
                    "timeRangeSeconds": {"start": 18 * 3600, "end": 23 * 3600},
                    "preferredActivities": [
                        {"activityId": "bananza.activity.cabin_banter", "weight": 1.0}
                    ],
                },
            ],
            "edges": [],
            "defaultPreferences": {
                "categoryWeights": {"social": 0.85, "work": 0.75, "rest": 0.35}
            },
        },
    },
}


SIMULATION_TEMPLATE: Dict[str, Any] = {
    "timeScale": 60.0,
    "maxNpcTicksPerStep": 50,
    "maxJobOpsPerStep": 10,
    "tickIntervalSeconds": 1.0,
    "tiers": {
        "detailed": {"maxNpcs": 20, "description": "Nearby or critical NPCs"},
        "active": {"maxNpcs": 100, "description": "Relevant but not focused NPCs"},
        "ambient": {"maxNpcs": 500, "description": "Background world NPCs"},
        "dormant": {"maxNpcs": 5000, "description": "Dormant world population"},
    },
    "pauseSimulation": False,
    "meta": {"seed_key": "bananza_boat_slice_v1"},
}


NPC_BEHAVIOR_BINDINGS: Dict[str, Dict[str, Any]] = {
    "gorilla": {
        "archetypeId": "bananza.playful_captain",
        "routineId": "bananza.routine.gorilla.day_cycle",
        "preferences": {"categoryWeights": {"social": 0.8, "work": 0.7, "rest": 0.4}},
    },
    "banana": {
        "archetypeId": "bananza.quick_wit_host",
        "routineId": "bananza.routine.banana.day_cycle",
        "preferences": {"categoryWeights": {"social": 0.85, "work": 0.75, "rest": 0.35}},
    },
}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


async def _ensure_world(
    db: AsyncSession,
    *,
    owner_user_id: int,
    world_name: str,
) -> GameWorld:
    existing = await db.execute(
        select(GameWorld)
        .where(
            GameWorld.owner_user_id == owner_user_id,
            GameWorld.name == world_name,
        )
        .order_by(GameWorld.id.desc())
    )
    world = existing.scalars().first()

    base_meta = {
        "seed_key": "bananza_boat_slice_v1",
        "genre": "comedy_adventure",
        "premise": (
            "A silly turn-based cruise where Gorilla and Banana trade jokes, "
            "flirt, and chase small goals while schedules keep the world moving."
        ),
        "style": "leisure-suit-larry-inspired parody tone",
        "turn_model": "turn_based",
    }

    if world is None:
        world = GameWorld(
            owner_user_id=owner_user_id,
            name=world_name,
            meta=base_meta,
        )
        db.add(world)
        await db.flush()
    else:
        merged_meta = dict(world.meta or {})
        merged_meta.update(base_meta)
        world.meta = merged_meta
        db.add(world)
        await db.flush()

    if world.id is None:
        raise RuntimeError("failed_to_create_or_load_world")

    state = await db.get(GameWorldState, world.id)
    if state is None:
        db.add(GameWorldState(world_id=world.id, world_time=0.0, meta={"seeded": True}))
    else:
        state.meta = dict(state.meta or {})
        state.meta["seeded"] = True
        db.add(state)

    await db.commit()
    await db.refresh(world)
    return world


async def _upsert_locations(
    db: AsyncSession,
    *,
    world_id: int,
) -> Dict[str, GameLocation]:
    locations_by_key: Dict[str, GameLocation] = {}

    for seed in LOCATION_SEEDS:
        result = await db.execute(
            select(GameLocation).where(
                GameLocation.world_id == world_id,
                GameLocation.name == seed.name,
            )
        )
        location = result.scalars().first()
        if location is None:
            location = GameLocation(
                world_id=world_id,
                name=seed.name,
                x=seed.x,
                y=seed.y,
                meta={
                    "seed_key": "bananza_boat_slice_v1",
                    "location_key": seed.key,
                    "description": seed.description,
                },
            )
            db.add(location)
            await db.flush()
        else:
            location.x = seed.x
            location.y = seed.y
            meta = dict(location.meta or {})
            meta.update(
                {
                    "seed_key": "bananza_boat_slice_v1",
                    "location_key": seed.key,
                    "description": seed.description,
                }
            )
            location.meta = meta
            db.add(location)
            await db.flush()

        locations_by_key[seed.key] = location

    await db.commit()
    for location in locations_by_key.values():
        await db.refresh(location)
    return locations_by_key


async def _upsert_npcs_and_schedules(
    db: AsyncSession,
    *,
    world_id: int,
    locations_by_key: Dict[str, GameLocation],
) -> Dict[str, GameNPC]:
    npcs_by_key: Dict[str, GameNPC] = {}

    for seed in NPC_SEEDS:
        home_location = locations_by_key.get(seed.home_location_key)
        result = await db.execute(
            select(GameNPC).where(
                GameNPC.world_id == world_id,
                GameNPC.name == seed.name,
            )
        )
        npc = result.scalars().first()
        if npc is None:
            npc = GameNPC(
                world_id=world_id,
                name=seed.name,
                home_location_id=(home_location.id if home_location is not None else None),
                personality=dict(seed.personality),
            )
            db.add(npc)
            await db.flush()
        else:
            npc.home_location_id = home_location.id if home_location is not None else None
            personality = dict(npc.personality or {})
            personality.update(seed.personality)
            personality["seed_key"] = "bananza_boat_slice_v1"
            npc.personality = personality
            db.add(npc)
            await db.flush()

        if npc.id is None:
            raise RuntimeError(f"failed_to_upsert_npc:{seed.name}")
        npcs_by_key[seed.key] = npc

    # Keep schedules deterministic by replacing schedules for seeded NPCs.
    seeded_npc_ids = [npc.id for npc in npcs_by_key.values() if npc.id is not None]
    if seeded_npc_ids:
        await db.execute(delete(NPCSchedule).where(NPCSchedule.npc_id.in_(seeded_npc_ids)))

    for seed in NPC_SEEDS:
        npc = npcs_by_key[seed.key]
        if npc.id is None:
            continue
        for sched in seed.schedules:
            location = locations_by_key.get(sched.location_key)
            if location is None or location.id is None:
                continue
            db.add(
                NPCSchedule(
                    npc_id=npc.id,
                    day_of_week=sched.day_of_week,
                    start_time=sched.start_time,
                    end_time=sched.end_time,
                    location_id=location.id,
                    rule={
                        "seed_key": "bananza_boat_slice_v1",
                        "label": sched.label,
                    },
                )
            )

    await db.commit()
    for npc in npcs_by_key.values():
        await db.refresh(npc)
    return npcs_by_key


async def _upsert_behavior_templates(
    db: AsyncSession,
    *,
    world_id: int,
    npcs_by_key: Dict[str, GameNPC],
) -> Dict[str, Any]:
    world = await db.get(GameWorld, world_id)
    if world is None:
        raise RuntimeError("world_not_found_for_behavior_seed")

    world_meta = dict(world.meta or {})
    world_meta["behavior"] = dict(BEHAVIOR_TEMPLATE)

    existing_simulation = world_meta.get("simulation")
    merged_simulation = dict(SIMULATION_TEMPLATE)
    if isinstance(existing_simulation, dict):
        merged_simulation.update(existing_simulation)
    world_meta["simulation"] = merged_simulation

    world.meta = world_meta
    db.add(world)

    updated_npcs = 0
    for npc_key, npc in npcs_by_key.items():
        binding = NPC_BEHAVIOR_BINDINGS.get(npc_key)
        if not binding:
            continue

        personality = dict(npc.personality or {})
        behavior = dict(personality.get("behavior") or {})

        behavior["routineId"] = binding["routineId"]
        if isinstance(binding.get("preferences"), dict):
            behavior["preferences"] = dict(binding["preferences"])

        personality["archetypeId"] = binding["archetypeId"]
        personality["routineId"] = binding["routineId"]
        personality["behavior"] = behavior
        personality["seed_key"] = "bananza_boat_slice_v1"

        npc.personality = personality
        db.add(npc)
        updated_npcs += 1

    await db.commit()
    await db.refresh(world)
    for npc in npcs_by_key.values():
        await db.refresh(npc)

    return {
        "world_id": world.id,
        "routines": len(BEHAVIOR_TEMPLATE.get("routines", {})),
        "activities": len(BEHAVIOR_TEMPLATE.get("activities", {})),
        "npcs_bound": updated_npcs,
    }


async def _upsert_primitives() -> Dict[str, int]:
    created = 0
    updated = 0

    async with get_async_blocks_session() as blocks_db:
        for seed in PRIMITIVE_SEEDS:
            block_id = str(seed["block_id"])
            result = await blocks_db.execute(
                select(BlockPrimitive).where(BlockPrimitive.block_id == block_id)
            )
            block = result.scalars().first()

            tags = dict(seed.get("tags") or {})
            category = str(seed["category"])
            text = str(seed["text"])
            source = "system"
            now = _now_utc()

            if block is None:
                block = BlockPrimitive(
                    block_id=block_id,
                    category=category,
                    text=text,
                    tags=tags,
                    source=source,
                    is_public=True,
                    avg_rating=4.0,
                    usage_count=0,
                    created_at=now,
                    updated_at=now,
                )
                blocks_db.add(block)
                created += 1
            else:
                block.category = category
                block.text = text
                block.tags = tags
                block.source = source
                block.is_public = True
                if block.avg_rating is None:
                    block.avg_rating = 4.0
                block.updated_at = now
                blocks_db.add(block)
                updated += 1

        await blocks_db.commit()

    return {"created": created, "updated": updated, "total": len(PRIMITIVE_SEEDS)}


async def _build_minimal_project_bundle(
    db: AsyncSession,
    *,
    world_id: int,
) -> GameProjectBundle:
    world = await db.get(GameWorld, world_id)
    if world is None:
        raise ValueError("world_not_found_for_bundle")
    state = await db.get(GameWorldState, world_id)

    locations_result = await db.execute(
        select(GameLocation).where(GameLocation.world_id == world_id).order_by(GameLocation.id)
    )
    locations = list(locations_result.scalars().all())

    npcs_result = await db.execute(
        select(GameNPC).where(GameNPC.world_id == world_id).order_by(GameNPC.id)
    )
    npcs = list(npcs_result.scalars().all())
    npc_ids = [npc.id for npc in npcs if npc.id is not None]

    schedules_by_npc: Dict[int, List[NPCSchedule]] = {nid: [] for nid in npc_ids}
    if npc_ids:
        schedules_result = await db.execute(
            select(NPCSchedule).where(NPCSchedule.npc_id.in_(npc_ids)).order_by(NPCSchedule.id)
        )
        for schedule in schedules_result.scalars().all():
            schedules_by_npc.setdefault(schedule.npc_id, []).append(schedule)

    core = GameProjectCoreBundle(
        world=BundleWorldData(
            name=world.name,
            meta=world.meta or {},
            world_time=float(state.world_time if state is not None else 0.0),
        ),
        locations=[
            BundleLocationData(
                source_id=loc.id or 0,
                name=loc.name,
                x=loc.x,
                y=loc.y,
                asset_id=loc.asset_id,
                default_spawn=loc.default_spawn,
                meta=loc.meta,
                stats=getattr(loc, "stats", {}) or {},
                hotspots=[],
            )
            for loc in locations
        ],
        npcs=[
            BundleNpcData(
                source_id=npc.id or 0,
                name=npc.name,
                personality=npc.personality,
                home_location_source_id=npc.home_location_id,
                stats=getattr(npc, "stats", {}) or {},
                schedules=[
                    BundleNpcScheduleData(
                        source_id=s.id or 0,
                        day_of_week=s.day_of_week,
                        start_time=s.start_time,
                        end_time=s.end_time,
                        location_source_id=s.location_id,
                        rule=s.rule,
                    )
                    for s in schedules_by_npc.get(npc.id or 0, [])
                ],
                expressions=[],
            )
            for npc in npcs
        ],
        scenes=[],
        items=[],
    )
    return GameProjectBundle(core=core)


async def _upsert_project_snapshot(
    db: AsyncSession,
    *,
    owner_user_id: int,
    world_id: int,
    project_name: str,
    project_id: Optional[int] = None,
) -> Dict[str, Any]:
    bundle_service = GameProjectBundleService(db)
    storage = GameProjectStorageService(db)

    bundle_mode = "full_export"
    bundle_warning: Optional[str] = None
    try:
        bundle = await bundle_service.export_world_bundle(world_id)
    except ProgrammingError as exc:
        await db.rollback()
        bundle = await _build_minimal_project_bundle(db, world_id=world_id)
        bundle_mode = "minimal_fallback"
        bundle_warning = str(exc).splitlines()[0]

    existing: Optional[GameProjectSnapshot] = None
    if project_id is not None:
        existing = await storage.get_project(
            owner_user_id=owner_user_id,
            project_id=project_id,
        )
        if existing is None:
            raise ValueError(f"project_not_found:{project_id}")
    else:
        result = await db.execute(
            select(GameProjectSnapshot)
            .where(
                GameProjectSnapshot.owner_user_id == owner_user_id,
                GameProjectSnapshot.is_draft.is_(False),
                GameProjectSnapshot.name == project_name,
            )
            .order_by(GameProjectSnapshot.id.desc())
            .limit(1)
        )
        existing = result.scalars().first()

    saved = await storage.save_project(
        owner_user_id=owner_user_id,
        name=project_name,
        bundle=bundle,
        source_world_id=world_id,
        overwrite_project_id=(existing.id if existing is not None else None),
    )
    return {
        "project_id": saved.id,
        "name": saved.name,
        "source_world_id": saved.source_world_id,
        "overwritten": existing is not None,
        "bundle_mode": bundle_mode,
        "bundle_warning": bundle_warning,
    }


async def seed_bananza_boat_slice(
    *,
    owner_user_id: int,
    world_name: str,
    project_name: str,
    project_id: Optional[int] = None,
) -> None:
    async with get_async_session() as db:
        world = await _ensure_world(db, owner_user_id=owner_user_id, world_name=world_name)
        if world.id is None:
            raise RuntimeError("world_missing_id")

        locations_by_key = await _upsert_locations(db, world_id=world.id)
        npcs_by_key = await _upsert_npcs_and_schedules(
            db,
            world_id=world.id,
            locations_by_key=locations_by_key,
        )
        behavior_summary = await _upsert_behavior_templates(
            db,
            world_id=world.id,
            npcs_by_key=npcs_by_key,
        )
        project_summary = await _upsert_project_snapshot(
            db,
            owner_user_id=owner_user_id,
            world_id=world.id,
            project_name=project_name,
            project_id=project_id,
        )

    primitive_summary = await _upsert_primitives()

    print("Seed complete: Bananza Boat slice")
    print(f"  world_id: {world.id}")
    print(f"  owner_user_id: {owner_user_id}")
    print(
        "  project_snapshot: "
        f"id={project_summary['project_id']} "
        f"name={project_summary['name']!r} "
        f"source_world_id={project_summary['source_world_id']} "
        f"overwritten={project_summary['overwritten']} "
        f"bundle_mode={project_summary['bundle_mode']}"
    )
    if project_summary.get("bundle_warning"):
        print(f"    note: {project_summary['bundle_warning']}")
    print("  locations:")
    for key in sorted(locations_by_key.keys()):
        loc = locations_by_key[key]
        print(f"    - {key}: id={loc.id} name={loc.name}")
    print("  npcs:")
    for key in sorted(npcs_by_key.keys()):
        npc = npcs_by_key[key]
        print(f"    - {key}: id={npc.id} name={npc.name} home_location_id={npc.home_location_id}")
    print(
        "  behavior: "
        f"activities={behavior_summary['activities']} "
        f"routines={behavior_summary['routines']} "
        f"npcs_bound={behavior_summary['npcs_bound']}"
    )
    print(
        "  primitives: "
        f"created={primitive_summary['created']} "
        f"updated={primitive_summary['updated']} "
        f"total_seed={primitive_summary['total']}"
    )
    print("")
    print("Next step example:")
    print(
        "  POST /api/v1/game/dialogue/actions/select with "
        "lead_npc_id, partner_npc_id, world_id, location_tag, mood, pose"
    )


def _base_world_meta() -> Dict[str, Any]:
    return {
        "seed_key": SEED_KEY,
        "genre": "comedy_adventure",
        "premise": (
            "A silly turn-based cruise where Gorilla and Banana trade jokes, "
            "flirt, and chase small goals while schedules keep the world moving."
        ),
        "style": "leisure-suit-larry-inspired parody tone",
        "turn_model": "turn_based",
    }


def _normalize_api_base(api_base: str) -> str:
    normalized = str(api_base or "").strip()
    if not normalized:
        return "http://localhost:8000"
    return normalized.rstrip("/")


def _response_excerpt(response: httpx.Response, *, limit: int = 500) -> str:
    try:
        body: Any = response.json()
    except Exception:
        body = response.text
    text = str(body)
    if len(text) > limit:
        return text[: limit - 3] + "..."
    return text


def _raise_http_error(response: httpx.Response, *, context: str) -> None:
    if response.status_code < 400:
        return
    raise RuntimeError(
        f"{context}: HTTP {response.status_code} {_response_excerpt(response)}"
    )


async def _api_get_json(
    client: httpx.AsyncClient,
    path: str,
    *,
    params: Optional[Dict[str, Any]] = None,
    context: str,
) -> Any:
    response = await client.get(path, params=params)
    _raise_http_error(response, context=context)
    if response.status_code == 204:
        return None
    return response.json()


async def _api_post_json(
    client: httpx.AsyncClient,
    path: str,
    *,
    body: Optional[Dict[str, Any]] = None,
    params: Optional[Dict[str, Any]] = None,
    context: str,
) -> Any:
    response = await client.post(path, json=(body or {}), params=params)
    _raise_http_error(response, context=context)
    if response.status_code == 204:
        return None
    return response.json()


async def _api_put_json(
    client: httpx.AsyncClient,
    path: str,
    *,
    body: Optional[Dict[str, Any]] = None,
    params: Optional[Dict[str, Any]] = None,
    context: str,
) -> Any:
    response = await client.put(path, json=(body or {}), params=params)
    _raise_http_error(response, context=context)
    if response.status_code == 204:
        return None
    return response.json()


async def _resolve_auth_token(
    *,
    api_base: str,
    explicit_token: Optional[str],
    username: str,
    password: str,
) -> str:
    if explicit_token and str(explicit_token).strip():
        return str(explicit_token).strip()

    env_token = os.getenv("PIXSIM_AUTH_TOKEN")
    if env_token and env_token.strip():
        return env_token.strip()

    async with httpx.AsyncClient(base_url=api_base, timeout=30.0) as auth_client:
        response = await auth_client.post(
            "/api/v1/auth/login",
            json={
                "username": str(username or "admin").strip() or "admin",
                "password": str(password or "admin").strip() or "admin",
            },
        )
        _raise_http_error(response, context="login")
        data = response.json()
        token = str(data.get("access_token") or "").strip()
        if not token:
            raise RuntimeError("login_succeeded_but_no_access_token")
        return token


async def _api_ensure_world(
    client: httpx.AsyncClient,
    *,
    world_name: str,
) -> Dict[str, Any]:
    worlds_payload = await _api_get_json(
        client,
        "/api/v1/game/worlds",
        params={"offset": 0, "limit": 1000},
        context="list_worlds",
    )
    if not isinstance(worlds_payload, dict):
        raise RuntimeError("unexpected_worlds_payload")
    worlds = worlds_payload.get("worlds") or []
    if not isinstance(worlds, list):
        raise RuntimeError("unexpected_worlds_list")

    existing = None
    for world in worlds:
        if isinstance(world, dict) and str(world.get("name")) == world_name:
            existing = world
            break

    base_meta = _base_world_meta()
    if existing is None:
        created = await _api_post_json(
            client,
            "/api/v1/game/worlds",
            body={"name": world_name, "meta": base_meta},
            context="create_world",
        )
        if not isinstance(created, dict):
            raise RuntimeError("unexpected_create_world_payload")
        return created

    world_id = int(existing.get("id"))
    detail = await _api_get_json(
        client,
        f"/api/v1/game/worlds/{world_id}",
        context="get_world",
    )
    if not isinstance(detail, dict):
        raise RuntimeError("unexpected_world_detail_payload")
    merged_meta = dict(detail.get("meta") or {})
    merged_meta.update(base_meta)
    updated = await _api_put_json(
        client,
        f"/api/v1/game/worlds/{world_id}/meta",
        body={"meta": merged_meta},
        context="update_world_meta",
    )
    if not isinstance(updated, dict):
        raise RuntimeError("unexpected_updated_world_payload")
    return updated


async def _api_upsert_locations(
    client: httpx.AsyncClient,
    *,
    world_id: int,
    world_name: str,
) -> tuple[Dict[str, Dict[str, Any]], Dict[str, int]]:
    summaries = await _api_get_json(
        client,
        "/api/v1/game/locations",
        context="list_locations",
    )
    if not isinstance(summaries, list):
        raise RuntimeError("unexpected_locations_payload")

    expected_keys = {seed.key for seed in LOCATION_SEEDS}
    existing_by_key: Dict[str, Dict[str, Any]] = {}
    for summary in summaries:
        if not isinstance(summary, dict):
            continue
        location_id = summary.get("id")
        if location_id is None:
            continue
        detail = await _api_get_json(
            client,
            f"/api/v1/game/locations/{int(location_id)}",
            context=f"get_location:{location_id}",
        )
        if not isinstance(detail, dict):
            continue
        meta = detail.get("meta") if isinstance(detail.get("meta"), dict) else {}
        if meta.get("seed_key") != SEED_KEY:
            continue
        if meta.get("seed_world_name") != world_name:
            continue
        location_key = meta.get("location_key")
        if isinstance(location_key, str) and location_key in expected_keys:
            existing_by_key[location_key] = detail

    created = 0
    updated = 0
    locations_by_key: Dict[str, Dict[str, Any]] = {}

    for seed in LOCATION_SEEDS:
        seed_meta = {
            "seed_key": SEED_KEY,
            "seed_world_name": world_name,
            "location_key": seed.key,
            "description": seed.description,
        }
        existing = existing_by_key.get(seed.key)
        if existing is not None:
            merged_meta = dict(existing.get("meta") or {})
            merged_meta.update(seed_meta)
            payload = {
                "name": seed.name,
                "x": seed.x,
                "y": seed.y,
                "meta": merged_meta,
            }
            saved = await _api_put_json(
                client,
                f"/api/v1/game/locations/{int(existing['id'])}",
                params={"world_id": world_id},
                body=payload,
                context=f"update_location:{seed.key}",
            )
            updated += 1
        else:
            payload = {
                "name": seed.name,
                "x": seed.x,
                "y": seed.y,
                "meta": seed_meta,
            }
            saved = await _api_post_json(
                client,
                "/api/v1/game/locations",
                params={"world_id": world_id},
                body=payload,
                context=f"create_location:{seed.key}",
            )
            created += 1
        if not isinstance(saved, dict):
            raise RuntimeError(f"unexpected_location_payload:{seed.key}")
        locations_by_key[seed.key] = saved

    return locations_by_key, {"created": created, "updated": updated}


async def _api_upsert_npcs_and_schedules(
    client: httpx.AsyncClient,
    *,
    world_id: int,
    world_name: str,
    locations_by_key: Dict[str, Dict[str, Any]],
) -> tuple[Dict[str, Dict[str, Any]], Dict[str, List[Dict[str, Any]]], Dict[str, int]]:
    summaries = await _api_get_json(
        client,
        "/api/v1/game/npcs",
        context="list_npcs",
    )
    if not isinstance(summaries, list):
        raise RuntimeError("unexpected_npcs_payload")

    expected_keys = {seed.key for seed in NPC_SEEDS}
    existing_by_key: Dict[str, Dict[str, Any]] = {}
    for summary in summaries:
        if not isinstance(summary, dict):
            continue
        npc_id = summary.get("id")
        if npc_id is None:
            continue
        response = await client.get(
            f"/api/v1/game/npcs/{int(npc_id)}",
            params={"world_id": world_id},
        )
        if response.status_code == 404:
            continue
        _raise_http_error(response, context=f"get_npc:{npc_id}")
        detail = response.json()
        if not isinstance(detail, dict):
            continue
        personality = detail.get("personality") if isinstance(detail.get("personality"), dict) else {}
        if personality.get("seed_key") != SEED_KEY:
            continue
        if personality.get("seed_world_name") != world_name:
            continue
        npc_key = personality.get("npc_key")
        if isinstance(npc_key, str) and npc_key in expected_keys:
            existing_by_key[npc_key] = detail

    created = 0
    updated = 0
    npcs_by_key: Dict[str, Dict[str, Any]] = {}
    schedules_by_npc: Dict[str, List[Dict[str, Any]]] = {}

    for seed in NPC_SEEDS:
        home_location = locations_by_key.get(seed.home_location_key)
        if not isinstance(home_location, dict) or home_location.get("id") is None:
            raise RuntimeError(f"missing_home_location:{seed.home_location_key}")

        seed_personality = dict(seed.personality)
        seed_personality.update(
            {
                "seed_key": SEED_KEY,
                "seed_world_name": world_name,
                "npc_key": seed.key,
            }
        )
        existing = existing_by_key.get(seed.key)
        if existing is not None:
            merged_personality = dict(existing.get("personality") or {})
            merged_personality.update(seed_personality)
            payload = {
                "name": seed.name,
                "home_location_id": int(home_location["id"]),
                "personality": merged_personality,
            }
            saved = await _api_put_json(
                client,
                f"/api/v1/game/npcs/{int(existing['id'])}",
                params={"world_id": world_id},
                body=payload,
                context=f"update_npc:{seed.key}",
            )
            updated += 1
        else:
            payload = {
                "name": seed.name,
                "home_location_id": int(home_location["id"]),
                "personality": seed_personality,
            }
            saved = await _api_post_json(
                client,
                "/api/v1/game/npcs",
                params={"world_id": world_id},
                body=payload,
                context=f"create_npc:{seed.key}",
            )
            created += 1

        if not isinstance(saved, dict):
            raise RuntimeError(f"unexpected_npc_payload:{seed.key}")
        npcs_by_key[seed.key] = saved

    for seed in NPC_SEEDS:
        npc = npcs_by_key.get(seed.key)
        if not npc or npc.get("id") is None:
            continue
        schedule_items: List[Dict[str, Any]] = []
        for schedule_seed in seed.schedules:
            location = locations_by_key.get(schedule_seed.location_key)
            if not location or location.get("id") is None:
                continue
            schedule_items.append(
                {
                    "day_of_week": schedule_seed.day_of_week,
                    "start_time": schedule_seed.start_time,
                    "end_time": schedule_seed.end_time,
                    "location_id": int(location["id"]),
                    "rule": {
                        "seed_key": SEED_KEY,
                        "label": schedule_seed.label,
                    },
                }
            )
        replaced = await _api_put_json(
            client,
            f"/api/v1/game/npcs/{int(npc['id'])}/schedules",
            params={"world_id": world_id},
            body={"items": schedule_items},
            context=f"replace_schedules:{seed.key}",
        )
        items = replaced.get("items") if isinstance(replaced, dict) else []
        schedules_by_npc[seed.key] = items if isinstance(items, list) else []

    return npcs_by_key, schedules_by_npc, {"created": created, "updated": updated}


async def _api_apply_behavior(
    client: httpx.AsyncClient,
    *,
    world_id: int,
    world_name: str,
    npcs_by_key: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    world = await _api_get_json(
        client,
        f"/api/v1/game/worlds/{world_id}",
        context="get_world_for_behavior",
    )
    if not isinstance(world, dict):
        raise RuntimeError("unexpected_world_payload_for_behavior")

    world_meta = dict(world.get("meta") or {})
    existing_simulation = world_meta.get("simulation")
    merged_simulation = dict(SIMULATION_TEMPLATE)
    if isinstance(existing_simulation, dict):
        merged_simulation.update(existing_simulation)
    world_meta["simulation"] = merged_simulation
    world_meta.setdefault("seed_key", SEED_KEY)

    await _api_put_json(
        client,
        f"/api/v1/game/worlds/{world_id}/meta",
        body={"meta": world_meta},
        context="update_world_simulation_meta",
    )

    await _api_put_json(
        client,
        f"/api/v1/game/worlds/{world_id}/behavior",
        body={"config": dict(BEHAVIOR_TEMPLATE)},
        context="update_world_behavior",
    )

    updated_npcs = 0
    for npc_key, binding in NPC_BEHAVIOR_BINDINGS.items():
        npc = npcs_by_key.get(npc_key)
        if not npc or npc.get("id") is None:
            continue
        personality = dict(npc.get("personality") or {})
        behavior = dict(personality.get("behavior") or {})

        behavior["routineId"] = binding["routineId"]
        if isinstance(binding.get("preferences"), dict):
            behavior["preferences"] = dict(binding["preferences"])

        personality["archetypeId"] = binding["archetypeId"]
        personality["routineId"] = binding["routineId"]
        personality["behavior"] = behavior
        personality["seed_key"] = SEED_KEY
        personality["seed_world_name"] = world_name
        personality["npc_key"] = npc_key

        payload = {
            "name": npc.get("name") or npc_key,
            "home_location_id": npc.get("home_location_id"),
            "personality": personality,
        }
        updated = await _api_put_json(
            client,
            f"/api/v1/game/npcs/{int(npc['id'])}",
            params={"world_id": world_id},
            body=payload,
            context=f"bind_behavior_npc:{npc_key}",
        )
        if isinstance(updated, dict):
            npcs_by_key[npc_key] = updated
        updated_npcs += 1

    return {
        "world_id": world_id,
        "routines": len(BEHAVIOR_TEMPLATE.get("routines", {})),
        "activities": len(BEHAVIOR_TEMPLATE.get("activities", {})),
        "npcs_bound": updated_npcs,
    }


async def _api_upsert_primitives(client: httpx.AsyncClient) -> Dict[str, int]:
    created = 0
    updated = 0
    for primitive in PRIMITIVE_SEEDS:
        block_id = str(primitive.get("block_id") or "").strip()
        if not block_id:
            continue
        payload = {
            "category": primitive.get("category"),
            "text": primitive.get("text"),
            "tags": dict(primitive.get("tags") or {}),
            "source": "system",
            "is_public": True,
            "avg_rating": 4.0,
        }
        upserted = await _api_put_json(
            client,
            f"/api/v1/block-templates/blocks/by-block-id/{block_id}",
            params={"create_if_missing": True},
            body=payload,
            context=f"upsert_primitive:{block_id}",
        )
        status = upserted.get("status") if isinstance(upserted, dict) else None
        if status == "created":
            created += 1
        else:
            updated += 1

    return {"created": created, "updated": updated, "total": len(PRIMITIVE_SEEDS)}


def _build_minimal_project_bundle_payload_api(
    *,
    world: Dict[str, Any],
    locations_by_key: Dict[str, Dict[str, Any]],
    npcs_by_key: Dict[str, Dict[str, Any]],
    schedules_by_npc: Dict[str, List[Dict[str, Any]]],
) -> Dict[str, Any]:
    core = GameProjectCoreBundle(
        world=BundleWorldData(
            name=str(world.get("name") or DEMO_WORLD_NAME),
            meta=dict(world.get("meta") or {}),
            world_time=float(world.get("world_time") or 0.0),
        ),
        locations=[
            BundleLocationData(
                source_id=int(location.get("id") or 0),
                name=str(location.get("name") or ""),
                x=float(location.get("x") or 0.0),
                y=float(location.get("y") or 0.0),
                asset_id=location.get("asset_id"),
                default_spawn=location.get("default_spawn"),
                meta=location.get("meta"),
                stats=dict(location.get("stats") or {}),
                hotspots=[],
            )
            for _, location in sorted(locations_by_key.items(), key=lambda item: item[0])
        ],
        npcs=[
            BundleNpcData(
                source_id=int(npc.get("id") or 0),
                name=str(npc.get("name") or npc_key),
                personality=npc.get("personality"),
                home_location_source_id=npc.get("home_location_id"),
                stats=dict(npc.get("stats") or {}),
                schedules=[
                    BundleNpcScheduleData(
                        source_id=int(schedule.get("id") or 0),
                        day_of_week=int(schedule.get("day_of_week") or 0),
                        start_time=float(schedule.get("start_time") or 0.0),
                        end_time=float(schedule.get("end_time") or 0.0),
                        location_source_id=int(schedule.get("location_id") or 0),
                        rule=schedule.get("rule"),
                    )
                    for schedule in schedules_by_npc.get(npc_key, [])
                    if isinstance(schedule, dict)
                ],
                expressions=[],
            )
            for npc_key, npc in sorted(npcs_by_key.items(), key=lambda item: item[0])
        ],
        scenes=[],
        items=[],
    )
    bundle = GameProjectBundle(core=core)
    return bundle.model_dump(mode="json")


async def _api_upsert_project_snapshot(
    client: httpx.AsyncClient,
    *,
    world: Dict[str, Any],
    world_name: str,
    project_name: str,
    project_id: Optional[int],
    locations_by_key: Dict[str, Dict[str, Any]],
    npcs_by_key: Dict[str, Dict[str, Any]],
    schedules_by_npc: Dict[str, List[Dict[str, Any]]],
) -> Dict[str, Any]:
    world_id = int(world.get("id") or 0)
    if world_id <= 0:
        raise RuntimeError("world_id_missing_for_project_snapshot")

    bundle_mode = "full_export"
    bundle_warning: Optional[str] = None
    try:
        bundle = await _api_get_json(
            client,
            f"/api/v1/game/worlds/{world_id}/project/export",
            context="export_world_project_bundle",
        )
    except RuntimeError as exc:
        bundle = _build_minimal_project_bundle_payload_api(
            world=world,
            locations_by_key=locations_by_key,
            npcs_by_key=npcs_by_key,
            schedules_by_npc=schedules_by_npc,
        )
        bundle_mode = "minimal_fallback"
        bundle_warning = str(exc)

    overwrite_project_id: Optional[int] = project_id
    if overwrite_project_id is None:
        snapshots = await _api_get_json(
            client,
            "/api/v1/game/worlds/projects/snapshots",
            params={"offset": 0, "limit": 500},
            context="list_project_snapshots",
        )
        if isinstance(snapshots, list):
            for snapshot in snapshots:
                if not isinstance(snapshot, dict):
                    continue
                if str(snapshot.get("name")) == project_name:
                    snapshot_id = snapshot.get("id")
                    if snapshot_id is not None:
                        overwrite_project_id = int(snapshot_id)
                    break

    payload: Dict[str, Any] = {
        "name": project_name,
        "bundle": bundle,
        "source_world_id": world_id,
    }
    if overwrite_project_id is not None:
        payload["overwrite_project_id"] = int(overwrite_project_id)

    saved = await _api_post_json(
        client,
        "/api/v1/game/worlds/projects/snapshots",
        body=payload,
        context="save_project_snapshot",
    )
    if not isinstance(saved, dict):
        raise RuntimeError("unexpected_project_snapshot_payload")

    return {
        "project_id": int(saved.get("id") or 0),
        "name": str(saved.get("name") or project_name),
        "source_world_id": saved.get("source_world_id"),
        "overwritten": overwrite_project_id is not None,
        "bundle_mode": bundle_mode,
        "bundle_warning": bundle_warning,
    }


async def seed_bananza_boat_slice_via_api(
    *,
    world_name: str,
    project_name: str,
    project_id: Optional[int] = None,
    api_base: str,
    auth_token: Optional[str] = None,
    username: str = "admin",
    password: str = "admin",
) -> None:
    normalized_api_base = _normalize_api_base(api_base)
    token = await _resolve_auth_token(
        api_base=normalized_api_base,
        explicit_token=auth_token,
        username=username,
        password=password,
    )

    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(
        base_url=normalized_api_base,
        timeout=120.0,
        headers=headers,
    ) as client:
        world = await _api_ensure_world(client, world_name=world_name)
        world_id = int(world.get("id") or 0)
        if world_id <= 0:
            raise RuntimeError("world_id_missing_after_api_seed")

        locations_by_key, location_summary = await _api_upsert_locations(
            client,
            world_id=world_id,
            world_name=world_name,
        )
        npcs_by_key, schedules_by_npc, npc_summary = await _api_upsert_npcs_and_schedules(
            client,
            world_id=world_id,
            world_name=world_name,
            locations_by_key=locations_by_key,
        )
        behavior_summary = await _api_apply_behavior(
            client,
            world_id=world_id,
            world_name=world_name,
            npcs_by_key=npcs_by_key,
        )
        primitive_summary = await _api_upsert_primitives(client)

        world = await _api_get_json(
            client,
            f"/api/v1/game/worlds/{world_id}",
            context="refresh_world_after_seed",
        )
        if not isinstance(world, dict):
            raise RuntimeError("unexpected_world_payload_after_seed")

        project_summary = await _api_upsert_project_snapshot(
            client,
            world=world,
            world_name=world_name,
            project_name=project_name,
            project_id=project_id,
            locations_by_key=locations_by_key,
            npcs_by_key=npcs_by_key,
            schedules_by_npc=schedules_by_npc,
        )

    print("Seed complete: Bananza Boat slice (API mode)")
    print(f"  api_base: {normalized_api_base}")
    print(f"  world_id: {world_id}")
    print(
        "  project_snapshot: "
        f"id={project_summary['project_id']} "
        f"name={project_summary['name']!r} "
        f"source_world_id={project_summary['source_world_id']} "
        f"overwritten={project_summary['overwritten']} "
        f"bundle_mode={project_summary['bundle_mode']}"
    )
    if project_summary.get("bundle_warning"):
        print(f"    note: {project_summary['bundle_warning']}")
    print(
        "  locations: "
        f"created={location_summary['created']} "
        f"updated={location_summary['updated']}"
    )
    for key in sorted(locations_by_key.keys()):
        loc = locations_by_key[key]
        print(f"    - {key}: id={loc.get('id')} name={loc.get('name')}")
    print(
        "  npcs: "
        f"created={npc_summary['created']} "
        f"updated={npc_summary['updated']}"
    )
    for key in sorted(npcs_by_key.keys()):
        npc = npcs_by_key[key]
        print(
            f"    - {key}: id={npc.get('id')} "
            f"name={npc.get('name')} home_location_id={npc.get('home_location_id')}"
        )
    print(
        "  behavior: "
        f"activities={behavior_summary['activities']} "
        f"routines={behavior_summary['routines']} "
        f"npcs_bound={behavior_summary['npcs_bound']}"
    )
    print(
        "  primitives: "
        f"created={primitive_summary['created']} "
        f"updated={primitive_summary['updated']} "
        f"total_seed={primitive_summary['total']}"
    )
    print("")
    print("Next step example:")
    print(
        "  POST /api/v1/game/dialogue/actions/select with "
        "lead_npc_id, partner_npc_id, world_id, location_tag, mood, pose"
    )


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed a Bananza Boat gameplay slice (world, NPCs, locations, primitives)."
    )
    parser.add_argument(
        "--mode",
        choices=["api", "direct"],
        default="api",
        help=(
            "Seeder mode. "
            "'api' uses HTTP endpoints (recommended). "
            "'direct' writes DB rows directly."
        ),
    )
    parser.add_argument(
        "--owner-user-id",
        type=int,
        default=1,
        help="Owner user id for direct mode only (default: 1). Ignored in API mode.",
    )
    parser.add_argument(
        "--world-name",
        type=str,
        default=DEMO_WORLD_NAME,
        help=f"World name to create or reuse (default: {DEMO_WORLD_NAME!r}).",
    )
    parser.add_argument(
        "--project-name",
        type=str,
        default=DEMO_PROJECT_NAME,
        help=f"Saved project snapshot name to create or update (default: {DEMO_PROJECT_NAME!r}).",
    )
    parser.add_argument(
        "--project-id",
        type=int,
        default=None,
        help="Existing project snapshot id to overwrite directly (default: auto-detect by name).",
    )
    parser.add_argument(
        "--api-base",
        type=str,
        default=os.getenv("PIXSIM_API_BASE", "http://localhost:8000"),
        help="API base URL for API mode (default: env PIXSIM_API_BASE or http://localhost:8000).",
    )
    parser.add_argument(
        "--auth-token",
        type=str,
        default=None,
        help="Bearer token for API mode (default: env PIXSIM_AUTH_TOKEN or login).",
    )
    parser.add_argument(
        "--username",
        type=str,
        default=os.getenv("PIXSIM_USERNAME", "admin"),
        help="Login username for API mode when token is not provided (default: admin).",
    )
    parser.add_argument(
        "--password",
        type=str,
        default=os.getenv("PIXSIM_PASSWORD", "admin"),
        help="Login password for API mode when token is not provided (default: admin).",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    world_name = str(args.world_name).strip() or DEMO_WORLD_NAME
    project_name = str(args.project_name).strip() or DEMO_PROJECT_NAME
    project_id = int(args.project_id) if args.project_id is not None else None

    if str(args.mode) == "direct":
        asyncio.run(
            seed_bananza_boat_slice(
                owner_user_id=int(args.owner_user_id),
                world_name=world_name,
                project_name=project_name,
                project_id=project_id,
            )
        )
        return

    if int(args.owner_user_id) != 1:
        print("note: --owner-user-id is ignored in API mode.")

    asyncio.run(
        seed_bananza_boat_slice_via_api(
            world_name=world_name,
            project_name=project_name,
            project_id=project_id,
            api_base=str(args.api_base).strip(),
            auth_token=(str(args.auth_token).strip() if args.auth_token is not None else None),
            username=str(args.username).strip() or "admin",
            password=str(args.password).strip() or "admin",
        )
    )


if __name__ == "__main__":
    main()
