"""
Game dialogue and narrative API endpoints.
"""

from __future__ import annotations
from typing import Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import select

from pixsim7_backend.api.dependencies import CurrentUser, DatabaseSession
from pixsim7_backend.domain.game.models import (
    GameSession, GameWorld, GameNPC, GameLocation,
    GameScene, GameSceneNode
)
from pixsim7_backend.domain.narrative import NarrativeEngine
from pixsim7_backend.domain.narrative.action_blocks import (
    ActionEngine,
    ActionSelectionContext,
    BranchIntent
)


router = APIRouter()

# Initialize the engines (singletons)
_narrative_engine = None
_action_engine = None


def get_narrative_engine() -> NarrativeEngine:
    """Get or create the narrative engine singleton."""
    global _narrative_engine
    if _narrative_engine is None:
        _narrative_engine = NarrativeEngine()
    return _narrative_engine


def get_action_engine() -> ActionEngine:
    """Get or create the action engine singleton."""
    global _action_engine
    if _action_engine is None:
        # Share the narrative engine for template rendering
        _action_engine = ActionEngine(narrative_engine=get_narrative_engine())
    return _action_engine


class DialogueNextLineRequest(BaseModel):
    """Request for generating the next dialogue line."""
    npc_id: int
    scene_id: Optional[int] = None
    node_id: Optional[int] = None
    player_input: Optional[str] = None
    player_choice_id: Optional[str] = None
    session_id: Optional[int] = None
    world_id: Optional[int] = None
    location_id: Optional[int] = None
    program_id: Optional[str] = "default_dialogue"


class DialogueNextLineResponse(BaseModel):
    """Response containing the generated dialogue prompts."""
    llm_prompt: str
    visual_prompt: Optional[str] = None
    meta: Dict[str, Any] = {}


class DialogueDebugResponse(BaseModel):
    """Debug response with full context and stage outputs."""
    context: Dict[str, Any]
    llm_prompt: str
    visual_prompt: Optional[str] = None
    meta: Dict[str, Any] = {}
    debug: Dict[str, Any] = {}


