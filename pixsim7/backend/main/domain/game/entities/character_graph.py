"""Character Identity Graph - Query Layer

Provides graph traversal and query APIs over existing character, NPC, scene, and asset tables.
No schema changes required - this is a query abstraction layer.

Key Functions:
- get_character_graph(character_id): Full graph for a character
- find_characters_for_npc(npc_id): Character templates/instances for an NPC
- find_scenes_for_character(character_id): Scenes where character appears
- find_assets_for_character(character_id): Assets featuring the character
"""
from typing import Optional, List, Dict, Any, Union
from uuid import UUID
from datetime import datetime
from sqlalchemy import select, or_, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .character import Character, CharacterUsage, CharacterRelationship
from .character_integrations import (
    CharacterInstance,
    CharacterNPCLink,
    SceneCharacterManifest,
)
from ..core.models import GameNPC, GameScene, GameSceneNode, NpcExpression
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.domain.generation.models import Generation


# ============================================================================
# Graph Node Builders
# ============================================================================


def _build_character_template_node(character: Character) -> Dict[str, Any]:
    """Build CharacterTemplateNode from Character model"""
    return {
        "type": "character_template",
        "id": f"character:{character.id}",
        "characterId": str(character.id),
        "characterStringId": character.character_id,
        "label": character.display_name or character.name or character.character_id,
        "name": character.name,
        "displayName": character.display_name,
        "category": character.category,
        "species": character.species,
        "archetype": character.archetype,
        "tags": character.tags,
        "isActive": character.is_active,
        "meta": {
            "visual_traits": character.visual_traits,
            "personality_traits": character.personality_traits,
            "voice_profile": character.voice_profile,
            "render_style": character.render_style,
        },
    }


def _build_character_instance_node(instance: CharacterInstance) -> Dict[str, Any]:
    """Build CharacterInstanceNode from CharacterInstance model"""
    return {
        "type": "character_instance",
        "id": f"instance:{instance.id}",
        "instanceId": str(instance.id),
        "characterId": str(instance.character_id),
        "label": instance.instance_name or f"Instance {instance.id}",
        "worldId": instance.world_id,
        "characterVersion": instance.character_version,
        "instanceName": instance.instance_name,
        "isActive": instance.is_active,
        "hasOverrides": bool(
            instance.visual_overrides
            or instance.personality_overrides
            or instance.behavioral_overrides
        ),
        "currentState": instance.current_state,
        "meta": instance.instance_metadata,
    }


def _build_game_npc_node(npc: GameNPC) -> Dict[str, Any]:
    """Build GameNPCNode from GameNPC model"""
    return {
        "type": "game_npc",
        "id": f"npc:{npc.id}",
        "npcId": npc.id,
        "label": npc.name,
        "name": npc.name,
        "homeLocationId": npc.home_location_id,
        "personality": npc.personality,
    }


def _build_scene_node(scene: GameScene) -> Dict[str, Any]:
    """Build SceneNode from GameScene model"""
    return {
        "type": "scene",
        "id": f"scene:game:{scene.id}",
        "sceneId": scene.id,
        "sceneType": "game_scene",
        "label": scene.title,
        "title": scene.title,
        "description": scene.description,
        "sceneMeta": scene.meta,
    }


def _build_asset_node(asset: Asset) -> Dict[str, Any]:
    """Build AssetNode from Asset model"""
    return {
        "type": "asset",
        "id": f"asset:{asset.id}",
        "assetId": asset.id,
        "label": asset.description or f"Asset {asset.id}",
        "mediaType": asset.media_type.value,
        "description": asset.description,
        "tags": asset.tags,
        "styleTags": asset.style_tags,
        "contentDomain": asset.content_domain.value,
        "contentCategory": asset.content_category,
        "sourceGenerationId": asset.source_generation_id,
    }


