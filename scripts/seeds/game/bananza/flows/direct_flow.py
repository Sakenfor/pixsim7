from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy import delete, select
from sqlalchemy.exc import OperationalError, ProgrammingError, SQLAlchemyError
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
    BOOTSTRAP_PROFILE,
    BOOTSTRAP_SOURCE_KEY,
    LOCATION_SEEDS,
    NPC_BEHAVIOR_BINDINGS,
    NPC_SEEDS,
    REGISTERED_SOURCE_PACKS,
    REGISTERED_TEMPLATE_PACKS,
    REQUIRED_BLOCK_IDS,
    REQUIRED_TEMPLATE_SLUGS,
    SIMULATION_TEMPLATE,
    expected_source_pack_for_block_id,
)
from .common import (
    base_world_meta,
    build_behavior_config,
)


def _is_legacy_seed_snapshot(snapshot: GameProjectSnapshot) -> bool:
    kind = str(getattr(snapshot, "origin_kind", "") or "").strip().lower()
    source_key = str(getattr(snapshot, "origin_source_key", "") or "").strip()
    return kind in {"seed", "demo"} or source_key == BOOTSTRAP_PROFILE


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
        db.add(GameWorldState(world_id=world.id, world_time=0.0, meta={}))
    else:
        state.meta = dict(state.meta or {})
        db.add(state)

    await db.commit()
    await db.refresh(world)
    return world


async def _upsert_locations(
    db: AsyncSession,
    *,
    world_id: int,
    world_name: str,
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
                    "bootstrap_source": BOOTSTRAP_SOURCE_KEY,
                    "bootstrap_world_name": world_name,
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
                    "bootstrap_source": BOOTSTRAP_SOURCE_KEY,
                    "bootstrap_world_name": world_name,
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
    world_name: str,
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
                "bootstrap_source": BOOTSTRAP_SOURCE_KEY,
                "bootstrap_world_name": world_name,
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

    # Keep schedules deterministic by replacing schedules for bootstrapped NPCs.
    bootstrapped_npc_ids = [npc.id for npc in npcs_by_key.values() if npc.id is not None]
    if bootstrapped_npc_ids:
        await db.execute(delete(NPCSchedule).where(NPCSchedule.npc_id.in_(bootstrapped_npc_ids)))

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
                        "bootstrap_source": BOOTSTRAP_SOURCE_KEY,
                        "bootstrap_world_name": world_name,
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
        personality["bootstrap_source"] = BOOTSTRAP_SOURCE_KEY
        personality["bootstrap_world_name"] = world.name

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


async def _verify_required_blocks() -> Dict[str, Any]:
    """Verify all required block IDs exist in the blocks DB."""
    missing: List[str] = []
    wrong_source_pack: List[str] = []

    try:
        async with get_async_blocks_session() as blocks_db:
            for block_id in REQUIRED_BLOCK_IDS:
                result = await blocks_db.execute(
                    select(BlockPrimitive).where(BlockPrimitive.block_id == block_id)
                )
                row = result.scalar_one_or_none()
                if row is None:
                    missing.append(block_id)
                    continue

                tags = row.tags if isinstance(getattr(row, "tags", None), dict) else {}
                source_pack = tags.get("source_pack")
                source_pack_text = str(source_pack).strip() if source_pack is not None else ""
                expected_pack = expected_source_pack_for_block_id(block_id)
                if expected_pack and source_pack_text != expected_pack:
                    wrong_source_pack.append(
                        f"{block_id}: expected source_pack={expected_pack!r}, got {source_pack_text!r}"
                    )
                    continue
                if source_pack_text and source_pack_text not in REGISTERED_SOURCE_PACKS:
                    wrong_source_pack.append(
                        f"{block_id}: source_pack={source_pack_text!r} is not explicitly registered"
                    )
    except (OperationalError, ProgrammingError, SQLAlchemyError) as exc:
        raise RuntimeError(
            "direct_mode_blocks_schema_incompatible: blocks schema is not compatible with "
            "direct mode checks. Use API mode, or run/migrate the blocks DB to current schema."
        ) from exc

    if missing:
        raise RuntimeError(
            f"Required block primitives missing ({len(missing)}/{len(REQUIRED_BLOCK_IDS)}). "
            f"Load content packs before running seed.\n"
            f"  Missing: {missing}"
        )

    if wrong_source_pack:
        raise RuntimeError(
            "Required block primitives found with unexpected source pack mapping. "
            "Register expected packs explicitly and reload content packs.\n"
            f"  Errors: {wrong_source_pack}"
        )

    return {
        "verified": len(REQUIRED_BLOCK_IDS),
        "missing": 0,
        "registered_source_packs": list(REGISTERED_SOURCE_PACKS),
    }


async def _verify_required_templates(db: AsyncSession) -> Dict[str, Any]:
    """Verify all required template slugs exist in the templates DB."""
    service = BlockTemplateService(db)
    missing: List[str] = []
    wrong_source_pack: List[str] = []

    for slug in REQUIRED_TEMPLATE_SLUGS:
        existing = await service.get_template_by_slug(slug)
        if existing is None:
            missing.append(slug)
            continue

        package_name = str(getattr(existing, "package_name", "") or "").strip()
        if package_name and package_name not in REGISTERED_TEMPLATE_PACKS:
            wrong_source_pack.append(
                f"{slug}: package_name={package_name!r} is not explicitly registered"
            )

    if missing:
        raise RuntimeError(
            f"Required generation templates missing ({len(missing)}/{len(REQUIRED_TEMPLATE_SLUGS)}). "
            f"Load content packs before running seed.\n"
            f"  Missing: {missing}"
        )

    if wrong_source_pack:
        raise RuntimeError(
            "Required templates found with unexpected package registration.\n"
            f"  Errors: {wrong_source_pack}"
        )

    return {
        "verified": len(REQUIRED_TEMPLATE_SLUGS),
        "missing": 0,
        "registered_template_packs": list(REGISTERED_TEMPLATE_PACKS),
    }


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
    duplicate_ids: List[int] = []
    deleted_duplicate_count = 0
    migrated_from_legacy_seed = False
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
        )
        same_name = result.scalars().all()
        preferred_existing: Optional[GameProjectSnapshot] = next(
            (snapshot for snapshot in same_name if not _is_legacy_seed_snapshot(snapshot)),
            None,
        )
        if preferred_existing is None and same_name:
            migrated_from_legacy_seed = True
        existing = preferred_existing
        duplicate_ids = [
            int(snapshot.id)
            for snapshot in same_name
            if snapshot.id is not None and (existing is None or int(snapshot.id) != int(existing.id))
        ]

    saved = await storage.save_project(
        owner_user_id=owner_user_id,
        name=project_name,
        bundle=bundle,
        source_world_id=world_id,
        overwrite_project_id=(existing.id if existing is not None else None),
        provenance=(
            ProjectProvenance(
                kind=ProjectOriginKind.IMPORT,
                source_key=BOOTSTRAP_SOURCE_KEY,
                meta={
                    "bootstrap_mode": "explicit_initialization",
                    "bootstrap_profile": BOOTSTRAP_PROFILE,
                    "bootstrap_world_name": world_name,
                    "registered_source_packs": list(REGISTERED_SOURCE_PACKS),
                    "registered_template_packs": list(REGISTERED_TEMPLATE_PACKS),
                },
            )
            if existing is None
            else None
        ),
    )
    if duplicate_ids:
        await db.execute(
            delete(GameProjectSnapshot).where(
                GameProjectSnapshot.owner_user_id == owner_user_id,
                GameProjectSnapshot.id.in_(duplicate_ids),
            )
        )
        await db.commit()
        deleted_duplicate_count = len(duplicate_ids)
    return {
        "project_id": saved.id,
        "name": saved.name,
        "source_world_id": saved.source_world_id,
        "overwritten": existing is not None,
        "migrated_from_legacy_seed": migrated_from_legacy_seed,
        "bundle_mode": "full_export",
        "duplicate_candidates": len(duplicate_ids),
        "duplicates_deleted": deleted_duplicate_count,
    }


