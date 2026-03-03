from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

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
    ProjectOriginKind,
    ProjectProvenance,
)
from pixsim7.backend.main.services.game.project_bundle import GameProjectBundleService
from pixsim7.backend.main.services.game.project_storage import GameProjectStorageService
from pixsim7.backend.main.services.prompt.block.template_service import (
    BlockTemplateService,
)

from ..seed_data import (
    GENERATION_TEMPLATE_SEEDS,
    LOCATION_SEEDS,
    NPC_BEHAVIOR_BINDINGS,
    NPC_SEEDS,
    PRIMITIVE_SEEDS,
    SEED_KEY,
    SIMULATION_TEMPLATE,
)
from .common import (
    base_world_meta,
    build_behavior_config,
    generation_template_payload,
    now_utc,
)


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

    base_meta = base_world_meta()

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
                    "seed_key": SEED_KEY,
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
                    "seed_key": SEED_KEY,
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
        seed_personality = dict(seed.personality)
        seed_personality.update(
            {
                "seed_key": SEED_KEY,
                "npc_key": seed.key,
            }
        )
        if npc is None:
            npc = GameNPC(
                world_id=world_id,
                name=seed.name,
                home_location_id=(home_location.id if home_location is not None else None),
                personality=seed_personality,
            )
            db.add(npc)
            await db.flush()
        else:
            npc.home_location_id = home_location.id if home_location is not None else None
            personality = dict(npc.personality or {})
            personality.update(seed_personality)
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
                        "seed_key": SEED_KEY,
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

    behavior_config = build_behavior_config()
    world_meta = dict(world.meta or {})
    world_meta["behavior"] = behavior_config

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
        personality["seed_key"] = SEED_KEY

        npc.personality = personality
        db.add(npc)
        updated_npcs += 1

    await db.commit()
    await db.refresh(world)
    for npc in npcs_by_key.values():
        await db.refresh(npc)

    return {
        "world_id": world.id,
        "routines": len(behavior_config.get("routines", {})),
        "activities": len(behavior_config.get("activities", {})),
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
            now = now_utc()

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


async def _upsert_generation_templates(db: AsyncSession) -> Dict[str, int]:
    service = BlockTemplateService(db)
    created = 0
    updated = 0

    for seed in GENERATION_TEMPLATE_SEEDS:
        payload = generation_template_payload(seed)
        slug = str(payload.get("slug") or "").strip()
        if not slug:
            continue

        existing = await service.get_template_by_slug(slug)
        if existing is None:
            await service.create_template(data=payload, created_by="system")
            created += 1
            continue

        if existing.id is None:
            raise RuntimeError(f"template_missing_id:{slug}")

        await service.update_template(existing.id, payload)
        updated += 1

    return {"created": created, "updated": updated, "total": len(GENERATION_TEMPLATE_SEEDS)}


async def _upsert_project_snapshot(
    db: AsyncSession,
    *,
    owner_user_id: int,
    world_id: int,
    world_name: str,
    project_name: str,
    project_id: Optional[int] = None,
) -> Dict[str, Any]:
    bundle_service = GameProjectBundleService(db)
    storage = GameProjectStorageService(db)

    bundle = await bundle_service.export_world_bundle(world_id)

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
        provenance=ProjectProvenance(
            kind=ProjectOriginKind.DEMO,
            source_key=SEED_KEY,
            meta={
                "seed_key": SEED_KEY,
                "seed_world_name": world_name,
            },
        ),
    )
    return {
        "project_id": saved.id,
        "name": saved.name,
        "source_world_id": saved.source_world_id,
        "overwritten": existing is not None,
        "bundle_mode": "full_export",
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
        template_summary = await _upsert_generation_templates(db)
        project_summary = await _upsert_project_snapshot(
            db,
            owner_user_id=owner_user_id,
            world_id=world.id,
            world_name=world_name,
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
    print(
        "  templates: "
        f"created={template_summary['created']} "
        f"updated={template_summary['updated']} "
        f"total_seed={template_summary['total']}"
    )
    print("")
    print("Next step example:")
    print(
        "  POST /api/v1/game/dialogue/actions/select with "
        "lead_npc_id, partner_npc_id, world_id, location_tag, mood, pose"
    )