@router.post("/next-line", response_model=DialogueNextLineResponse)
async def generate_next_line(
    req: DialogueNextLineRequest,
    db: DatabaseSession,
    user: CurrentUser,
    engine: NarrativeEngine = Depends(get_narrative_engine)
) -> DialogueNextLineResponse:
    """
    Generate the next dialogue line prompt for an NPC.

    This endpoint builds a prompt for an LLM to generate contextual dialogue
    based on the NPC's persona, relationship state, world context, and current
    scene/node.
    """
    # Load required data
    # 1. Get or create session
    session = None
    if req.session_id:
        session = await db.get(GameSession, req.session_id)
        if not session or session.user_id != user.id:
            raise HTTPException(status_code=404, detail="Session not found")
    elif req.scene_id:
        # Create a temporary session context if only scene provided
        session = GameSession(
            id=0,
            user_id=user.id,
            scene_id=req.scene_id,
            current_node_id=req.node_id or 0,
            flags={},
            relationships={},
            world_time=0.0
        )
    else:
        raise HTTPException(
            status_code=400,
            detail="Either session_id or scene_id must be provided"
        )

    # 2. Load world data
    world = None
    world_data = {}
    if req.world_id:
        world = await db.get(GameWorld, req.world_id)
        if world:
            world_data = {
                "id": world.id,
                "name": world.name,
                "meta": world.meta or {}
            }
    elif session and session.flags.get("world", {}).get("id"):
        # Try to get world from session flags
        world_id = session.flags["world"]["id"]
        if isinstance(world_id, int):
            world = await db.get(GameWorld, world_id)
            if world:
                world_data = {
                    "id": world.id,
                    "name": world.name,
                    "meta": world.meta or {}
                }

    if not world_data:
        # Create minimal world data
        world_data = {
            "id": 0,
            "name": "Default World",
            "meta": {}
        }

    # 3. Load NPC data
    npc = await db.get(GameNPC, req.npc_id)
    if not npc:
        raise HTTPException(status_code=404, detail="NPC not found")

    npc_data = {
        "id": npc.id,
        "name": npc.name,
        "personality": npc.personality or {},
        "home_location_id": npc.home_location_id
    }

    # 4. Load location data if provided
    location_data = None
    if req.location_id:
        location = await db.get(GameLocation, req.location_id)
        if location:
            location_data = {
                "id": location.id,
                "name": location.name,
                "meta": location.meta or {}
            }

    # 5. Load scene/node data if provided
    scene_data = None
    if req.scene_id:
        scene = await db.get(GameScene, req.scene_id)
        if scene:
            scene_data = {
                "scene_id": scene.id,
                "node_id": req.node_id,
                "node_meta": {},
                "speaker_role": None
            }

            if req.node_id:
                node = await db.get(GameSceneNode, req.node_id)
                if node:
                    scene_data["node_meta"] = node.meta or {}
                    scene_data["speaker_role"] = node.meta.get("speakerRole") if node.meta else None

    # 6. Prepare session data
    session_data = {
        "id": session.id if session else 0,
        "world_time": session.world_time if session else 0.0,
        "flags": session.flags if session else {},
        "relationships": session.relationships if session else {}
    }

    # Build context using the engine
    context = engine.build_context(
        world_id=world_data["id"],
        session_id=session_data["id"],
        npc_id=req.npc_id,
        world_data=world_data,
        session_data=session_data,
        npc_data=npc_data,
        location_data=location_data,
        scene_data=scene_data,
        player_input=req.player_input
    )

    # Generate the dialogue request
    result = engine.build_dialogue_request(
        context=context,
        program_id=req.program_id
    )

    # Add computed relationship info to metadata
    result["meta"]["relationship_state"] = {
        "affinity": context.relationship.affinity,
        "trust": context.relationship.trust,
        "chemistry": context.relationship.chemistry,
        "tension": context.relationship.tension,
        "relationship_tier": context.relationship.relationship_tier,
        "intimacy_level": context.relationship.intimacy_level
    }

    return DialogueNextLineResponse(
        llm_prompt=result["llm_prompt"],
        visual_prompt=result.get("visual_prompt"),
        meta=result.get("metadata", {})
    )


