from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List


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


GENERATION_TEMPLATE_SEEDS: List[Dict[str, Any]] = [
    {
        "name": "Bananza Scene Explore Scaffold",
        "slug": "bananza-scene-explore-scaffold-v1",
        "description": "Scaffold template for Bananza scene explore passes.",
        "composition_strategy": "sequential",
        "package_name": DEMO_PACK,
        "tags": ["bananza", "scene_prep", "scaffold", "stage:explore"],
        "is_public": True,
        "template_metadata": {
            "seed_key": SEED_KEY,
            "stage": "explore",
            "scaffold": True,
            "notes": "Initial scaffold seeded by script; expand slot tuning iteratively.",
        },
        "character_bindings": {},
        "slots": [
            {
                "slot_index": 0,
                "key": "environment",
                "label": "Environment",
                "role": "environment",
                "category": "environment",
                "package_name": DEMO_PACK,
                "tags": {"all": {"world": "bananza_boat"}},
                "selection_strategy": "uniform",
                "optional": False,
            },
            {
                "slot_index": 1,
                "key": "light",
                "label": "Lighting",
                "role": "lighting",
                "category": "light",
                "package_name": DEMO_PACK,
                "tags": {"all": {"world": "bananza_boat"}},
                "selection_strategy": "uniform",
                "optional": False,
            },
            {
                "slot_index": 2,
                "key": "camera",
                "label": "Camera",
                "role": "camera",
                "category": "camera",
                "package_name": DEMO_PACK,
                "tags": {"all": {"world": "bananza_boat"}},
                "selection_strategy": "uniform",
                "optional": False,
            },
            {
                "slot_index": 3,
                "key": "mood",
                "label": "Mood",
                "role": "style",
                "category": "mood",
                "package_name": DEMO_PACK,
                "tags": {"all": {"world": "bananza_boat"}},
                "selection_strategy": "uniform",
                "optional": False,
            },
        ],
    },
    {
        "name": "Bananza Scene Compose Scaffold",
        "slug": "bananza-scene-compose-scaffold-v1",
        "description": "Scaffold template for Bananza scene compose passes.",
        "composition_strategy": "sequential",
        "package_name": DEMO_PACK,
        "tags": ["bananza", "scene_prep", "scaffold", "stage:compose"],
        "is_public": True,
        "template_metadata": {
            "seed_key": SEED_KEY,
            "stage": "compose",
            "scaffold": True,
            "notes": "Composition scaffold with location + wardrobe/pose hooks.",
        },
        "character_bindings": {},
        "slots": [
            {
                "slot_index": 0,
                "key": "environment",
                "label": "Environment",
                "role": "environment",
                "category": "environment",
                "package_name": DEMO_PACK,
                "tags": {"all": {"world": "bananza_boat"}},
                "selection_strategy": "uniform",
                "optional": False,
            },
            {
                "slot_index": 1,
                "key": "location",
                "label": "Location Anchor",
                "role": "location",
                "category": "location",
                "package_name": DEMO_PACK,
                "tags": {"all": {"world": "bananza_boat"}},
                "selection_strategy": "uniform",
                "optional": False,
            },
            {
                "slot_index": 2,
                "key": "camera",
                "label": "Camera",
                "role": "camera",
                "category": "camera",
                "package_name": DEMO_PACK,
                "tags": {"all": {"world": "bananza_boat"}},
                "selection_strategy": "uniform",
                "optional": False,
            },
            {
                "slot_index": 3,
                "key": "lead_pose",
                "label": "Lead Pose",
                "role": "subject",
                "category": "character_pose",
                "package_name": DEMO_PACK,
                "tags": {"all": {"world": "bananza_boat", "actor": "banana"}},
                "selection_strategy": "uniform",
                "optional": False,
            },
            {
                "slot_index": 4,
                "key": "partner_pose",
                "label": "Partner Pose",
                "role": "subject",
                "category": "character_pose",
                "package_name": DEMO_PACK,
                "tags": {"all": {"world": "bananza_boat", "actor": "gorilla"}},
                "selection_strategy": "uniform",
                "optional": False,
            },
            {
                "slot_index": 5,
                "key": "wardrobe",
                "label": "Wardrobe",
                "role": "style",
                "category": "wardrobe",
                "package_name": DEMO_PACK,
                "tags": {"all": {"world": "bananza_boat"}},
                "selection_strategy": "uniform",
                "optional": True,
            },
            {
                "slot_index": 6,
                "key": "mood",
                "label": "Mood",
                "role": "style",
                "category": "mood",
                "package_name": DEMO_PACK,
                "tags": {"all": {"world": "bananza_boat"}},
                "selection_strategy": "uniform",
                "optional": False,
            },
        ],
    },
    {
        "name": "Bananza Scene Refine Scaffold",
        "slug": "bananza-scene-refine-scaffold-v1",
        "description": "Scaffold template for Bananza scene refine passes.",
        "composition_strategy": "sequential",
        "package_name": DEMO_PACK,
        "tags": ["bananza", "scene_prep", "scaffold", "stage:refine"],
        "is_public": True,
        "template_metadata": {
            "seed_key": SEED_KEY,
            "stage": "refine",
            "scaffold": True,
            "notes": "Refine scaffold kept minimal so authored text can be layered later.",
        },
        "character_bindings": {},
        "slots": [
            {
                "slot_index": 0,
                "key": "environment",
                "label": "Environment",
                "role": "environment",
                "category": "environment",
                "package_name": DEMO_PACK,
                "tags": {"all": {"world": "bananza_boat"}},
                "selection_strategy": "uniform",
                "optional": False,
            },
            {
                "slot_index": 1,
                "key": "light",
                "label": "Lighting",
                "role": "lighting",
                "category": "light",
                "package_name": DEMO_PACK,
                "tags": {"all": {"world": "bananza_boat"}},
                "selection_strategy": "uniform",
                "optional": False,
            },
            {
                "slot_index": 2,
                "key": "camera",
                "label": "Camera",
                "role": "camera",
                "category": "camera",
                "package_name": DEMO_PACK,
                "tags": {"all": {"world": "bananza_boat"}},
                "selection_strategy": "uniform",
                "optional": False,
            },
            {
                "slot_index": 3,
                "key": "location",
                "label": "Location Anchor",
                "role": "location",
                "category": "location",
                "package_name": DEMO_PACK,
                "tags": {"all": {"world": "bananza_boat"}},
                "selection_strategy": "uniform",
                "optional": False,
            },
            {
                "slot_index": 4,
                "key": "lead_pose",
                "label": "Lead Pose",
                "role": "subject",
                "category": "character_pose",
                "package_name": DEMO_PACK,
                "tags": {"all": {"world": "bananza_boat", "actor": "banana"}},
                "selection_strategy": "uniform",
                "optional": False,
            },
            {
                "slot_index": 5,
                "key": "partner_pose",
                "label": "Partner Pose",
                "role": "subject",
                "category": "character_pose",
                "package_name": DEMO_PACK,
                "tags": {"all": {"world": "bananza_boat", "actor": "gorilla"}},
                "selection_strategy": "uniform",
                "optional": False,
            },
            {
                "slot_index": 6,
                "key": "mood",
                "label": "Mood",
                "role": "style",
                "category": "mood",
                "package_name": DEMO_PACK,
                "tags": {"all": {"world": "bananza_boat"}},
                "selection_strategy": "uniform",
                "optional": False,
            },
        ],
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
    "meta": {"seed_key": SEED_KEY},
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
