"""
Game dialogue and narrative API endpoints.
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional, Literal

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select

from pixsim7_backend.api.dependencies import CurrentUser, DatabaseSession
from pixsim7_backend.domain.game.models import (
    GameSession, GameWorld, GameNPC, GameLocation,
    GameScene, GameSceneNode
)
from pixsim7_backend.domain.narrative import NarrativeEngine
from pixsim7_backend.services.llm import LLMService, LLMRequest, LLMCacheStats, CacheInvalidationRequest
from pixsim7_backend.infrastructure.redis.client import get_redis
from pixsim7_backend.services.npc import MemoryService, EmotionalStateService
from pixsim7_backend.domain.npc_memory import MemoryImportance, MemoryType
from pixsim7_backend.domain.narrative.action_blocks import (
    ActionEngine,
    ActionSelectionContext,
    BranchIntent
)
from pixsim7_backend.domain.narrative.action_blocks.generator import (
    DynamicBlockGenerator,
    GenerationRequest,
    GenerationResult,
    PreviousSegmentSnapshot
)
from pixsim7_backend.domain.narrative.action_blocks.types_v2 import ContentRating


router = APIRouter()

# Initialize the engines (singletons)
_narrative_engine = None
_action_engine = None
_block_generator = None
_llm_service = None


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


def get_block_generator() -> DynamicBlockGenerator:
    """Get or create the block generator singleton."""
    global _block_generator
    if _block_generator is None:
        _block_generator = DynamicBlockGenerator(use_claude_api=False)
    return _block_generator


async def get_llm_service() -> LLMService:
    """Get or create the LLM service singleton."""
    global _llm_service
    if _llm_service is None:
        redis_client = await get_redis()
        _llm_service = LLMService(redis_client, provider="anthropic")
    return _llm_service


def _convert_previous_segment(data: Optional[PreviousSegmentInput]) -> Optional[PreviousSegmentSnapshot]:
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


def _build_generation_request(req: GenerateActionBlockRequest) -> GenerationRequest:
    """Create a GenerationRequest from API input."""
    try:
        content_rating = ContentRating(req.content_rating)
    except ValueError:
        content_rating = ContentRating.GENERAL

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
    previous_segment: Optional[PreviousSegmentInput] = None,
    selection: Optional[ActionSelectionRequest] = None
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


class DialogueExecuteResponse(BaseModel):
    """Response containing executed dialogue text with caching info."""
    text: str = Field(..., description="Generated dialogue text")
    llm_prompt: str = Field(..., description="The prompt used")
    visual_prompt: Optional[str] = Field(None, description="Visual generation prompt if available")

    # Cache info
    cached: bool = Field(..., description="Whether this was a cached response")
    cache_key: Optional[str] = Field(None, description="Cache key used")

    # LLM info
    provider: str = Field(..., description="LLM provider used")
    model: str = Field(..., description="Model used")

    # Usage stats
    usage: Optional[Dict[str, int]] = Field(None, description="Token usage")
    estimated_cost: Optional[float] = Field(None, description="Estimated cost in USD")
    generation_time_ms: Optional[float] = Field(None, description="Generation time in milliseconds")

    # Context metadata
    meta: Dict[str, Any] = Field(default_factory=dict, description="Narrative context metadata")


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


@router.post("/next-line/execute", response_model=DialogueExecuteResponse)
async def execute_dialogue_generation(
    req: DialogueNextLineRequest,
    db: DatabaseSession,
    user: CurrentUser,
    engine: NarrativeEngine = Depends(get_narrative_engine),
    llm_service: LLMService = Depends(get_llm_service)
) -> DialogueExecuteResponse:
    """
    Generate and execute NPC dialogue using the LLM service.

    This endpoint:
    1. Builds the dialogue prompt using the narrative engine
    2. Executes the LLM call with smart caching
    3. Returns the generated text with cache/usage statistics

    Caching behavior:
    - Uses smart cache keys based on NPC personality + relationship state
    - Default freshness threshold: 0.0 (always use cache if available)
    - Cache TTL: 1 hour by default
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

    # Load location data if provided
    location_data = None
    if req.location_id:
        location = await db.get(GameLocation, req.location_id)
        if location:
            location_data = {
                "id": location.id,
                "name": location.name,
                "meta": location.meta or {}
            }

    # Load scene/node data if provided
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

    # Initialize memory and emotional state services
    memory_service = MemoryService(db)
    emotion_service = EmotionalStateService(db)

    # Recall relevant memories
    recent_memories = await memory_service.get_recent_conversation(
        npc_id=req.npc_id,
        user_id=user.id,
        session_id=req.session_id,
        limit=5
    )

    # Get current emotional state
    current_emotions = await emotion_service.get_current_emotions(
        npc_id=req.npc_id,
        session_id=req.session_id
    )

    # Get emotional modifiers for dialogue
    emotion_modifiers = emotion_service.get_emotion_modifiers(current_emotions)

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

    # Enhance prompt with memory and emotional context
    enhanced_prompt = result["llm_prompt"]

    # Add memory context
    if recent_memories:
        memory_context = "\n\nRecent conversation history:"
        for mem in recent_memories[:3]:  # Last 3 exchanges
            if mem.player_said:
                memory_context += f"\nPlayer said: {mem.player_said}"
            if mem.npc_said:
                memory_context += f"\nYou responded: {mem.npc_said}"
        enhanced_prompt += memory_context

    # Add emotional context
    if current_emotions:
        emotion_context = f"\n\nCurrent emotional state: You are feeling {emotion_modifiers['primary_emotion']} "
        emotion_context += f"(intensity: {emotion_modifiers['emotion_intensity']:.1%}). "
        emotion_context += f"Your tone should be {emotion_modifiers['tone']}."
        if emotion_modifiers.get('dialogue_adjustments'):
            emotion_context += f" Context: {', '.join(emotion_modifiers['dialogue_adjustments'])}."
        enhanced_prompt += emotion_context

    # System prompt with character context
    system_prompt = f"You are roleplaying as {npc_data['name']}, an NPC in a game. "
    system_prompt += "Respond naturally in character, taking into account your personality, emotional state, and conversation history. "
    system_prompt += "Keep responses concise and conversational (2-3 sentences maximum)."

    # Execute LLM call with caching
    llm_request = LLMRequest(
        prompt=enhanced_prompt,
        system_prompt=system_prompt,
        max_tokens=500,
        temperature=0.8,
        use_cache=True,
        cache_ttl=3600,  # 1 hour
        cache_freshness=0.0,  # Always use cache if available
        metadata={
            "npc_id": req.npc_id,
            "program_id": req.program_id,
            "relationship_tier": context.relationship.relationship_tier,
            "intimacy_level": context.relationship.intimacy_level,
            "has_memories": len(recent_memories) > 0,
            "has_emotions": len(current_emotions) > 0
        }
    )

    # Build cache context for smart key generation
    cache_context = {
        "npc_id": req.npc_id,
        "npc_personality": npc_data["personality"],
        "relationship_state": {
            "affinity": context.relationship.affinity,
            "trust": context.relationship.trust,
            "chemistry": context.relationship.chemistry,
            "tension": context.relationship.tension
        },
        "player_input_hash": hash(req.player_input) if req.player_input else None
    }

    # Generate dialogue
    llm_response = await llm_service.generate(llm_request, context=cache_context)

    # Store this conversation as a memory
    # Determine importance based on context
    importance = MemoryImportance.NORMAL
    if context.relationship.relationship_tier in ["close_friend", "lover"]:
        importance = MemoryImportance.IMPORTANT
    elif req.player_input and len(req.player_input) > 100:  # Long player input = important
        importance = MemoryImportance.IMPORTANT

    # Determine memory type (short-term for now, can be promoted later)
    memory_type = MemoryType.SHORT_TERM
    if importance == MemoryImportance.IMPORTANT:
        memory_type = MemoryType.LONG_TERM

    # Create memory
    await memory_service.create_memory(
        npc_id=req.npc_id,
        user_id=user.id,
        session_id=req.session_id,
        topic="general_conversation",  # Can be enhanced with topic detection
        summary=f"Player: {req.player_input or 'initiated conversation'}. NPC responded.",
        player_said=req.player_input,
        npc_said=llm_response.text,
        importance=importance,
        memory_type=memory_type,
        location_id=req.location_id,
        world_time=session.world_time if session else None,
        npc_emotion=current_emotions[0].emotion if current_emotions else None,
        relationship_tier=context.relationship.relationship_tier,
        tags=["conversation", context.relationship.relationship_tier]
    )

    return DialogueExecuteResponse(
        text=llm_response.text,
        llm_prompt=result["llm_prompt"],
        visual_prompt=result.get("visual_prompt"),
        cached=llm_response.cached,
        cache_key=llm_response.cache_key,
        provider=llm_response.provider,
        model=llm_response.model,
        usage=llm_response.usage,
        estimated_cost=llm_response.estimated_cost,
        generation_time_ms=llm_response.generation_time_ms,
        meta={
            **result.get("metadata", {}),
            "memory_created": True,
            "current_emotion": emotion_modifiers.get('primary_emotion') if current_emotions else None,
            "recent_memories_count": len(recent_memories)
        }
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
    compatibility_score: float
    fallback_reason: Optional[str] = None
    prompts: List[str]
    segments: List[Dict[str, Any]]


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

            if not branch_intent_str and session.flags.get("last_narrative_intents"):
                from pixsim7_backend.domain.narrative.intent_mapping import (
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


class GenerateActionBlockRequest(BaseModel):
    """Request for generating a new action block dynamically."""
    concept_type: str  # e.g., "creature_interaction", "position_maintenance"
    parameters: Dict[str, Any]
    content_rating: Optional[str] = "general"
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
    from pixsim7_backend.domain.narrative.action_blocks.concepts import CreatureType

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
        from pixsim7_backend.domain.narrative.action_blocks.generation_templates import (
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
    from pixsim7_backend.domain.narrative.action_blocks.generation_templates import (
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
    from pixsim7_backend.domain.narrative.action_blocks.concepts import (
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


# ============================================================================
# LLM CACHE MANAGEMENT ENDPOINTS
# ============================================================================


@router.get("/llm/cache/stats", response_model=LLMCacheStats)
async def get_llm_cache_stats(
    user: CurrentUser,
    llm_service: LLMService = Depends(get_llm_service)
) -> LLMCacheStats:
    """
    Get LLM cache statistics.

    Returns cache hit rate, total keys, estimated cost savings, etc.
    Useful for monitoring cache performance and cost optimization.
    """
    return await llm_service.get_cache_stats()


@router.post("/llm/cache/invalidate")
async def invalidate_llm_cache(
    req: CacheInvalidationRequest,
    user: CurrentUser,
    llm_service: LLMService = Depends(get_llm_service)
) -> Dict[str, Any]:
    """
    Invalidate LLM cache entries.

    Supports:
    - Invalidating by pattern (e.g., 'npc:*', '*relationship*')
    - Invalidating specific cache keys
    - Invalidating all LLM cache entries

    Use cases:
    - Clear cache for specific NPC when personality changes
    - Clear cache when relationship reaches milestone
    - Clear all cache during development/testing
    """
    deleted_count = await llm_service.invalidate_cache(
        pattern=req.pattern,
        cache_keys=req.cache_keys,
        invalidate_all=req.invalidate_all
    )

    return {
        "success": True,
        "deleted_count": deleted_count,
        "message": f"Invalidated {deleted_count} cache entries"
    }


@router.post("/llm/cache/clear-stats")
async def clear_llm_cache_stats(
    user: CurrentUser,
    llm_service: LLMService = Depends(get_llm_service)
) -> Dict[str, Any]:
    """
    Clear LLM cache statistics.

    Resets hit/miss counters and cost savings tracking.
    Does NOT delete cached responses - use /invalidate for that.
    """
    await llm_service.clear_cache_stats()

    return {
        "success": True,
        "message": "Cache statistics cleared"
    }


# ============================================================================
# NPC MEMORY & EMOTIONAL STATE MANAGEMENT ENDPOINTS
# ============================================================================


@router.get("/npcs/{npc_id}/memories")
async def get_npc_memories(
    npc_id: int,
    db: DatabaseSession,
    user: CurrentUser,
    topic: Optional[str] = None,
    limit: int = 20,
    session_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Get conversation memories for an NPC

    Args:
        npc_id: NPC ID
        topic: Filter by topic
        limit: Maximum results
        session_id: Filter by session

    Returns:
        List of memories
    """
    memory_service = MemoryService(db)

    memories = await memory_service.recall_memories(
        npc_id=npc_id,
        user_id=user.id,
        topic=topic,
        session_id=session_id,
        limit=limit
    )

    return {
        "memories": [
            {
                "id": m.id,
                "topic": m.topic,
                "summary": m.summary,
                "player_said": m.player_said,
                "npc_said": m.npc_said,
                "importance": m.importance.value,
                "memory_type": m.memory_type.value,
                "strength": m.strength,
                "created_at": m.created_at.isoformat(),
                "tags": m.tags
            }
            for m in memories
        ],
        "total": len(memories)
    }


@router.get("/npcs/{npc_id}/memories/summary")
async def get_npc_memory_summary(
    npc_id: int,
    db: DatabaseSession,
    user: CurrentUser
) -> Dict[str, Any]:
    """
    Get memory summary statistics for an NPC

    Returns count by type and importance
    """
    memory_service = MemoryService(db)
    summary = await memory_service.get_memory_summary(npc_id, user.id)

    return summary


@router.get("/npcs/{npc_id}/emotions")
async def get_npc_emotions(
    npc_id: int,
    db: DatabaseSession,
    user: CurrentUser,
    session_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Get current emotional states for an NPC

    Returns active emotions with intensities
    """
    emotion_service = EmotionalStateService(db)

    emotions = await emotion_service.get_current_emotions(
        npc_id=npc_id,
        session_id=session_id
    )

    modifiers = emotion_service.get_emotion_modifiers(emotions)

    return {
        "current_emotions": [
            {
                "id": e.id,
                "emotion": e.emotion.value,
                "intensity": e.intensity,
                "triggered_by": e.triggered_by,
                "started_at": e.started_at.isoformat(),
                "expires_at": e.expires_at.isoformat() if e.expires_at else None
            }
            for e in emotions
        ],
        "modifiers": modifiers,
        "total_active": len(emotions)
    }


class SetEmotionRequest(BaseModel):
    """Request to set NPC emotion"""
    emotion: str = Field(..., description="Emotion type (happy, sad, angry, etc.)")
    intensity: float = Field(default=0.7, ge=0.0, le=1.0, description="Intensity (0.0-1.0)")
    duration_seconds: Optional[float] = Field(None, description="How long it lasts")
    triggered_by: Optional[str] = Field(None, description="What caused this")
    session_id: Optional[int] = Field(None, description="Session this is part of")


@router.post("/npcs/{npc_id}/emotions")
async def set_npc_emotion(
    npc_id: int,
    req: SetEmotionRequest,
    db: DatabaseSession,
    user: CurrentUser
) -> Dict[str, Any]:
    """
    Set an emotional state for an NPC

    Triggers a new emotion with specified intensity and duration
    """
    from pixsim7_backend.domain.npc_memory import EmotionType

    # Validate emotion type
    try:
        emotion = EmotionType(req.emotion)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid emotion type. Valid types: {[e.value for e in EmotionType]}"
        )

    emotion_service = EmotionalStateService(db)

    state = await emotion_service.set_emotion(
        npc_id=npc_id,
        emotion=emotion,
        intensity=req.intensity,
        duration_seconds=req.duration_seconds,
        triggered_by=req.triggered_by or f"manual_trigger_by_user_{user.id}",
        session_id=req.session_id
    )

    return {
        "success": True,
        "emotion_id": state.id,
        "emotion": state.emotion.value,
        "intensity": state.intensity,
        "expires_at": state.expires_at.isoformat() if state.expires_at else None
    }


@router.delete("/npcs/{npc_id}/emotions/{emotion_id}")
async def clear_npc_emotion(
    npc_id: int,
    emotion_id: int,
    db: DatabaseSession,
    user: CurrentUser
) -> Dict[str, Any]:
    """
    Clear a specific emotional state
    """
    emotion_service = EmotionalStateService(db)

    success = await emotion_service.clear_emotion(emotion_id)

    if not success:
        raise HTTPException(status_code=404, detail="Emotion not found")

    return {
        "success": True,
        "message": "Emotion cleared"
    }


@router.delete("/npcs/{npc_id}/emotions")
async def clear_all_npc_emotions(
    npc_id: int,
    db: DatabaseSession,
    user: CurrentUser,
    session_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Clear all active emotions for an NPC
    """
    emotion_service = EmotionalStateService(db)

    count = await emotion_service.clear_all_emotions(
        npc_id=npc_id,
        session_id=session_id
    )

    return {
        "success": True,
        "cleared_count": count,
        "message": f"Cleared {count} emotions"
    }