@router.post("/next-line/debug", response_model=DialogueDebugResponse)
async def generate_next_line_debug(
    req: DialogueNextLineRequest,
    db: DatabaseSession,
    user: CurrentUser,
    engine: NarrativeEngine = Depends(get_narrative_engine)
) -> DialogueDebugResponse:
    """
    Generate the next dialogue line prompt with full debug information.

    This is the same as /next-line but includes the full context and
    stage-by-stage outputs for debugging prompt programs.
    """
    # Load required data (same as generate_next_line)
    session = None
    if req.session_id:
        session = await db.get(GameSession, req.session_id)
        if not session or session.user_id != user.id:
            raise HTTPException(status_code=404, detail="Session not found")
    elif req.scene_id:
        session = GameSession(
            id=0,
            user_id=user.id,
            scene_id=req.scene_id,
            current_node_id=req.node_id or 0,
            flags={},
            relationships={},
            world_time=0.0
        )
    else:
        raise HTTPException(
            status_code=400,
            detail="Either session_id or scene_id must be provided"
        )

    # Load world data
    world = None
    world_data = {}
    if req.world_id:
        world = await db.get(GameWorld, req.world_id)
        if world:
            world_data = {
                "id": world.id,
                "name": world.name,
                "meta": world.meta or {}
            }
    elif session and session.flags.get("world", {}).get("id"):
        world_id = session.flags["world"]["id"]
        if isinstance(world_id, int):
            world = await db.get(GameWorld, world_id)
            if world:
                world_data = {
                    "id": world.id,
                    "name": world.name,
                    "meta": world.meta or {}
                }

    if not world_data:
        world_data = {
            "id": 0,
            "name": "Default World",
            "meta": {}
        }

    # Load NPC data
    npc = await db.get(GameNPC, req.npc_id)
    if not npc:
        raise HTTPException(status_code=404, detail="NPC not found")

    npc_data = {
        "id": npc.id,
        "name": npc.name,
        "personality": npc.personality or {},
        "home_location_id": npc.home_location_id
    }

    # Load location data
    location_data = None
    if req.location_id:
        location = await db.get(GameLocation, req.location_id)
        if location:
            location_data = {
                "id": location.id,
                "name": location.name,
                "meta": location.meta or {}
            }

    # Load scene/node data
    scene_data = None
    if req.scene_id:
        scene = await db.get(GameScene, req.scene_id)
        if scene:
            scene_data = {
                "scene_id": scene.id,
                "node_id": req.node_id,
                "node_meta": {},
                "speaker_role": None
            }

            if req.node_id:
                node = await db.get(GameSceneNode, req.node_id)
                if node:
                    scene_data["node_meta"] = node.meta or {}
                    scene_data["speaker_role"] = node.meta.get("speakerRole") if node.meta else None

    # Prepare session data
    session_data = {
        "id": session.id if session else 0,
        "world_time": session.world_time if session else 0.0,
        "flags": session.flags if session else {},
        "relationships": session.relationships if session else {}
    }

    # Build context
    context = engine.build_context(
        world_id=world_data["id"],
        session_id=session_data["id"],
        npc_id=req.npc_id,
        world_data=world_data,
        session_data=session_data,
        npc_data=npc_data,
        location_data=location_data,
        scene_data=scene_data,
        player_input=req.player_input
    )

    # Generate the dialogue request
    result = engine.build_dialogue_request(
        context=context,
        program_id=req.program_id
    )

    # Get debug info
    debug_info = engine.get_debug_info()

    # Add computed relationship info
    result["meta"]["relationship_state"] = {
        "affinity": context.relationship.affinity,
        "trust": context.relationship.trust,
        "chemistry": context.relationship.chemistry,
        "tension": context.relationship.tension,
        "relationship_tier": context.relationship.relationship_tier,
        "intimacy_level": context.relationship.intimacy_level
    }

    # Convert context to dict for response
    context_dict = {
        "npc": context.npc.dict(),
        "world": context.world.dict(),
        "session": context.session.dict(),
        "relationship": context.relationship.dict(),
        "location": context.location.dict() if context.location else None,
        "scene": context.scene.dict() if context.scene else None,
        "player_input": context.player_input
    }

    return DialogueDebugResponse(
        context=context_dict,
        llm_prompt=result["llm_prompt"],
        visual_prompt=result.get("visual_prompt"),
        meta=result.get("metadata", {}),
        debug=debug_info
    )


class ActionSelectionRequest(BaseModel):
    """Request for selecting action blocks."""
    location_tag: Optional[str] = None
    pose: Optional[str] = None
    intimacy_level: Optional[str] = None
    mood: Optional[str] = None
    branch_intent: Optional[str] = None
    previous_block_id: Optional[str] = None
    lead_npc_id: int
    partner_npc_id: Optional[int] = None
    required_tags: List[str] = []
    exclude_tags: List[str] = []
    max_duration: Optional[float] = None

    # Optional context from narrative engine
    session_id: Optional[int] = None
    world_id: Optional[int] = None


class ActionSelectionResponse(BaseModel):
    """Response containing selected action blocks."""
    blocks: List[Dict[str, Any]]
    total_duration: float
    resolved_images: List[Dict[str, Any]]
    compatibility_score: float
    fallback_reason: Optional[str] = None
    prompts: List[str]
    segments: List[Dict[str, Any]]