def _build_generation_node(generation: Generation) -> Dict[str, Any]:
    """Build GenerationNode from Generation model"""
    return {
        "type": "generation",
        "id": f"generation:{generation.id}",
        "generationId": generation.id,
        "label": generation.name or f"Generation {generation.id}",
        "operationType": generation.operation_type.value,
        "providerId": generation.provider_id,
        "status": generation.status.value,
        "promptVersionId": str(generation.prompt_version_id) if generation.prompt_version_id else None,
        "finalPrompt": generation.final_prompt,
        "assetId": generation.asset_id,
        "createdAt": generation.created_at.isoformat(),
    }


# ============================================================================
# Core Graph Queries
# ============================================================================


async def get_character_graph(
    db: AsyncSession,
    character_id: UUID,
    world_id: Optional[int] = None,
    include_inactive: bool = False,
    max_depth: int = 3,
) -> Dict[str, Any]:
    """Get full character identity graph for a character template

    Args:
        db: Database session
        character_id: Character template UUID
        world_id: Optional filter by world
        include_inactive: Include inactive nodes
        max_depth: Maximum graph depth (1=direct, 2=+1 hop, 3=+2 hops)

    Returns:
        CharacterIdentityGraph dict with nodes and edges
    """
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []

    # Depth 0: Root character
    character = await db.get(Character, character_id)
    if not character:
        return {"nodes": [], "edges": [], "meta": {"error": "Character not found"}}

    if not include_inactive and not character.is_active:
        return {"nodes": [], "edges": [], "meta": {"error": "Character is inactive"}}

    root_node = _build_character_template_node(character)
    nodes.append(root_node)

    if max_depth < 1:
        return _build_graph_response(nodes, edges, character_id)

    # Depth 1: Character instances
    instances_query = select(CharacterInstance).where(
        CharacterInstance.character_id == character_id
    )
    if world_id is not None:
        instances_query = instances_query.where(CharacterInstance.world_id == world_id)
    if not include_inactive:
        instances_query = instances_query.where(CharacterInstance.is_active == True)

    instances_result = await db.execute(instances_query)
    instances = instances_result.scalars().all()

    for instance in instances:
        instance_node = _build_character_instance_node(instance)
        nodes.append(instance_node)
        edges.append(
            {
                "type": "instantiates",
                "from": root_node["id"],
                "to": instance_node["id"],
                "label": f"World {instance.world_id}" if instance.world_id else "No world",
                "meta": {"world_id": instance.world_id},
            }
        )

    if max_depth < 2:
        return _build_graph_response(nodes, edges, character_id)

    # Depth 2: NPCs linked to instances
    instance_ids = [inst.id for inst in instances]
    if instance_ids:
        npc_links_query = select(CharacterNPCLink).where(
            CharacterNPCLink.character_instance_id.in_(instance_ids)
        )
        npc_links_result = await db.execute(npc_links_query)
        npc_links = npc_links_result.scalars().all()

        npc_ids = list(set(link.npc_id for link in npc_links))
        if npc_ids:
            npcs_query = select(GameNPC).where(GameNPC.id.in_(npc_ids))
            npcs_result = await db.execute(npcs_query)
            npcs = npcs_result.scalars().all()

            npc_nodes_by_id = {}
            for npc in npcs:
                npc_node = _build_game_npc_node(npc)
                nodes.append(npc_node)
                npc_nodes_by_id[npc.id] = npc_node

            # Add edges from instances to NPCs
            for link in npc_links:
                instance_id = f"instance:{link.character_instance_id}"
                npc_id = f"npc:{link.npc_id}"
                edges.append(
                    {
                        "type": "syncs_with",
                        "from": instance_id,
                        "to": npc_id,
                        "bidirectional": True,
                        "label": f"Sync: {link.sync_direction}",
                        "meta": {
                            "sync_enabled": link.sync_enabled,
                            "sync_direction": link.sync_direction,
                            "priority": link.priority,
                        },
                    }
                )

    # Depth 2: Scenes via SceneCharacterManifest
    scenes_query = select(SceneCharacterManifest).where(
        or_(
            SceneCharacterManifest.required_characters.contains([character.character_id]),
            SceneCharacterManifest.optional_characters.contains([character.character_id]),
        )
    )
    scenes_result = await db.execute(scenes_query)
    scene_manifests = scenes_result.scalars().all()

    scene_ids = [manifest.scene_id for manifest in scene_manifests]
    if scene_ids:
        game_scenes_query = select(GameScene).where(GameScene.id.in_(scene_ids))
        game_scenes_result = await db.execute(game_scenes_query)
        game_scenes = game_scenes_result.scalars().all()

        for scene in game_scenes:
            scene_node = _build_scene_node(scene)
            nodes.append(scene_node)
            edges.append(
                {
                    "type": "appears_in",
                    "from": root_node["id"],
                    "to": scene_node["id"],
                    "label": "Appears in scene",
                }
            )

    # Depth 2: Character relationships
    relationships_query = select(CharacterRelationship).where(
        or_(
            CharacterRelationship.character_a_id == character_id,
            CharacterRelationship.character_b_id == character_id,
        )
    )
    relationships_result = await db.execute(relationships_query)
    relationships = relationships_result.scalars().all()

    related_char_ids = set()
    for rel in relationships:
        if rel.character_a_id == character_id:
            related_char_ids.add(rel.character_b_id)
        else:
            related_char_ids.add(rel.character_a_id)

    if related_char_ids:
        related_chars_query = select(Character).where(Character.id.in_(related_char_ids))
        if not include_inactive:
            related_chars_query = related_chars_query.where(Character.is_active == True)
        related_chars_result = await db.execute(related_chars_query)
        related_chars = related_chars_result.scalars().all()

        for related_char in related_chars:
            related_node = _build_character_template_node(related_char)
            nodes.append(related_node)

        # Add relationship edges
        for rel in relationships:
            if rel.character_a_id == character_id:
                from_id = root_node["id"]
                to_id = f"character:{rel.character_b_id}"
            else:
                from_id = f"character:{rel.character_a_id}"
                to_id = root_node["id"]

            edges.append(
                {
                    "type": "references",
                    "from": from_id,
                    "to": to_id,
                    "label": rel.relationship_type,
                    "strength": rel.relationship_strength,
                    "meta": {"relationship_type": rel.relationship_type, "notes": rel.notes},
                }
            )

    # Depth 2: Character usage (prompts/actions)
    usage_query = select(CharacterUsage).where(CharacterUsage.character_id == character_id)
    usage_result = await db.execute(usage_query)
    usages = usage_result.scalars().all()

    # Add usage edges (simplified - just count for now)
    if usages:
        edges.append(
            {
                "type": "uses_character",
                "from": "system:prompts",
                "to": root_node["id"],
                "label": f"Used in {len(usages)} prompts/actions",
                "meta": {"usage_count": len(usages)},
            }
        )

    if max_depth < 3:
        return _build_graph_response(nodes, edges, character_id)

    # Depth 3: Assets linked via generations
    # Find generations that reference this character (via prompt variables)
    # This is complex - for now, find assets created from scenes where character appears
    if scene_ids:
        scene_nodes_query = select(GameSceneNode).where(GameSceneNode.scene_id.in_(scene_ids))
        scene_nodes_result = await db.execute(scene_nodes_query)
        scene_nodes = scene_nodes_result.scalars().all()

        asset_ids_in_scenes = list(set(node.asset_id for node in scene_nodes))
        if asset_ids_in_scenes:
            assets_query = select(Asset).where(Asset.id.in_(asset_ids_in_scenes))
            assets_result = await db.execute(assets_query)
            assets = assets_result.scalars().all()

            for asset in assets:
                asset_node = _build_asset_node(asset)
                nodes.append(asset_node)
                # Link to scenes
                for scene_node in scene_nodes:
                    if scene_node.asset_id == asset.id:
                        edges.append(
                            {
                                "type": "contains_asset",
                                "from": f"scene:game:{scene_node.scene_id}",
                                "to": asset_node["id"],
                                "label": "Contains asset",
                            }
                        )

    return _build_graph_response(nodes, edges, character_id)


