"""
Game Dialogue Plugin

Provides narrative and action block generation for NPC dialogues.
Converted from api/v1/game_dialogue.py to plugin format.
"""

from typing import Dict, Any, List, Optional, Literal

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select

from pixsim7.backend.main.api.dependencies import (
    CurrentUser,
    DatabaseSession,
    get_narrative_engine,
    get_action_engine,
    get_block_generator,
    NarrativeEng,
    ActionEng,
    BlockGenerator
)
from pixsim7.backend.main.domain.game.core.models import (
    GameSession, GameWorld, GameNPC, GameLocation,
    GameScene, GameSceneNode
)
from pixsim7.backend.main.domain.narrative import NarrativeEngine
from pixsim7.backend.main.domain.narrative.action_blocks import (
    ActionEngine,
    ActionSelectionContext,
    BranchIntent
)
from pixsim7.backend.main.domain.narrative.action_blocks.generator import (
    DynamicBlockGenerator,
    GenerationRequest,
    GenerationResult,
    PreviousSegmentSnapshot
)
from pixsim7.backend.main.domain.narrative.action_blocks import ContentRating
from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest


# ===== PLUGIN MANIFEST =====

manifest = PluginManifest(
    id="game_dialogue",
    name="Game Dialogue & Narrative",
    version="1.0.0",
    description="Provides narrative engine and action block generation for NPC dialogues and interactions",
    author="PixSim Team",
    kind="feature",
    prefix="/api/v1",
    tags=["game_dialogue"],
    dependencies=[],  # Could depend on game-sessions, game-npcs, but they're optional
    requires_db=True,
    requires_redis=False,
    enabled=True,
)


# ===== API ROUTER =====

router = APIRouter(prefix="/game/dialogue", tags=["game-dialogue"])


# ===== HELPER FUNCTIONS =====

def _convert_previous_segment(data: Optional['PreviousSegmentInput']) -> Optional[PreviousSegmentSnapshot]:
    """Convert API input into a dataclass snapshot."""
    if not data:
        return None

    return PreviousSegmentSnapshot(
        block_id=data.block_id,
        segment_id=data.segment_id,
        asset_id=data.asset_id,
        asset_url=data.asset_url,
        pose=data.pose,
        intensity=data.intensity,
        tags=data.tags or None,
        mood=data.mood,
        branch_intent=data.branch_intent,
        summary=data.summary
    )


def _build_generation_request(req: 'GenerateActionBlockRequest') -> GenerationRequest:
    """Create a GenerationRequest from API input."""
    try:
        content_rating = ContentRating(req.content_rating)
    except ValueError:
        content_rating = ContentRating.SFW

    return GenerationRequest(
        concept_type=req.concept_type,
        parameters=req.parameters,
        content_rating=content_rating,
        duration=req.duration or 6.0,
        camera_settings=req.camera_settings,
        consistency_settings=req.consistency_settings,
        intensity_settings=req.intensity_settings,
        previous_segment=_convert_previous_segment(req.previous_segment)
    )


async def _persist_generated_block(
    db: DatabaseSession,
    action_engine: ActionEngine,
    block_data: Dict[str, Any],
    *,
    source: str,
    user_id: int,
    previous_segment: Optional['PreviousSegmentInput'] = None,
    selection: Optional['ActionSelectionRequest'] = None
) -> None:
    """Store the generated block in the DB cache and register it in memory."""
    meta: Dict[str, Any] = {
        "requested_by": user_id,
        "source": source
    }
    if selection:
        meta["selection"] = selection.dict()
    if previous_segment:
        meta["previous_segment"] = previous_segment.dict()

    await action_engine.generated_store.upsert_block(
        db,
        block_data,
        source=source,
        previous_block_id=previous_segment.block_id if previous_segment else None,
        reference_asset_id=previous_segment.asset_id if previous_segment else None,
        meta=meta
    )
    action_engine.register_block(block_data)


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