@router.post("/actions/select", response_model=ActionSelectionResponse)
async def select_action_blocks(
    req: ActionSelectionRequest,
    db: DatabaseSession,
    user: CurrentUser,
    action_engine: ActionEngine = Depends(get_action_engine),
    narrative_engine: NarrativeEngine = Depends(get_narrative_engine)
) -> ActionSelectionResponse:
    """
    Select appropriate action blocks for visual generation.

    Layering:
    1. This API layer handles session/world context gathering
    2. It distills that into a clean ActionSelectionContext
    3. The pure selector works with the distilled context only

    This keeps the selector module pure and testable without DB dependencies.
    """
    # Layer 1: Gather context from session/world if provided
    computed_intimacy_level = req.intimacy_level
    computed_mood = req.mood
    branch_intent_str = req.branch_intent

    if req.session_id and not req.intimacy_level:
        session = await db.get(GameSession, req.session_id)
        if session and session.user_id == user.id:
            # Get world for intimacy schema
            world = None
            if req.world_id:
                world = await db.get(GameWorld, req.world_id)

            if world:
                # Build minimal context for intimacy computation
                from pixsim7_backend.domain.narrative.relationships import (
                    compute_intimacy_level,
                    extract_relationship_values
                )

                affinity, trust, chemistry, tension, _ = extract_relationship_values(
                    session.relationships,
                    req.lead_npc_id
                )

                intimacy_level = compute_intimacy_level(
                    {
                        "affinity": affinity,
                        "trust": trust,
                        "chemistry": chemistry,
                        "tension": tension
                    },
                    world.meta.get("intimacy_schema") if world.meta else None
                )

                if intimacy_level:
                    computed_intimacy_level = intimacy_level

            # Also check for narrative intents to map to branch intent
            if not branch_intent_str and session.flags.get("last_narrative_intents"):
                from pixsim7_backend.domain.narrative.intent_mapping import (
                    map_narrative_to_branch_intent
                )
                intents = session.flags.get("last_narrative_intents", [])
                mapped_branch = map_narrative_to_branch_intent(intents)
                if mapped_branch:
                    branch_intent_str = mapped_branch.value

    # Layer 2: Build clean action selection context
    context = ActionSelectionContext(
        locationTag=req.location_tag,
        pose=req.pose,
        intimacy_level=computed_intimacy_level,
        mood=computed_mood,
        branchIntent=BranchIntent(branch_intent_str) if branch_intent_str else None,
        previousBlockId=req.previous_block_id,
        leadNpcId=req.lead_npc_id,
        partnerNpcId=req.partner_npc_id,
        requiredTags=req.required_tags,
        excludeTags=req.exclude_tags,
        maxDuration=req.max_duration
    )

    # Select action blocks
    result = await action_engine.select_actions(context, db)

    # Convert to response format
    blocks_data = [block.dict() for block in result.blocks]

    return ActionSelectionResponse(
        blocks=blocks_data,
        total_duration=result.totalDuration,
        resolved_images=result.resolvedImages,
        compatibility_score=result.compatibilityScore,
        fallback_reason=result.fallbackReason,
        prompts=result.prompts,
        segments=result.segments
    )


@router.get("/actions/blocks")
async def list_action_blocks(
    location: Optional[str] = None,
    intimacy_level: Optional[str] = None,
    mood: Optional[str] = None,
    user: CurrentUser = None,
    action_engine: ActionEngine = Depends(get_action_engine)
) -> Dict[str, Any]:
    """
    List available action blocks, optionally filtered by criteria.

    This endpoint is useful for debugging and for UI tools that need
    to show available actions.
    """
    blocks = []

    for block_id, block in action_engine.blocks.items():
        # Apply filters
        if location and block.tags.location != location:
            continue
        if intimacy_level and block.tags.intimacy_level != intimacy_level:
            continue
        if mood and block.tags.mood != mood:
            continue

        blocks.append({
            "id": block.id,
            "kind": block.kind,
            "tags": block.tags.dict(),
            "duration": block.durationSec,
            "description": block.description
        })

    return {
        "blocks": blocks,
        "total": len(blocks),
        "filters": {
            "location": location,
            "intimacy_level": intimacy_level,
            "mood": mood
        }
    }


@router.get("/actions/poses")
async def list_pose_taxonomy(
    category: Optional[str] = None,
    user: CurrentUser = None,
    action_engine: ActionEngine = Depends(get_action_engine)
) -> Dict[str, Any]:
    """
    Get the pose taxonomy used by the action engine.

    This is useful for UI tools and for understanding pose compatibility.
    """
    taxonomy = action_engine.pose_taxonomy

    if category:
        poses = taxonomy.get_poses_by_category(category)
        poses_data = [pose.dict() for pose in poses]
    else:
        poses_data = [pose.dict() for pose in taxonomy.poses.values()]

    return {
        "poses": poses_data,
        "categories": list(taxonomy.category_index.keys()),
        "total": len(poses_data)
    }