async def find_characters_for_npc(
    db: AsyncSession, npc_id: int, world_id: Optional[int] = None
) -> Dict[str, Any]:
    """Find all character templates and instances linked to an NPC

    Args:
        db: Database session
        npc_id: GameNPC ID
        world_id: Optional filter by world

    Returns:
        Dict with character templates, instances, and linkage info
    """
    # Get NPC
    npc = await db.get(GameNPC, npc_id)
    if not npc:
        return {"error": "NPC not found"}

    # Get character-NPC links
    links_query = select(CharacterNPCLink).where(CharacterNPCLink.npc_id == npc_id)
    links_result = await db.execute(links_query)
    links = links_result.scalars().all()

    if not links:
        return {
            "npc_id": npc_id,
            "npc_name": npc.name,
            "character_templates": [],
            "character_instances": [],
            "links": [],
        }

    # Get instances
    instance_ids = [link.character_instance_id for link in links]
    instances_query = select(CharacterInstance).where(CharacterInstance.id.in_(instance_ids))
    if world_id is not None:
        instances_query = instances_query.where(CharacterInstance.world_id == world_id)
    instances_result = await db.execute(instances_query)
    instances = instances_result.scalars().all()

    # Get character templates
    character_ids = list(set(inst.character_id for inst in instances))
    characters_query = select(Character).where(Character.id.in_(character_ids))
    characters_result = await db.execute(characters_query)
    characters = characters_result.scalars().all()

    return {
        "npc_id": npc_id,
        "npc_name": npc.name,
        "character_templates": [_build_character_template_node(c) for c in characters],
        "character_instances": [_build_character_instance_node(i) for i in instances],
        "links": [
            {
                "character_instance_id": str(link.character_instance_id),
                "sync_enabled": link.sync_enabled,
                "sync_direction": link.sync_direction,
                "priority": link.priority,
            }
            for link in links
        ],
    }