class PreviousSegmentInput(BaseModel):
    """Snapshot of the previous media segment for continuity-aware generation."""
    block_id: Optional[str] = None
    segment_id: Optional[str] = None
    asset_id: Optional[int] = None
    asset_url: Optional[str] = None
    pose: Optional[str] = None
    intensity: Optional[int] = None
    tags: List[str] = Field(default_factory=list)
    mood: Optional[str] = None
    branch_intent: Optional[str] = None
    summary: Optional[str] = None


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
        "relationships": session.stats.get("relationships", {}) if session else {}
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
        "relationships": session.stats.get("relationships", {}) if session else {}
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
    required_tags: List[str] = Field(default_factory=list)
    exclude_tags: List[str] = Field(default_factory=list)
    max_duration: Optional[float] = None

    # Optional context from narrative engine
    session_id: Optional[int] = None
    world_id: Optional[int] = None


class ActionSelectionResponse(BaseModel):
    """Response containing selected action blocks."""
    blocks: List[Dict[str, Any]]
    total_duration: float
    resolved_images: List[Dict[str, Any]]
    composition_assets: List[Dict[str, Any]]
    compatibility_score: float
    fallback_reason: Optional[str] = None
    prompts: List[str]
    segments: List[Dict[str, Any]]


class GenerateActionBlockRequest(BaseModel):
    """Request for generating a new action block dynamically."""
    concept_type: str  # e.g., "creature_interaction", "position_maintenance"
    parameters: Dict[str, Any]
    content_rating: Optional[str] = "sfw"
    duration: Optional[float] = 6.0
    camera_settings: Optional[Dict[str, Any]] = None
    consistency_settings: Optional[Dict[str, Any]] = None
    intensity_settings: Optional[Dict[str, Any]] = None
    previous_segment: Optional[PreviousSegmentInput] = None


class GenerateActionBlockResponse(BaseModel):
    """Response containing the generated action block."""
    success: bool
    action_block: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    generation_time: float
    template_used: Optional[str] = None


class ActionNextRequest(BaseModel):
    """Combined request that prefers library selection but can fall back to generation."""
    selection: ActionSelectionRequest
    generation: Optional[GenerateActionBlockRequest] = None
    compatibility_threshold: float = 0.8
    prefer_generation: bool = False


class ActionNextResponse(BaseModel):
    """Response describing whether library or generation was used."""
    mode: Literal["library", "generation"]
    selection: Optional[ActionSelectionResponse] = None
    generated_block: Optional[Dict[str, Any]] = None
    generation_info: Optional[Dict[str, Any]] = None
    generation_error: Optional[str] = None


async def _run_action_selection(
    req: ActionSelectionRequest,
    db: DatabaseSession,
    user: CurrentUser,
    action_engine: ActionEngine,
    narrative_engine: NarrativeEngine
) -> ActionSelectionResponse:
    """Execute the selection flow and return a response."""
    computed_intimacy_level = req.intimacy_level
    computed_mood = req.mood
    branch_intent_str = req.branch_intent

    if req.session_id and not req.intimacy_level:
        session = await db.get(GameSession, req.session_id)
        if session and session.user_id == user.id:
            world = None
            if req.world_id:
                world = await db.get(GameWorld, req.world_id)

            if world:
                from pixsim7.backend.main.domain.game.stats import StatEngine
                from pixsim7.backend.main.domain.game.stats.migration import (
                    migrate_world_meta_to_stats_config,
                    needs_migration as needs_world_migration,
                    get_default_relationship_definition,
                )

                # Get relationship data directly from stats
                relationships = session.stats.get("relationships", {})
                npc_key = f"npc:{req.lead_npc_id}"
                rel_data = relationships.get(npc_key, {})

                relationship_values = {
                    "affinity": rel_data.get("affinity", 0),
                    "trust": rel_data.get("trust", 0),
                    "chemistry": rel_data.get("chemistry", 0),
                    "tension": rel_data.get("tension", 0),
                }

                # Get or migrate stats config
                world_meta = world.meta or {}
                if needs_world_migration(world_meta):
                    stats_config = migrate_world_meta_to_stats_config(world_meta)
                elif 'stats_config' in world_meta:
                    from pixsim7.backend.main.domain.game.stats import WorldStatsConfig
                    stats_config = WorldStatsConfig.model_validate(world_meta['stats_config'])
                else:
                    from pixsim7.backend.main.domain.game.stats import WorldStatsConfig
                    stats_config = WorldStatsConfig(
                        version=1,
                        definitions={"relationships": get_default_relationship_definition()}
                    )

                # Get relationship definition
                relationship_definition = stats_config.definitions.get("relationships")
                if not relationship_definition:
                    relationship_definition = get_default_relationship_definition()

                # Compute intimacy level using StatEngine
                intimacy_level = StatEngine.compute_level(
                    relationship_values,
                    relationship_definition.levels
                )

                if intimacy_level:
                    computed_intimacy_level = intimacy_level

            if not branch_intent_str and session.flags.get("last_narrative_intents"):
                from pixsim7.backend.main.domain.narrative.intent_mapping import (
                    map_narrative_to_branch_intent
                )
                intents = session.flags.get("last_narrative_intents", [])
                mapped_branch = map_narrative_to_branch_intent(intents)
                if mapped_branch:
                    branch_intent_str = mapped_branch.value

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

    result = await action_engine.select_actions(context, db)
    blocks_data = [block.dict() for block in result.blocks]

    return ActionSelectionResponse(
        blocks=blocks_data,
        total_duration=result.totalDuration,
        resolved_images=result.resolvedImages,
        composition_assets=result.compositionAssets,
        compatibility_score=result.compatibilityScore,
        fallback_reason=result.fallbackReason,
        prompts=result.prompts,
        segments=result.segments
    )


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
    return await _run_action_selection(req, db, user, action_engine, narrative_engine)


