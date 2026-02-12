from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.game import (
    GameWorld,
    GameWorldState,
    GameLocation,
    GameHotspot,
    GameNPC,
    NPCSchedule,
    NpcExpression,
    GameScene,
    GameSceneNode,
    GameSceneEdge,
    GameItem,
)
from pixsim7.backend.main.domain.game.schemas.project_bundle import (
    BundleHotspotData,
    BundleItemData,
    BundleLocationData,
    BundleNpcData,
    BundleNpcExpressionData,
    BundleNpcScheduleData,
    BundleSceneData,
    BundleSceneEdgeData,
    BundleSceneNodeData,
    BundleWorldData,
    GameProjectBundle,
    GameProjectCoreBundle,
    GameProjectImportRequest,
    GameProjectImportResponse,
    ProjectImportCounts,
    ProjectImportIdMaps,
    ProjectImportMode,
)


@dataclass
class _PendingHotspot:
    location_id: int
    data: BundleHotspotData


class GameProjectBundleService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def export_world_bundle(self, world_id: int) -> GameProjectBundle:
        world = await self.db.get(GameWorld, world_id)
        if not world:
            raise ValueError("world_not_found")

        state = await self.db.get(GameWorldState, world_id)
        world_time = state.world_time if state else 0.0

        locations_result = await self.db.execute(
            select(GameLocation).where(GameLocation.world_id == world_id).order_by(GameLocation.id)
        )
        locations = list(locations_result.scalars().all())
        location_ids = [loc.id for loc in locations if loc.id is not None]

        hotspots_by_location: Dict[int, List[GameHotspot]] = {loc_id: [] for loc_id in location_ids}
        if location_ids:
            hotspots_result = await self.db.execute(
                select(GameHotspot)
                .where(GameHotspot.location_id.in_(location_ids))
                .order_by(GameHotspot.id)
            )
            for hotspot in hotspots_result.scalars().all():
                if hotspot.location_id is not None:
                    hotspots_by_location.setdefault(hotspot.location_id, []).append(hotspot)

        npcs_result = await self.db.execute(
            select(GameNPC).where(GameNPC.world_id == world_id).order_by(GameNPC.id)
        )
        npcs = list(npcs_result.scalars().all())
        npc_ids = [npc.id for npc in npcs if npc.id is not None]

        schedules_by_npc: Dict[int, List[NPCSchedule]] = {npc_id: [] for npc_id in npc_ids}
        if npc_ids:
            schedules_result = await self.db.execute(
                select(NPCSchedule).where(NPCSchedule.npc_id.in_(npc_ids)).order_by(NPCSchedule.id)
            )
            for schedule in schedules_result.scalars().all():
                schedules_by_npc.setdefault(schedule.npc_id, []).append(schedule)

        expressions_by_npc: Dict[int, List[NpcExpression]] = {npc_id: [] for npc_id in npc_ids}
        if npc_ids:
            expressions_result = await self.db.execute(
                select(NpcExpression).where(NpcExpression.npc_id.in_(npc_ids)).order_by(NpcExpression.id)
            )
            for expression in expressions_result.scalars().all():
                expressions_by_npc.setdefault(expression.npc_id, []).append(expression)

        scenes_result = await self.db.execute(
            select(GameScene).where(GameScene.world_id == world_id).order_by(GameScene.id)
        )
        scenes = list(scenes_result.scalars().all())
        scene_ids = [scene.id for scene in scenes if scene.id is not None]

        nodes_by_scene: Dict[int, List[GameSceneNode]] = {scene_id: [] for scene_id in scene_ids}
        edges_by_scene: Dict[int, List[GameSceneEdge]] = {scene_id: [] for scene_id in scene_ids}
        if scene_ids:
            nodes_result = await self.db.execute(
                select(GameSceneNode).where(GameSceneNode.scene_id.in_(scene_ids)).order_by(GameSceneNode.id)
            )
            for node in nodes_result.scalars().all():
                nodes_by_scene.setdefault(node.scene_id, []).append(node)

            edges_result = await self.db.execute(
                select(GameSceneEdge).where(GameSceneEdge.scene_id.in_(scene_ids)).order_by(GameSceneEdge.id)
            )
            for edge in edges_result.scalars().all():
                edges_by_scene.setdefault(edge.scene_id, []).append(edge)

        items_result = await self.db.execute(
            select(GameItem).where(GameItem.world_id == world_id).order_by(GameItem.id)
        )
        items = list(items_result.scalars().all())

        core = GameProjectCoreBundle(
            world=BundleWorldData(
                name=world.name,
                meta=world.meta or {},
                world_time=world_time,
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
                    hotspots=[
                        BundleHotspotData(
                            source_id=hotspot.id or 0,
                            scope=hotspot.scope,
                            hotspot_id=hotspot.hotspot_id,
                            scene_source_id=hotspot.scene_id,
                            target=hotspot.target,
                            action=hotspot.action,
                            meta=hotspot.meta,
                        )
                        for hotspot in hotspots_by_location.get(loc.id or 0, [])
                    ],
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
                            source_id=schedule.id or 0,
                            day_of_week=schedule.day_of_week,
                            start_time=schedule.start_time,
                            end_time=schedule.end_time,
                            location_source_id=schedule.location_id,
                            rule=schedule.rule,
                        )
                        for schedule in schedules_by_npc.get(npc.id or 0, [])
                    ],
                    expressions=[
                        BundleNpcExpressionData(
                            source_id=expression.id or 0,
                            state=expression.state,
                            asset_id=expression.asset_id,
                            crop=expression.crop,
                            meta=expression.meta,
                        )
                        for expression in expressions_by_npc.get(npc.id or 0, [])
                    ],
                )
                for npc in npcs
            ],
            scenes=[
                BundleSceneData(
                    source_id=scene.id or 0,
                    title=scene.title,
                    description=scene.description,
                    entry_node_source_id=scene.entry_node_id,
                    meta=scene.meta,
                    nodes=[
                        BundleSceneNodeData(
                            source_id=node.id or 0,
                            asset_id=node.asset_id,
                            label=node.label,
                            loopable=node.loopable,
                            skippable=node.skippable,
                            reveal_choices_at_sec=node.reveal_choices_at_sec,
                            meta=node.meta,
                        )
                        for node in nodes_by_scene.get(scene.id or 0, [])
                    ],
                    edges=[
                        BundleSceneEdgeData(
                            source_id=edge.id or 0,
                            from_node_source_id=edge.from_node_id,
                            to_node_source_id=edge.to_node_id,
                            choice_label=edge.choice_label,
                            weight=edge.weight,
                            reveal_at_sec=edge.reveal_at_sec,
                            cooldown_sec=edge.cooldown_sec,
                            conditions=edge.conditions,
                            effects=edge.effects,
                        )
                        for edge in edges_by_scene.get(scene.id or 0, [])
                    ],
                )
                for scene in scenes
            ],
            items=[
                BundleItemData(
                    source_id=item.id or 0,
                    name=item.name,
                    description=item.description,
                    meta=item.meta,
                    stats=getattr(item, "stats", {}) or {},
                    stats_metadata=getattr(item, "stats_metadata", {}) or {},
                )
                for item in items
            ],
        )

        return GameProjectBundle(core=core)

    async def import_bundle(
        self,
        request: GameProjectImportRequest,
        *,
        owner_user_id: int,
    ) -> GameProjectImportResponse:
        if request.mode != ProjectImportMode.CREATE_NEW_WORLD:
            raise ValueError("unsupported_import_mode")

        world_name = (request.world_name_override or "").strip() or request.bundle.core.world.name
        if not world_name:
            raise ValueError("world_name_required")

        counts = ProjectImportCounts()
        id_maps = ProjectImportIdMaps()
        warnings: List[str] = []

        location_id_map: Dict[int, int] = {}
        npc_id_map: Dict[int, int] = {}
        scene_id_map: Dict[int, int] = {}
        node_id_map: Dict[Tuple[int, int], int] = {}
        item_id_map: Dict[int, int] = {}
        pending_hotspots: List[_PendingHotspot] = []
        pending_scene_entry: List[Tuple[GameScene, Optional[int], int]] = []

        bundle_core = request.bundle.core
        world = GameWorld(
            owner_user_id=owner_user_id,
            name=world_name,
            meta=bundle_core.world.meta or {},
        )

        async with self.db.begin():
            self.db.add(world)
            await self.db.flush()
            if world.id is None:
                raise ValueError("world_create_failed")

            world_state = GameWorldState(
                world_id=world.id,
                world_time=max(0.0, float(bundle_core.world.world_time or 0.0)),
            )
            self.db.add(world_state)

            for location_data in bundle_core.locations:
                location = GameLocation(
                    world_id=world.id,
                    name=location_data.name,
                    x=location_data.x,
                    y=location_data.y,
                    asset_id=location_data.asset_id,
                    default_spawn=location_data.default_spawn,
                    meta=location_data.meta,
                    stats=location_data.stats,
                )
                self.db.add(location)
                await self.db.flush()
                if location.id is None:
                    continue

                location_id_map[location_data.source_id] = location.id
                id_maps.locations[str(location_data.source_id)] = location.id
                counts.locations += 1

                for hotspot_data in location_data.hotspots:
                    pending_hotspots.append(
                        _PendingHotspot(location_id=location.id, data=hotspot_data)
                    )

            for npc_data in bundle_core.npcs:
                home_location_id = None
                if npc_data.home_location_source_id is not None:
                    home_location_id = location_id_map.get(npc_data.home_location_source_id)
                    if home_location_id is None:
                        warnings.append(
                            f"NPC {npc_data.source_id} home location "
                            f"{npc_data.home_location_source_id} not found in imported locations"
                        )

                npc = GameNPC(
                    world_id=world.id,
                    name=npc_data.name,
                    personality=npc_data.personality,
                    home_location_id=home_location_id,
                    stats=npc_data.stats,
                )
                self.db.add(npc)
                await self.db.flush()
                if npc.id is None:
                    continue

                npc_id_map[npc_data.source_id] = npc.id
                id_maps.npcs[str(npc_data.source_id)] = npc.id
                counts.npcs += 1

                for schedule_data in npc_data.schedules:
                    mapped_location_id = location_id_map.get(schedule_data.location_source_id)
                    if mapped_location_id is None:
                        warnings.append(
                            f"Schedule {schedule_data.source_id} for NPC {npc_data.source_id} "
                            f"references unknown location {schedule_data.location_source_id}"
                        )
                        continue

                    schedule = NPCSchedule(
                        npc_id=npc.id,
                        day_of_week=schedule_data.day_of_week,
                        start_time=schedule_data.start_time,
                        end_time=schedule_data.end_time,
                        location_id=mapped_location_id,
                        rule=schedule_data.rule,
                    )
                    self.db.add(schedule)
                    counts.schedules += 1

                for expression_data in npc_data.expressions:
                    expression = NpcExpression(
                        npc_id=npc.id,
                        state=expression_data.state,
                        asset_id=expression_data.asset_id,
                        crop=expression_data.crop,
                        meta=expression_data.meta,
                    )
                    self.db.add(expression)
                    counts.expressions += 1

            for scene_data in bundle_core.scenes:
                scene = GameScene(
                    world_id=world.id,
                    title=scene_data.title,
                    description=scene_data.description,
                    entry_node_id=None,
                    meta=scene_data.meta,
                )
                self.db.add(scene)
                await self.db.flush()
                if scene.id is None:
                    continue

                scene_id_map[scene_data.source_id] = scene.id
                id_maps.scenes[str(scene_data.source_id)] = scene.id
                pending_scene_entry.append((scene, scene_data.entry_node_source_id, scene_data.source_id))
                counts.scenes += 1

            for scene_data in bundle_core.scenes:
                mapped_scene_id = scene_id_map.get(scene_data.source_id)
                if mapped_scene_id is None:
                    continue

                for node_data in scene_data.nodes:
                    node = GameSceneNode(
                        scene_id=mapped_scene_id,
                        asset_id=node_data.asset_id,
                        label=node_data.label,
                        loopable=node_data.loopable,
                        skippable=node_data.skippable,
                        reveal_choices_at_sec=node_data.reveal_choices_at_sec,
                        meta=node_data.meta,
                    )
                    self.db.add(node)
                    await self.db.flush()
                    if node.id is None:
                        continue

                    node_id_map[(scene_data.source_id, node_data.source_id)] = node.id
                    id_maps.nodes[f"{scene_data.source_id}:{node_data.source_id}"] = node.id
                    counts.nodes += 1

                for edge_data in scene_data.edges:
                    from_node_id = node_id_map.get((scene_data.source_id, edge_data.from_node_source_id))
                    to_node_id = node_id_map.get((scene_data.source_id, edge_data.to_node_source_id))
                    if from_node_id is None or to_node_id is None:
                        warnings.append(
                            f"Edge {edge_data.source_id} in scene {scene_data.source_id} "
                            "references unknown node IDs"
                        )
                        continue

                    edge = GameSceneEdge(
                        scene_id=mapped_scene_id,
                        from_node_id=from_node_id,
                        to_node_id=to_node_id,
                        choice_label=edge_data.choice_label,
                        weight=edge_data.weight,
                        reveal_at_sec=edge_data.reveal_at_sec,
                        cooldown_sec=edge_data.cooldown_sec,
                        conditions=edge_data.conditions,
                        effects=edge_data.effects,
                    )
                    self.db.add(edge)
                    counts.edges += 1

            for scene, entry_node_source_id, source_scene_id in pending_scene_entry:
                if entry_node_source_id is None:
                    continue
                mapped_entry_id = node_id_map.get((source_scene_id, entry_node_source_id))
                if mapped_entry_id is None:
                    warnings.append(
                        f"Scene {source_scene_id} entry node {entry_node_source_id} not found after import"
                    )
                    continue
                scene.entry_node_id = mapped_entry_id
                self.db.add(scene)

            for pending_hotspot in pending_hotspots:
                scene_id = None
                if pending_hotspot.data.scene_source_id is not None:
                    scene_id = scene_id_map.get(pending_hotspot.data.scene_source_id)
                    if scene_id is None:
                        warnings.append(
                            f"Hotspot {pending_hotspot.data.source_id} references unknown scene "
                            f"{pending_hotspot.data.scene_source_id}"
                        )

                hotspot = GameHotspot(
                    scope=pending_hotspot.data.scope,
                    world_id=world.id,
                    location_id=pending_hotspot.location_id,
                    scene_id=scene_id,
                    hotspot_id=pending_hotspot.data.hotspot_id,
                    target=pending_hotspot.data.target,
                    action=pending_hotspot.data.action,
                    meta=pending_hotspot.data.meta,
                )
                self.db.add(hotspot)
                counts.hotspots += 1

            for item_data in bundle_core.items:
                item = GameItem(
                    world_id=world.id,
                    name=item_data.name,
                    description=item_data.description,
                    meta=item_data.meta,
                    stats=item_data.stats,
                    stats_metadata=item_data.stats_metadata,
                )
                self.db.add(item)
                await self.db.flush()
                if item.id is None:
                    continue

                item_id_map[item_data.source_id] = item.id
                id_maps.items[str(item_data.source_id)] = item.id
                counts.items += 1

        if world.id is None:
            raise ValueError("world_create_failed")

        return GameProjectImportResponse(
            world_id=world.id,
            world_name=world.name,
            counts=counts,
            id_maps=id_maps,
            warnings=warnings,
        )