async def find_scenes_for_character(
    db: AsyncSession,
    character_id: Optional[UUID] = None,
    character_instance_id: Optional[UUID] = None,
) -> List[Dict[str, Any]]:
    """Find all scenes where a character or instance appears

    Args:
        db: Database session
        character_id: Character template UUID (searches via manifest)
        character_instance_id: Character instance UUID (searches via NPCs in scenes)

    Returns:
        List of scene nodes with role information
    """
    scene_nodes = []

    if character_id:
        # Find via SceneCharacterManifest
        character = await db.get(Character, character_id)
        if not character:
            return []

        manifests_query = select(SceneCharacterManifest).where(
            or_(
                SceneCharacterManifest.required_characters.contains([character.character_id]),
                SceneCharacterManifest.optional_characters.contains([character.character_id]),
            )
        )
        manifests_result = await db.execute(manifests_query)
        manifests = manifests_result.scalars().all()

        scene_ids = [manifest.scene_id for manifest in manifests]
        if scene_ids:
            scenes_query = select(GameScene).where(GameScene.id.in_(scene_ids))
            scenes_result = await db.execute(scenes_query)
            scenes = scenes_result.scalars().all()

            for scene in scenes:
                # Find manifest for this scene
                manifest = next(
                    (m for m in manifests if m.scene_id == scene.id), None
                )
                role_info = None
                if manifest and character.character_id in manifest.character_roles:
                    role_info = manifest.character_roles[character.character_id]

                scene_node = _build_scene_node(scene)
                scene_node["role"] = role_info
                scene_node["required"] = (
                    character.character_id in manifest.required_characters
                    if manifest
                    else False
                )
                scene_nodes.append(scene_node)

    if character_instance_id:
        # Find via NPC links
        instance = await db.get(CharacterInstance, character_instance_id)
        if not instance:
            return scene_nodes  # Return what we found from character_id

        # Get NPCs for this instance
        links_query = select(CharacterNPCLink).where(
            CharacterNPCLink.character_instance_id == character_instance_id
        )
        links_result = await db.execute(links_query)
        links = links_result.scalars().all()

        # TODO: Find scenes that reference these NPCs
        # This would require looking at GameScene.meta or GameSceneNode.meta for NPC references
        # For now, we rely on character template matching

    return scene_nodes