@router.post("/actions/next", response_model=ActionNextResponse)
async def select_or_generate_action(
    req: ActionNextRequest,
    db: DatabaseSession,
    user: CurrentUser,
    action_engine: ActionEngine = Depends(get_action_engine),
    narrative_engine: NarrativeEngine = Depends(get_narrative_engine),
    generator: DynamicBlockGenerator = Depends(get_block_generator)
) -> ActionNextResponse:
    """
    Try to use library blocks first, falling back to dynamic generation when needed.
    """
    selection_result = await _run_action_selection(
        req.selection,
        db,
        user,
        action_engine,
        narrative_engine
    )

    should_generate = (
        req.prefer_generation
        or not selection_result.blocks
        or selection_result.compatibility_score < req.compatibility_threshold
    )

    if not should_generate or not req.generation:
        return ActionNextResponse(
            mode="library",
            selection=selection_result
        )

    gen_request = _build_generation_request(req.generation)
    gen_result = generator.generate_block(gen_request)

    if not gen_result.success or not gen_result.action_block:
        return ActionNextResponse(
            mode="library",
            selection=selection_result,
            generation_error=gen_result.error_message or "generation_failed"
        )

    await _persist_generated_block(
        db,
        action_engine,
        gen_result.action_block,
        source="api:actions/next",
        user_id=user.id,
        previous_segment=req.generation.previous_segment if req.generation else None,
        selection=req.selection
    )

    generation_info = {
        "generation_time": gen_result.generation_time,
        "template_used": gen_result.template_used
    }

    return ActionNextResponse(
        mode="generation",
        selection=selection_result,
        generated_block=gen_result.action_block,
        generation_info=generation_info
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


# ============================================================================
# DYNAMIC GENERATION ENDPOINTS
# ============================================================================


class GenerateCreatureInteractionRequest(BaseModel):
    """Specialized request for creature interactions."""
    creature_type: str  # werewolf, vampire, tentacle, etc.
    character_name: Optional[str] = "She"
    position: Optional[str] = "standing"
    intensity: int = 5
    relative_position: Optional[str] = "behind them"
    character_reaction: Optional[str] = "responds"
    camera_movement: Optional[str] = "begins slow rotation"
    duration: Optional[float] = 8.0
    previous_segment: Optional[PreviousSegmentInput] = None


class TestGenerationRequest(BaseModel):
    """Request to test generation quality."""
    original_prompt: str
    test_type: str = "werewolf_recreation"  # Type of test to run


class TestGenerationResponse(BaseModel):
    """Response with generation test results."""
    similarity_score: float
    generated_prompt: str
    original_prompt: str
    key_phrases_matched: int
    total_key_phrases: int
    test_passed: bool


@router.post("/actions/generate", response_model=GenerateActionBlockResponse)
async def generate_action_block(
    req: GenerateActionBlockRequest,
    db: DatabaseSession,
    user: CurrentUser,
    generator: DynamicBlockGenerator = Depends(get_block_generator),
    action_engine: ActionEngine = Depends(get_action_engine)
) -> GenerateActionBlockResponse:
    """
    Generate a new action block dynamically using templates and concepts.

    This endpoint allows creation of novel action blocks without pre-defining
    them in JSON files. It uses the concept library and template system to
    generate appropriate prompts.
    """
    gen_request = _build_generation_request(req)

    # Generate the block
    result = generator.generate_block(gen_request)

    if result.success and result.action_block:
        await _persist_generated_block(
            db,
            action_engine,
            result.action_block,
            source="api:actions/generate",
            user_id=user.id,
            previous_segment=req.previous_segment
        )

    return GenerateActionBlockResponse(
        success=result.success,
        action_block=result.action_block,
        error_message=result.error_message,
        generation_time=result.generation_time,
        template_used=result.template_used
    )


@router.post("/actions/generate/creature", response_model=GenerateActionBlockResponse)
async def generate_creature_interaction(
    req: GenerateCreatureInteractionRequest,
    db: DatabaseSession,
    user: CurrentUser,
    generator: DynamicBlockGenerator = Depends(get_block_generator),
    action_engine: ActionEngine = Depends(get_action_engine)
) -> GenerateActionBlockResponse:
    """
    Generate a creature interaction action block.

    This is a specialized endpoint for generating creature-based interactions
    with simplified parameters.
    """
    from pixsim7.backend.main.domain.narrative.action_blocks.concepts import CreatureType

    # Parse creature type
    try:
        creature_type = CreatureType(req.creature_type)
    except ValueError:
        return GenerateActionBlockResponse(
            success=False,
            error_message=f"Unknown creature type: {req.creature_type}",
            generation_time=0.0
        )

    previous_snapshot = _convert_previous_segment(req.previous_segment)

    # Generate using specialized method
    result = generator.generate_creature_interaction(
        creature_type=creature_type,
        character_name=req.character_name,
        position=req.position,
        intensity=req.intensity,
        relative_position=req.relative_position,
        character_reaction=req.character_reaction,
        camera_movement=req.camera_movement,
        duration=req.duration,
        previous_segment=previous_snapshot
    )

    if result.success and result.action_block:
        await _persist_generated_block(
            db,
            action_engine,
            result.action_block,
            source="api:actions/generate/creature",
            user_id=user.id,
            previous_segment=req.previous_segment
        )

    return GenerateActionBlockResponse(
        success=result.success,
        action_block=result.action_block,
        error_message=result.error_message,
        generation_time=result.generation_time,
        template_used=result.template_used
    )


@router.post("/actions/test", response_model=TestGenerationResponse)
async def test_generation_quality(
    req: TestGenerationRequest,
    user: CurrentUser,
    generator: DynamicBlockGenerator = Depends(get_block_generator)
) -> TestGenerationResponse:
    """
    Test the quality of action block generation.

    This endpoint tests whether the generation system can accurately recreate
    complex prompts from templates, helping to validate the template system.
    """
    if req.test_type == "werewolf_recreation":
        # Import test function
        from pixsim7.backend.main.domain.narrative.action_blocks.generation_templates import (
            TemplateGenerator,
            test_prompt_recreation
        )

        # Generate the werewolf block
        generated_block = TemplateGenerator.generate_werewolf_recreation()
        generated_prompt = generated_block["prompt"]

        # Calculate similarity
        similarity = test_prompt_recreation(req.original_prompt)

        # Check key phrases
        key_phrases = [
            "maintains her position throughout",
            "camera begins slow rotation",
            "gripping, releasing, gripping harder",
            "appearance and lighting remain consistent"
        ]

        phrase_matches = sum(
            1 for phrase in key_phrases
            if phrase.lower() in generated_prompt.lower()
        )

        return TestGenerationResponse(
            similarity_score=similarity,
            generated_prompt=generated_prompt,
            original_prompt=req.original_prompt,
            key_phrases_matched=phrase_matches,
            total_key_phrases=len(key_phrases),
            test_passed=similarity > 0.7  # 70% threshold
        )
    else:
        return TestGenerationResponse(
            similarity_score=0.0,
            generated_prompt="",
            original_prompt=req.original_prompt,
            key_phrases_matched=0,
            total_key_phrases=0,
            test_passed=False
        )


@router.get("/actions/templates")
async def list_generation_templates(
    template_type: Optional[str] = None,
    user: CurrentUser = None
) -> Dict[str, Any]:
    """
    List available generation templates.

    This endpoint returns all available templates that can be used for
    dynamic generation, useful for UI tools and debugging.
    """
    from pixsim7.backend.main.domain.narrative.action_blocks.generation_templates import (
        template_library,
        TemplateType
    )

    templates = []

    if template_type:
        try:
            tt = TemplateType(template_type)
            template_list = template_library.get_templates_by_type(tt)
        except ValueError:
            template_list = []
    else:
        template_list = list(template_library.templates.values())

    for template in template_list:
        templates.append({
            "id": template.id,
            "type": template.type.value,
            "name": template.name,
            "required_params": template.required_params,
            "optional_params": template.optional_params,
            "content_rating_range": template.content_rating_range,
            "supports_camera": template.camera_template is not None,
            "has_consistency": template.consistency_defaults is not None
        })

    return {
        "templates": templates,
        "total": len(templates),
        "filter": {"type": template_type} if template_type else None
    }


@router.get("/actions/concepts")
async def list_available_concepts(
    concept_type: Optional[str] = None,
    user: CurrentUser = None
) -> Dict[str, Any]:
    """
    List available concepts from the concept library.

    This shows creatures, interaction patterns, positions, and camera patterns
    that can be used for generation.
    """
    from pixsim7.backend.main.domain.narrative.action_blocks.concepts import (
        concept_library,
        CreatureType
    )

    response = {}

    if not concept_type or concept_type == "creatures":
        creatures = []
        for creature_type in CreatureType:
            creature = concept_library.get_creature(creature_type)
            if creature:
                creatures.append({
                    "type": creature.type.value,
                    "movement_types": [m.value for m in creature.movement_types],
                    "special_features": creature.special_features,
                    "size_category": creature.size_category,
                    "unique_actions": creature.unique_actions
                })
        response["creatures"] = creatures

    if not concept_type or concept_type == "interactions":
        interactions = []
        for pattern in concept_library.interaction_patterns:
            interactions.append({
                "name": pattern.name,
                "primary_action": pattern.primary_action,
                "continuous_actions": pattern.continuous_actions,
                "intensity_range": pattern.intensity_range
            })
        response["interaction_patterns"] = interactions

    if not concept_type or concept_type == "positions":
        response["positions"] = concept_library.position_library

    if not concept_type or concept_type == "camera":
        response["camera_patterns"] = concept_library.camera_patterns

    return response


# ===== LIFECYCLE HOOKS =====

def on_load(app):
    """
    Called when plugin is loaded (before app starts).

    Register semantic aliases owned by this plugin.

    NOTE: These aliases are also in operation_mapping._SEMANTIC_ALIASES
    for startup validation (runs before plugins load). The registration
    here serves as ownership assertion and will fail if mappings drift.
    """
    from pixsim_logging import configure_logging
    from pixsim7.backend.main.domain.enums import OperationType
    from pixsim7.backend.main.shared.operation_mapping import register_generation_alias

    # Register semantic aliases used by dialogue/narrative systems.
    # These map high-level concepts onto canonical OperationType values.
    register_generation_alias("npc_response", OperationType.IMAGE_TO_VIDEO, owner="game_dialogue")
    register_generation_alias("dialogue", OperationType.TEXT_TO_VIDEO, owner="game_dialogue")
    register_generation_alias("environment", OperationType.TEXT_TO_VIDEO, owner="game_dialogue")
    register_generation_alias("variation", OperationType.TEXT_TO_VIDEO, owner="game_dialogue")

    logger = configure_logging("plugin.game-dialogue")
    logger.info("Game Dialogue plugin loaded")


async def on_enable():
    """Called when plugin is enabled (after app starts)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.game-dialogue")

    # Initialize singletons
    get_narrative_engine()
    get_action_engine()
    get_block_generator()

    logger.info("Game Dialogue plugin enabled - narrative engines initialized")


async def on_disable():
    """Called when plugin is disabled (before app shuts down)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.game-dialogue")
    logger.info("Game Dialogue plugin disabled")
