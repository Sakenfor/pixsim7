"""
Dialogue Execution API endpoints.

Handles narrative dialogue flow: next-line generation, execution, and debugging.
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from pixsim7_backend.api.dependencies import CurrentUser, DatabaseSession
from pixsim7_backend.domain.game.models import GameSession, GameWorld, GameNPC
from pixsim7_backend.domain.narrative import NarrativeEngine


router = APIRouter()

# Singleton for narrative engine
_narrative_engine = None


def get_narrative_engine() -> NarrativeEngine:
    """Get or create the narrative engine singleton."""
    global _narrative_engine
    if _narrative_engine is None:
        _narrative_engine = NarrativeEngine()
    return _narrative_engine


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

    # Initialize all NPC services
    memory_service = MemoryService(db)
    emotion_service = EmotionalStateService(db)
    milestone_service = MilestoneService(db)
    world_awareness_service = WorldAwarenessService(db)
    personality_service = PersonalityEvolutionService(db)
    analytics_service = DialogueAnalyticsService(db)

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

    # Get relevant world events
    relevant_world_events = await world_awareness_service.get_relevant_events(
        npc_id=req.npc_id,
        min_relevance=0.5,
        limit=3
    )

    # Get recent milestones for context
    recent_milestones = await milestone_service.get_recent_milestones(
        npc_id=req.npc_id,
        user_id=user.id,
        limit=2
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

    # Add world events context
    if relevant_world_events:
        world_context = world_awareness_service.format_events_for_dialogue(relevant_world_events)
        enhanced_prompt += f"\n\n{world_context}"

    # Add milestone context
    if recent_milestones:
        milestone_context = "\n\nRecent relationship milestones:"
        for milestone in recent_milestones:
            milestone_context += f"\n- {milestone.milestone_name} (achieved {milestone.achieved_at.strftime('%Y-%m-%d')})"
        enhanced_prompt += milestone_context

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
    created_memory = await memory_service.create_memory(
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

    # Record analytics for this dialogue generation
    analytics_record = await analytics_service.record_dialogue_generation(
        npc_id=req.npc_id,
        user_id=user.id,
        program_id=req.program_id,
        prompt_hash=llm_response.cache_key or "",
        relationship_tier=context.relationship.relationship_tier,
        model_used=llm_response.model,
        generation_time_ms=llm_response.generation_time_ms or 0.0,
        dialogue_length=len(llm_response.text),
        session_id=req.session_id,
        memory_id=created_memory.id,
        intimacy_level=context.relationship.intimacy_level,
        npc_emotion=current_emotions[0].emotion.value if current_emotions else None,
        was_cached=llm_response.cached,
        tokens_used=llm_response.usage.get("total_tokens") if llm_response.usage else None,
        estimated_cost=llm_response.estimated_cost,
        contains_memory_reference=len(recent_memories) > 0,
        emotional_consistency=True,
        metadata={
            "world_events_count": len(relevant_world_events),
            "milestones_count": len(recent_milestones)
        }
    )

    # Check for relationship milestones
    # Get previous relationship tier from recent memories
    previous_tier = None
    if recent_memories:
        previous_tier = recent_memories[0].relationship_tier_at_time

    # If tier changed, create milestone
    current_tier = context.relationship.relationship_tier
    if previous_tier and previous_tier != current_tier:
        relationship_values = {
            "affinity": context.relationship.affinity,
            "trust": context.relationship.trust,
            "chemistry": context.relationship.chemistry,
            "tension": context.relationship.tension
        }

        milestone = await milestone_service.check_and_create_tier_milestone(
            npc_id=req.npc_id,
            user_id=user.id,
            new_tier=current_tier,
            relationship_values=relationship_values,
            session_id=req.session_id,
            triggered_by="relationship_change_during_conversation"
        )

        # If milestone created, trigger emotional response
        if milestone:
            emotion_trigger = milestone_service.get_milestone_emotion_trigger(milestone.milestone_type)
            if emotion_trigger:
                emotion_type, intensity = emotion_trigger
                await emotion_service.set_emotion(
                    npc_id=req.npc_id,
                    emotion=emotion_type,
                    intensity=intensity,
                    duration_seconds=1800,  # 30 minutes
                    triggered_by=f"milestone_{milestone.milestone_type.value}",
                    session_id=req.session_id
                )

            # Consider personality evolution from milestone
            personality_changes = personality_service.suggest_trait_changes_from_milestone(
                milestone_type=milestone.milestone_type.value,
                current_traits=npc_data.get("personality", {})
            )

            for trait, change_amount, reason in personality_changes:
                # Apply small personality changes over time
                # Note: This would need NPC personality tracking in the database
                # For now, just record the evolution event
                if npc_data.get("personality", {}).get(trait.value):
                    current_value = npc_data["personality"][trait.value]
                    await personality_service.apply_trait_change(
                        npc_id=req.npc_id,
                        trait=trait,
                        current_value=current_value,
                        change_amount=change_amount,
                        triggered_by=reason,
                        user_id=user.id,
                        trigger_event_id=milestone.id,
                        relationship_tier=current_tier
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
            "recent_memories_count": len(recent_memories),
            "world_events_count": len(relevant_world_events),
            "milestones_count": len(recent_milestones),
            "analytics_recorded": True,
            "milestone_created": previous_tier and previous_tier != current_tier
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