async def find_assets_for_character(
    db: AsyncSession,
    character_id: Optional[UUID] = None,
    character_instance_id: Optional[UUID] = None,
    world_id: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Find all assets featuring a character

    Args:
        db: Database session
        character_id: Character template UUID
        character_instance_id: Character instance UUID
        world_id: Optional filter by world

    Returns:
        List of asset nodes
    """
    asset_nodes = []

    # Strategy 1: Find scenes for character, then assets in those scenes
    scenes = await find_scenes_for_character(db, character_id, character_instance_id)
    scene_ids = [s["sceneId"] for s in scenes]

    if scene_ids:
        scene_nodes_query = select(GameSceneNode).where(GameSceneNode.scene_id.in_(scene_ids))
        scene_nodes_result = await db.execute(scene_nodes_query)
        scene_nodes = scene_nodes_result.scalars().all()

        asset_ids = list(set(node.asset_id for node in scene_nodes))
        if asset_ids:
            assets_query = select(Asset).where(Asset.id.in_(asset_ids))
            assets_result = await db.execute(assets_query)
            assets = assets_result.scalars().all()

            for asset in assets:
                asset_node = _build_asset_node(asset)
                # Annotate which scenes this asset appears in
                asset_node["scenes"] = [
                    {"scene_id": node.scene_id, "node_id": node.id}
                    for node in scene_nodes
                    if node.asset_id == asset.id
                ]
                asset_nodes.append(asset_node)

    # Strategy 2: Find via NPC expressions (portraits)
    if character_instance_id:
        instance = await db.get(CharacterInstance, character_instance_id)
        if instance:
            # Get NPCs for this instance
            links_query = select(CharacterNPCLink).where(
                CharacterNPCLink.character_instance_id == character_instance_id
            )
            links_result = await db.execute(links_query)
            links = links_result.scalars().all()

            npc_ids = [link.npc_id for link in links]
            if npc_ids:
                # Get NPC expressions
                expressions_query = select(NpcExpression).where(
                    NpcExpression.npc_id.in_(npc_ids)
                )
                expressions_result = await db.execute(expressions_query)
                expressions = expressions_result.scalars().all()

                expression_asset_ids = list(set(expr.asset_id for expr in expressions))
                if expression_asset_ids:
                    expr_assets_query = select(Asset).where(
                        Asset.id.in_(expression_asset_ids)
                    )
                    expr_assets_result = await db.execute(expr_assets_query)
                    expr_assets = expr_assets_result.scalars().all()

                    for asset in expr_assets:
                        # Avoid duplicates
                        if any(a["assetId"] == asset.id for a in asset_nodes):
                            continue

                        asset_node = _build_asset_node(asset)
                        asset_node["usage_type"] = "npc_expression"
                        asset_node["npc_expressions"] = [
                            {"npc_id": expr.npc_id, "state": expr.state}
                            for expr in expressions
                            if expr.asset_id == asset.id
                        ]
                        asset_nodes.append(asset_node)

    # TODO Strategy 3: Find via generation metadata (when implemented)
    # Search Generation.prompt_config.variables or canonical_params for character references

    return asset_nodes


# ============================================================================
# Helper Functions
# ============================================================================


def _build_graph_response(
    nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]], root_id: UUID
) -> Dict[str, Any]:
    """Build standardized graph response"""
    node_types_count = {}
    for node in nodes:
        node_type = node["type"]
        node_types_count[node_type] = node_types_count.get(node_type, 0) + 1

    edge_types_count = {}
    for edge in edges:
        edge_type = edge["type"]
        edge_types_count[edge_type] = edge_types_count.get(edge_type, 0) + 1

    return {
        "nodes": nodes,
        "edges": edges,
        "meta": {
            "builtAt": datetime.utcnow().isoformat(),
            "rootNodeId": f"character:{root_id}",
            "stats": {
                "totalNodes": len(nodes),
                "totalEdges": len(edges),
                "nodeCountsByType": node_types_count,
                "edgeCountsByType": edge_types_count,
            },
        },
    }


# ============================================================================
# Usage Analytics
# ============================================================================


async def get_character_usage_stats(
    db: AsyncSession, character_id: UUID
) -> Optional[Dict[str, Any]]:
    """Get comprehensive usage statistics for a character

    Args:
        db: Database session
        character_id: Character template UUID

    Returns:
        CharacterUsageStats dict or None if not found
    """
    character = await db.get(Character, character_id)
    if not character:
        return None

    # Count instances
    instances_count_query = select(func.count(CharacterInstance.id)).where(
        CharacterInstance.character_id == character_id
    )
    instances_count = await db.scalar(instances_count_query) or 0

    # Count NPCs (via instances)
    npc_count_query = (
        select(func.count(func.distinct(CharacterNPCLink.npc_id)))
        .select_from(CharacterNPCLink)
        .join(CharacterInstance, CharacterInstance.id == CharacterNPCLink.character_instance_id)
        .where(CharacterInstance.character_id == character_id)
    )
    npc_count = await db.scalar(npc_count_query) or 0

    # Count scenes
    scenes_query = select(SceneCharacterManifest).where(
        or_(
            SceneCharacterManifest.required_characters.contains([character.character_id]),
            SceneCharacterManifest.optional_characters.contains([character.character_id]),
        )
    )
    scenes_result = await db.execute(scenes_query)
    scenes = scenes_result.scalars().all()
    scene_count = len(scenes)
    scene_ids = [s.scene_id for s in scenes]

    # Count prompt/action usages
    usage_count_query = select(func.count(CharacterUsage.id)).where(
        CharacterUsage.character_id == character_id
    )
    usage_count = await db.scalar(usage_count_query) or 0

    # Get world IDs
    worlds_query = select(func.distinct(CharacterInstance.world_id)).where(
        and_(
            CharacterInstance.character_id == character_id,
            CharacterInstance.world_id.isnot(None),
        )
    )
    worlds_result = await db.execute(worlds_query)
    world_ids = [w for w in worlds_result.scalars().all()]

    # Get related characters
    relationships_query = select(CharacterRelationship).where(
        or_(
            CharacterRelationship.character_a_id == character_id,
            CharacterRelationship.character_b_id == character_id,
        )
    )
    relationships_result = await db.execute(relationships_query)
    relationships = relationships_result.scalars().all()

    related_char_ids = []
    for rel in relationships:
        if rel.character_a_id == character_id:
            related_char_ids.append(str(rel.character_b_id))
        else:
            related_char_ids.append(str(rel.character_a_id))

    return {
        "characterId": str(character_id),
        "characterName": character.display_name or character.name or character.character_id,
        "instanceCount": instances_count,
        "npcCount": npc_count,
        "sceneCount": scene_count,
        "assetCount": 0,  # TODO: Implement when asset linkage is added
        "generationCount": 0,  # TODO: Implement when generation linkage is added
        "promptVersionCount": usage_count,  # Approximate
        "actionBlockCount": 0,  # TODO: Separate count
        "worldIds": world_ids,
        "sceneIds": scene_ids,
        "relatedCharacterIds": related_char_ids,
        "lastUsedAt": character.last_used_at.isoformat() if character.last_used_at else None,
    }
