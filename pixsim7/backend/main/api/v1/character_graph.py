"""Character Identity Graph API Routes

Admin-only API for querying the character identity graph.
Provides graph traversal, path finding, and analytics.
"""
from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.infrastructure.database.session import get_async_session
from pixsim7.backend.main.domain.game.entities import (
    get_character_graph,
    find_characters_for_npc,
    find_scenes_for_character,
    find_assets_for_character,
    get_character_usage_stats,
)

router = APIRouter(prefix="/character-graph", tags=["character-graph"])


@router.get("/character/{character_id}")
async def get_character_graph_route(
    character_id: UUID,
    world_id: Optional[int] = Query(None, description="Filter by world ID"),
    include_inactive: bool = Query(False, description="Include inactive nodes"),
    max_depth: int = Query(3, ge=1, le=5, description="Maximum graph depth (1-5)"),
    db: AsyncSession = Depends(get_async_session),
):
    """Get full character identity graph for a character template

    Returns all related nodes (instances, NPCs, scenes, assets) and their connections.

    **Node types included:**
    - Character instances (world-specific versions)
    - Game NPCs (linked via instances)
    - Scenes (via SceneCharacterManifest)
    - Related characters (via relationships)
    - Assets (in scenes where character appears)
    - Character usage (prompts/actions)

    **Edge types:**
    - `instantiates`: Template → Instance
    - `syncs_with`: Instance → NPC
    - `appears_in`: Character → Scene
    - `references`: Character → Character (relationships)
    - `contains_asset`: Scene → Asset
    - `uses_character`: Prompt/Action → Character

    **Depth levels:**
    - Depth 1: Character + instances
    - Depth 2: + NPCs, scenes, relationships, usage
    - Depth 3: + assets in scenes
    """
    try:
        graph = await get_character_graph(
            db=db,
            character_id=character_id,
            world_id=world_id,
            include_inactive=include_inactive,
            max_depth=max_depth,
        )
        return graph
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error building graph: {str(e)}")


@router.get("/npc/{npc_id}/characters")
async def get_characters_for_npc_route(
    npc_id: int,
    world_id: Optional[int] = Query(None, description="Filter by world ID"),
    db: AsyncSession = Depends(get_async_session),
):
    """Find all character templates and instances linked to an NPC

    Returns:
    - Character templates (base definitions)
    - Character instances (world-specific versions)
    - Link configurations (sync settings, priorities)

    Useful for:
    - Finding which character an NPC represents
    - Understanding NPC-character sync relationships
    - Debugging character instance bindings
    """
    result = await find_characters_for_npc(db=db, npc_id=npc_id, world_id=world_id)

    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    return result


@router.get("/character/{character_id}/scenes")
async def get_scenes_for_character_route(
    character_id: UUID,
    db: AsyncSession = Depends(get_async_session),
):
    """Find all scenes where a character appears

    Searches via SceneCharacterManifest to find scenes that require or
    optionally include this character.

    Returns scene information including:
    - Scene details (title, description)
    - Character role in scene (protagonist, antagonist, etc.)
    - Whether character is required or optional
    """
    scenes = await find_scenes_for_character(db=db, character_id=character_id)
    return {"character_id": str(character_id), "scenes": scenes, "count": len(scenes)}


@router.get("/instance/{instance_id}/scenes")
async def get_scenes_for_instance_route(
    instance_id: UUID,
    db: AsyncSession = Depends(get_async_session),
):
    """Find all scenes where a character instance appears

    Searches via linked NPCs and scene references.

    Returns scene information for this specific character instance.
    """
    scenes = await find_scenes_for_character(db=db, character_instance_id=instance_id)
    return {"character_instance_id": str(instance_id), "scenes": scenes, "count": len(scenes)}


@router.get("/character/{character_id}/assets")
async def get_assets_for_character_route(
    character_id: UUID,
    world_id: Optional[int] = Query(None, description="Filter by world ID"),
    db: AsyncSession = Depends(get_async_session),
):
    """Find all assets featuring a character

    Searches via:
    1. Scenes where character appears → assets in those scenes
    2. NPC expressions/portraits (for character instances)
    3. Generation metadata (when implemented)

    Returns assets with context:
    - Which scenes they appear in
    - NPC expressions they're used for
    - Asset metadata (tags, content domain)
    """
    assets = await find_assets_for_character(db=db, character_id=character_id, world_id=world_id)
    return {"character_id": str(character_id), "assets": assets, "count": len(assets)}


@router.get("/instance/{instance_id}/assets")
async def get_assets_for_instance_route(
    instance_id: UUID,
    world_id: Optional[int] = Query(None, description="Filter by world ID"),
    db: AsyncSession = Depends(get_async_session),
):
    """Find all assets featuring a character instance

    Searches via:
    1. Scenes where instance appears → assets in those scenes
    2. NPC expressions/portraits for NPCs linked to this instance
    3. Generation metadata (when implemented)

    Returns assets specific to this character instance.
    """
    assets = await find_assets_for_character(
        db=db, character_instance_id=instance_id, world_id=world_id
    )
    return {"character_instance_id": str(instance_id), "assets": assets, "count": len(assets)}


@router.get("/character/{character_id}/stats")
async def get_character_stats_route(
    character_id: UUID,
    db: AsyncSession = Depends(get_async_session),
):
    """Get comprehensive usage statistics for a character

    Returns:
    - Instance count (how many worlds use this character)
    - NPC count (how many NPCs represent this character)
    - Scene count (how many scenes feature this character)
    - Asset count (how many assets feature this character)
    - Generation count (how many generations involve this character)
    - Usage count (prompts, action blocks)
    - Related characters (via relationships)
    - Last used timestamp

    Useful for:
    - Character analytics dashboard
    - Understanding character usage across the system
    - Identifying unused or heavily-used characters
    """
    stats = await get_character_usage_stats(db=db, character_id=character_id)

    if stats is None:
        raise HTTPException(status_code=404, detail="Character not found")

    return stats


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "character-graph"}