async def seed_bananza_boat_slice(
    *,
    owner_user_id: int,
    world_name: str,
    project_name: str,
    project_id: Optional[int] = None,
) -> Dict[str, Any]:
    # Validate that required content is loaded before proceeding
    block_check = await _verify_required_blocks()

    async with get_async_session() as db:
        template_check = await _verify_required_templates(db)

        world = await _ensure_world(db, owner_user_id=owner_user_id, world_name=world_name)
        if world.id is None:
            raise RuntimeError("world_missing_id")

        locations_by_key = await _upsert_locations(
            db,
            world_id=world.id,
            world_name=world_name,
        )
        npcs_by_key = await _upsert_npcs_and_schedules(
            db,
            world_id=world.id,
            world_name=world_name,
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
            world_name=world_name,
            project_name=project_name,
            project_id=project_id,
        )

    print("Seed complete: Bananza Boat slice")
    print(f"  world_id: {world.id}")
    print(f"  owner_user_id: {owner_user_id}")
    print(
        "  content_check: "
        f"blocks_verified={block_check['verified']} "
        f"templates_verified={template_check['verified']}"
    )
    print(
        "  project_snapshot: "
        f"id={project_summary['project_id']} "
        f"name={project_summary['name']!r} "
        f"source_world_id={project_summary['source_world_id']} "
        f"overwritten={project_summary['overwritten']} "
        f"migrated_from_legacy_seed={project_summary['migrated_from_legacy_seed']} "
        f"bundle_mode={project_summary['bundle_mode']}"
    )
    print(
        "  project_snapshot_dedup: "
        f"candidates={project_summary['duplicate_candidates']} "
        f"deleted={project_summary['duplicates_deleted']}"
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
    print("")
    print("Next step example:")
    print(
        "  POST /api/v1/game/dialogue/primitives/select with "
        "lead_npc_id, partner_npc_id, world_id, location_tag, mood, pose"
    )

    return {
        "world_id": world.id,
        "project_id": project_summary["project_id"],
        "project_name": project_summary["name"],
        "source_world_id": project_summary["source_world_id"],
    }
