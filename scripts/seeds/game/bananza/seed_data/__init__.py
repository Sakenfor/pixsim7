from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List


DEMO_WORLD_NAME = "Bananza Boat"
DEMO_PACK = "bananza_boat_demo"
CORE_PACK = "core_scene_primitives"
GENRE_PACK = "genre_tone_primitives"
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


# ---------------------------------------------------------------------------
# Content references — block IDs and template slugs that must exist in
# content packs before the seed can run.  The seed no longer authors these
# definitions; they are owned by their respective content packs.
# ---------------------------------------------------------------------------

REQUIRED_BLOCK_IDS: List[str] = [
    # Bananza demo-specific (bananza_boat_demo pack)
    "bananza.environment.main_deck.day",
    "bananza.environment.captain_cabin.evening",
    "bananza.pose.gorilla.relaxed_standing",
    "bananza.pose.banana.confident_standing",
    "bananza.location.deck_railing",
    "bananza.location.bar_counter",
    "bananza.wardrobe.gorilla.leisure_suit",
    "bananza.wardrobe.banana.sun_dress",
    # Core (scene_foundation pack)
    "core.light.daylight_crisp",
    "core.light.sunset_reflections",
    "core.camera.two_shot_medium_tracking",
    "core.camera.establishing_wide",
    "core.continuity.identity_lock",
    "core.continuity.wardrobe_lock",
    "core.motion.forward_progress_small",
    # Genre (genre_tone pack)
    "genre.comedy.mood.slapstick_flirt",
    "genre.comedy.mood.awkward_pause",
    "genre.sensual.nudge.eye_contact_hold",
    "genre.sensual.nudge.distance_reduce",
]

REQUIRED_TEMPLATE_SLUGS: List[str] = [
    "bananza-scene-explore-scaffold-v1",
    "bananza-scene-compose-scaffold-v1",
    "bananza-scene-refine-scaffold-v1",
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
