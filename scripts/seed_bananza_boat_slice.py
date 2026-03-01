from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional

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
        "--owner-user-id",
        type=int,
        default=1,
        help="Owner user id for the seeded world (default: 1).",
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
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    asyncio.run(
        seed_bananza_boat_slice(
            owner_user_id=int(args.owner_user_id),
            world_name=str(args.world_name).strip() or DEMO_WORLD_NAME,
            project_name=str(args.project_name).strip() or DEMO_PROJECT_NAME,
            project_id=(int(args.project_id) if args.project_id is not None else None),
        )
    )


if __name__ == "__main__":
    main()
