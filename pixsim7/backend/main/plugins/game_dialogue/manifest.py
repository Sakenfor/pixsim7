"""
Game Dialogue Plugin

Provides narrative and primitive block generation for NPC dialogues.
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
    get_block_generator,
)
from pixsim7.backend.main.domain.blocks import BlockPrimitive
from pixsim7.backend.main.domain.game.core.models import (
    GameSession, GameWorld, GameNPC, GameLocation, NPCSchedule,
    GameScene, GameSceneNode
)
from pixsim7.backend.main.domain.narrative import (
    NarrativeEngine,
    resolve_primitive_node,
)
from pixsim7.backend.main.domain.narrative.runtime_action_assembly import (
    composition_assets_from_resolved_images,
)
from pixsim7.backend.main.domain.narrative.schema import PrimitiveNode
from pixsim7.backend.main.domain.narrative.action_blocks.types_unified import (
    ActionSelectionContext,
    BranchIntent,
    ContentRating,
)
from pixsim7.backend.main.domain.narrative.action_blocks.ontology import get_ontology
from pixsim7.backend.main.domain.narrative.action_blocks.generated_store import (
    GeneratedBlockStore,
)
from pixsim7.backend.main.domain.narrative.action_blocks.generator import (
    DynamicBlockGenerator,
    GenerationRequest,
    GenerationResult,
    PreviousSegmentSnapshot
)
from pixsim7.backend.main.infrastructure.database.session import get_async_blocks_session
from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.services.prompt.block.block_primitive_query import (
    build_block_primitive_query,
)


# ===== PLUGIN MANIFEST =====

manifest = PluginManifest(
    id="game_dialogue",
    name="Game Dialogue & Narrative",
    version="1.0.0",
    description="Provides narrative engine and primitive block generation for NPC dialogues and interactions",
    author="PixSim Team",
    kind="feature",
    prefix="/api/v1/game/dialogue",
    tags=["game-dialogue"],
    dependencies=[],  # Could depend on game-sessions, game-npcs, but they're optional
    requires_db=True,
    requires_redis=False,
    enabled=True,
)


# ===== API ROUTER =====

router = APIRouter(tags=["game-dialogue"])
_generated_block_store = GeneratedBlockStore()


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


def _build_generation_request(req: 'GeneratePrimitiveBlockRequest') -> GenerationRequest:
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
    block_data: Dict[str, Any],
    *,
    source: str,
    user_id: int,
    previous_segment: Optional['PreviousSegmentInput'] = None,
    selection: Optional['PrimitiveSelectionRequest'] = None
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

    await _generated_block_store.upsert_block(
        db,
        block_data,
        source=source,
        previous_block_id=previous_segment.block_id if previous_segment else None,
        reference_asset_id=previous_segment.asset_id if previous_segment else None,
        meta=meta
    )


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


SECONDS_PER_DAY = 24 * 60 * 60
DAYS_PER_WEEK = 7


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _slugify(value: str) -> str:
    import re

    slug = re.sub(r"[^a-zA-Z0-9]+", "_", value).strip("_").lower()
    return slug


def _split_world_time(world_time: float) -> tuple[int, float]:
    value = float(world_time if world_time is not None else 0.0)
    if value < 0:
        value = 0.0
    day_index = int(value // SECONDS_PER_DAY)
    day_of_week = day_index % DAYS_PER_WEEK
    seconds_in_day = float(value % SECONDS_PER_DAY)
    return day_of_week, seconds_in_day


def _resolve_npc_session_blob(session: GameSession, npc_id: int) -> Dict[str, Any]:
    flags = _as_dict(session.flags)
    npcs = _as_dict(flags.get("npcs"))
    return _as_dict(npcs.get(f"npc:{int(npc_id)}"))


def _resolve_npc_behavior_state(npc_blob: Dict[str, Any]) -> Dict[str, Any]:
    components = _as_dict(npc_blob.get("components"))
    behavior_component = _as_dict(components.get("behavior"))
    legacy_state = _as_dict(npc_blob.get("state"))

    current_activity_id = (
        behavior_component.get("currentActivityId")
        or behavior_component.get("currentActivity")
        or legacy_state.get("currentActivityId")
        or legacy_state.get("currentActivity")
        or legacy_state.get("activity")
    )

    return {
        "currentActivityId": current_activity_id,
        "simulationTier": behavior_component.get("simulationTier") or legacy_state.get("simulationTier"),
    }


def _resolve_npc_mood(npc_blob: Dict[str, Any]) -> Optional[str]:
    mood_tags = npc_blob.get("moodTags")
    if isinstance(mood_tags, list):
        for tag in mood_tags:
            if isinstance(tag, str) and tag.strip():
                return tag.strip()

    mood_component = _as_dict(_as_dict(npc_blob.get("components")).get("mood"))
    general_mood = _as_dict(mood_component.get("general"))
    mood_id = general_mood.get("moodId")
    if isinstance(mood_id, str) and mood_id.strip():
        return mood_id.strip()
    return None


def _resolve_location_tag(location: Optional[GameLocation]) -> Optional[str]:
    if location is None:
        return None

    meta = _as_dict(location.meta)
    raw = (
        meta.get("locationTag")
        or meta.get("location_tag")
        or meta.get("tag")
        or meta.get("location_key")
    )
    if isinstance(raw, str) and raw.strip():
        value = raw.strip()
        return value if ":" in value else f"location:{value}"

    if isinstance(location.name, str) and location.name.strip():
        slug = _slugify(location.name)
        if slug:
            return f"location:{slug}"

    return None


def _resolve_scene_intent_from_activity(
    world_meta: Dict[str, Any],
    activity_id: Optional[str],
) -> Optional[str]:
    if not isinstance(activity_id, str) or not activity_id.strip():
        return None

    behavior = _as_dict(world_meta.get("behavior"))
    activities = _as_dict(behavior.get("activities"))
    activity = _as_dict(activities.get(activity_id.strip()))
    visual = _as_dict(activity.get("visual"))
    scene_intent = visual.get("sceneIntent")
    if isinstance(scene_intent, str) and scene_intent.strip():
        return scene_intent.strip()
    return None


async def _resolve_location_for_npc(
    db: DatabaseSession,
    npc: GameNPC,
    *,
    world_time: float,
) -> tuple[Optional[GameLocation], Optional[str]]:
    day_of_week, seconds_in_day = _split_world_time(world_time)
    schedule_result = await db.execute(
        select(NPCSchedule)
        .where(
            NPCSchedule.npc_id == int(npc.id),
            NPCSchedule.day_of_week == int(day_of_week),
            NPCSchedule.start_time <= float(seconds_in_day),
            NPCSchedule.end_time > float(seconds_in_day),
        )
        .order_by(NPCSchedule.start_time.desc(), NPCSchedule.id.desc())
    )
    schedule = schedule_result.scalars().first()
    if schedule is not None:
        location = await db.get(GameLocation, int(schedule.location_id))
        if location is not None:
            return location, "schedule"

    if npc.home_location_id is not None:
        location = await db.get(GameLocation, int(npc.home_location_id))
        if location is not None:
            return location, "home"

    return None, None


class PrimitiveSelectionRequest(BaseModel):
    """Request for selecting primitive blocks."""
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


class PrimitiveSelectionResponse(BaseModel):
    """Response containing selected primitive blocks."""
    blocks: List[Dict[str, Any]]
    total_duration: float
    resolved_images: List[Dict[str, Any]]
    composition_assets: List[Dict[str, Any]]
    compatibility_score: float
    fallback_reason: Optional[str] = None
    prompts: List[str]
    segments: List[Dict[str, Any]]


class BuildPrimitiveSelectionRequestFromBehaviorRequest(BaseModel):
    """Build a PrimitiveSelectionRequest using behavior + schedule/session state."""

    session_id: int
    world_id: int
    lead_npc_id: int
    partner_npc_id: Optional[int] = None

    world_time: Optional[float] = None
    include_scene_intent_tag: bool = False

    pose: Optional[str] = None
    mood: Optional[str] = None
    intimacy_level: Optional[str] = None
    branch_intent: Optional[str] = None
    previous_block_id: Optional[str] = None
    required_tags: List[str] = Field(default_factory=list)
    exclude_tags: List[str] = Field(default_factory=list)
    max_duration: Optional[float] = None


class BuildPrimitiveSelectionRequestFromBehaviorResponse(BaseModel):
    """Built primitive-selection request plus derived behavior context."""

    request: PrimitiveSelectionRequest
    derived: Dict[str, Any]


class GeneratePrimitiveBlockRequest(BaseModel):
    """Request for generating a new primitive block dynamically."""
    concept_type: str  # e.g., "creature_interaction", "position_maintenance"
    parameters: Dict[str, Any]
    content_rating: Optional[str] = "sfw"
    duration: Optional[float] = 6.0
    camera_settings: Optional[Dict[str, Any]] = None
    consistency_settings: Optional[Dict[str, Any]] = None
    intensity_settings: Optional[Dict[str, Any]] = None
    previous_segment: Optional[PreviousSegmentInput] = None


class GeneratePrimitiveBlockResponse(BaseModel):
    """Response containing the generated primitive block."""
    success: bool
    primitive_block: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    generation_time: float
    template_used: Optional[str] = None


class PrimitiveNextRequest(BaseModel):
    """Combined request that prefers library selection but can fall back to generation."""
    selection: PrimitiveSelectionRequest
    generation: Optional[GeneratePrimitiveBlockRequest] = None
    compatibility_threshold: float = 0.8
    prefer_generation: bool = False


class PrimitiveNextResponse(BaseModel):
    """Response describing whether library or generation was used."""
    mode: Literal["library", "generation"]
    selection: Optional[PrimitiveSelectionResponse] = None
    generated_block: Optional[Dict[str, Any]] = None
    generation_info: Optional[Dict[str, Any]] = None
    generation_error: Optional[str] = None



async def _build_primitive_selection_request_from_behavior(
    req: BuildPrimitiveSelectionRequestFromBehaviorRequest,
    db: DatabaseSession,
    user: CurrentUser,
) -> tuple[PrimitiveSelectionRequest, Dict[str, Any]]:
    session = await db.get(GameSession, int(req.session_id))
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    world = await db.get(GameWorld, int(req.world_id))
    if not world or world.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="World not found")

    if session.world_id is not None and int(session.world_id) != int(world.id):
        raise HTTPException(
            status_code=400,
            detail=f"Session {session.id} belongs to world {session.world_id}, not {world.id}",
        )

    lead_npc = await db.get(GameNPC, int(req.lead_npc_id))
    if not lead_npc:
        raise HTTPException(status_code=404, detail="Lead NPC not found")
    if lead_npc.world_id is not None and int(lead_npc.world_id) != int(world.id):
        raise HTTPException(
            status_code=400,
            detail=f"Lead NPC {lead_npc.id} belongs to world {lead_npc.world_id}, not {world.id}",
        )

    if req.partner_npc_id is not None:
        partner_npc = await db.get(GameNPC, int(req.partner_npc_id))
        if not partner_npc:
            raise HTTPException(status_code=404, detail="Partner NPC not found")
        if partner_npc.world_id is not None and int(partner_npc.world_id) != int(world.id):
            raise HTTPException(
                status_code=400,
                detail=f"Partner NPC {partner_npc.id} belongs to world {partner_npc.world_id}, not {world.id}",
            )

    effective_world_time = float(req.world_time) if req.world_time is not None else float(session.world_time or 0.0)
    lead_blob = _resolve_npc_session_blob(session, int(req.lead_npc_id))
    behavior_state = _resolve_npc_behavior_state(lead_blob)
    current_activity_id = behavior_state.get("currentActivityId")
    derived_mood = req.mood or _resolve_npc_mood(lead_blob)

    location, location_source = await _resolve_location_for_npc(
        db,
        lead_npc,
        world_time=effective_world_time,
    )
    location_tag = _resolve_location_tag(location)
    world_meta = _as_dict(world.meta)
    scene_intent = _resolve_scene_intent_from_activity(world_meta, current_activity_id)

    required_tags = list(req.required_tags or [])
    if req.include_scene_intent_tag and scene_intent:
        scene_intent_tag = f"scene_intent:{scene_intent}"
        if scene_intent_tag not in required_tags:
            required_tags.append(scene_intent_tag)

    built = PrimitiveSelectionRequest(
        location_tag=location_tag,
        pose=req.pose,
        intimacy_level=req.intimacy_level,
        mood=derived_mood,
        branch_intent=req.branch_intent,
        previous_block_id=req.previous_block_id,
        lead_npc_id=req.lead_npc_id,
        partner_npc_id=req.partner_npc_id,
        required_tags=required_tags,
        exclude_tags=list(req.exclude_tags or []),
        max_duration=req.max_duration,
        session_id=req.session_id,
        world_id=req.world_id,
    )

    derived: Dict[str, Any] = {
        "world_time": effective_world_time,
        "location_id": int(location.id) if location and location.id is not None else None,
        "location_name": (str(location.name) if location and location.name is not None else None),
        "location_source": location_source,
        "location_tag": location_tag,
        "current_activity_id": current_activity_id,
        "scene_intent": scene_intent,
        "mood": derived_mood,
        "simulation_tier": behavior_state.get("simulationTier"),
    }
    return built, derived


async def _run_primitive_selection(
    req: PrimitiveSelectionRequest,
    db: DatabaseSession,
    user: CurrentUser,
) -> PrimitiveSelectionResponse:
    """Execute selection via primitives runtime resolver and return a response."""
    computed_intimacy_level = req.intimacy_level
    computed_mood = req.mood
    branch_intent_str = req.branch_intent
    world_meta: Dict[str, Any] = {}

    if req.session_id and not req.intimacy_level:
        session = await db.get(GameSession, req.session_id)
        if session and session.user_id == user.id:
            world = None
            if req.world_id:
                world = await db.get(GameWorld, req.world_id)

            if world:
                world_meta = world.meta or {}
                from pixsim7.backend.main.domain.game.stats import StatEngine
                from pixsim7.backend.main.domain.game.stats.migration import (
                    get_default_relationship_definition,
                    resolve_stats_config,
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
                stats_config = resolve_stats_config(world_meta)

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

    branch_intent = None
    if branch_intent_str:
        try:
            branch_intent = BranchIntent(branch_intent_str)
        except ValueError:
            branch_intent = None

    context = ActionSelectionContext(
        locationTag=req.location_tag,
        pose=req.pose,
        intimacy_level=computed_intimacy_level,
        mood=computed_mood,
        branchIntent=branch_intent,
        previousBlockId=req.previous_block_id,
        leadNpcId=req.lead_npc_id,
        partnerNpcId=req.partner_npc_id,
        requiredTags=req.required_tags,
        excludeTags=req.exclude_tags,
        maxDuration=req.max_duration
    )

    node = PrimitiveNode(
        id=f"plugin_primitive_select_{req.lead_npc_id}",
        mode="query",
        query={
            "location": context.locationTag,
            "pose": context.pose,
            "intimacy_level": context.intimacy_level,
            "mood": context.mood,
            "branch_intent": context.branchIntent,
            "requiredTags": list(context.requiredTags or []),
            "excludeTags": list(context.excludeTags or []),
            "maxDuration": context.maxDuration,
        },
        composition="sequential",
    )
    runtime_context: Dict[str, Any] = {
        "npc": {"id": req.lead_npc_id},
        "partner_npc": {"id": req.partner_npc_id} if req.partner_npc_id is not None else {},
        "previous_block_id": req.previous_block_id,
        "world": {"id": req.world_id, "meta": world_meta} if req.world_id is not None else {"meta": world_meta},
    }
    sequence = await resolve_primitive_node(node, runtime_context, db)
    resolved_images: List[Dict[str, Any]] = []
    composition_assets = composition_assets_from_resolved_images(resolved_images)

    return PrimitiveSelectionResponse(
        blocks=sequence.blocks,
        total_duration=sequence.total_duration,
        resolved_images=resolved_images,
        composition_assets=composition_assets,
        compatibility_score=sequence.compatibility_score,
        fallback_reason=sequence.fallback_reason,
        prompts=sequence.prompts,
        segments=sequence.segments,
    )


@router.post(
    "/primitives/request-from-behavior",
    response_model=BuildPrimitiveSelectionRequestFromBehaviorResponse,
)
async def build_primitive_selection_request_from_behavior(
    req: BuildPrimitiveSelectionRequestFromBehaviorRequest,
    db: DatabaseSession,
    user: CurrentUser,
) -> BuildPrimitiveSelectionRequestFromBehaviorResponse:
    """
    Build primitive selection request from runtime behavior/schedule context.

    This endpoint does not run selection itself; it returns the normalized
    request payload for `/primitives/select`.
    """
    built, derived = await _build_primitive_selection_request_from_behavior(req, db, user)
    return BuildPrimitiveSelectionRequestFromBehaviorResponse(request=built, derived=derived)


@router.post("/primitives/select-from-behavior", response_model=PrimitiveSelectionResponse)
async def select_primitive_blocks_from_behavior(
    req: BuildPrimitiveSelectionRequestFromBehaviorRequest,
    db: DatabaseSession,
    user: CurrentUser,
) -> PrimitiveSelectionResponse:
    """
    Build primitive selection request from behavior context and immediately run selection.
    """
    built, _ = await _build_primitive_selection_request_from_behavior(req, db, user)
    return await _run_primitive_selection(built, db, user)


@router.post("/primitives/select", response_model=PrimitiveSelectionResponse)
async def select_primitive_blocks(
    req: PrimitiveSelectionRequest,
    db: DatabaseSession,
    user: CurrentUser,
) -> PrimitiveSelectionResponse:
    """
    Select appropriate primitive blocks for visual generation.

    Layering:
    1. This API layer handles session/world context gathering
    2. It distills that into a clean selection context
    3. The pure selector works with the distilled context only

    This keeps the selector module pure and testable without DB dependencies.
    """
    return await _run_primitive_selection(req, db, user)


@router.post("/primitives/next", response_model=PrimitiveNextResponse)
async def select_or_generate_primitive(
    req: PrimitiveNextRequest,
    db: DatabaseSession,
    user: CurrentUser,
    generator: DynamicBlockGenerator = Depends(get_block_generator)
) -> PrimitiveNextResponse:
    """
    Try to use library blocks first, falling back to dynamic generation when needed.
    """
    selection_result = await _run_primitive_selection(
        req.selection,
        db,
        user,
    )

    should_generate = (
        req.prefer_generation
        or not selection_result.blocks
        or selection_result.compatibility_score < req.compatibility_threshold
    )

    if not should_generate or not req.generation:
        return PrimitiveNextResponse(
            mode="library",
            selection=selection_result
        )

    gen_request = _build_generation_request(req.generation)
    gen_result = generator.generate_block(gen_request)

    if not gen_result.success or not gen_result.action_block:
        return PrimitiveNextResponse(
            mode="library",
            selection=selection_result,
            generation_error=gen_result.error_message or "generation_failed"
        )

    await _persist_generated_block(
        db,
        gen_result.action_block,
        source="api:primitives/next",
        user_id=user.id,
        previous_segment=req.generation.previous_segment if req.generation else None,
        selection=req.selection
    )

    generation_info = {
        "generation_time": gen_result.generation_time,
        "template_used": gen_result.template_used
    }

    return PrimitiveNextResponse(
        mode="generation",
        selection=selection_result,
        generated_block=gen_result.action_block,
        generation_info=generation_info
    )


@router.get("/primitives/blocks")
async def list_primitive_blocks(
    location: Optional[str] = None,
    intimacy_level: Optional[str] = None,
    mood: Optional[str] = None,
    user: CurrentUser = None,
) -> Dict[str, Any]:
    """
    List available primitive blocks, optionally filtered by criteria.

    This endpoint is useful for debugging and for UI tools that need to show available primitives.
    """
    tags_all: Dict[str, Any] = {}
    if location:
        tags_all["location"] = location
    if intimacy_level:
        tags_all["intimacy_level"] = intimacy_level
    if mood:
        tags_all["mood"] = mood

    tag_query = {"all": tags_all} if tags_all else None
    query = build_block_primitive_query(tag_query=tag_query)
    query = query.order_by(BlockPrimitive.category, BlockPrimitive.block_id)

    async with get_async_blocks_session() as blocks_db:
        result = await blocks_db.execute(query)
        rows = list(result.scalars().all())

    blocks: List[Dict[str, Any]] = []
    for block in rows:
        tags = block.tags if isinstance(getattr(block, "tags", None), dict) else {}
        duration = tags.get("duration_sec") or tags.get("duration_seconds") or tags.get("duration") or 6.0
        try:
            duration_value = float(duration)
        except (TypeError, ValueError):
            duration_value = 6.0
        blocks.append(
            {
                "id": str(block.block_id),
                "kind": "single_state",
                "tags": tags,
                "duration": duration_value,
                "description": None,
                "category": block.category,
            }
        )

    return {
        "blocks": blocks,
        "total": len(blocks),
        "filters": {
            "location": location,
            "intimacy_level": intimacy_level,
            "mood": mood
        }
    }


@router.get("/primitives/poses")
async def list_pose_taxonomy(
    category: Optional[str] = None,
    user: CurrentUser = None,
) -> Dict[str, Any]:
    """
    Get the pose taxonomy from the shared ontology registry.

    This is useful for UI tools and for understanding pose compatibility.
    """
    taxonomy = get_ontology()
    if category:
        pose_ids = taxonomy.poses_in_category(category)
        poses = [taxonomy.get_pose(pose_id) for pose_id in pose_ids]
    else:
        poses = taxonomy.all_poses()

    poses_data = [pose.model_dump() for pose in poses if pose is not None]
    categories = sorted(
        {
            str(cat)
            for pose in taxonomy.all_poses()
            for cat in (getattr(pose, "categories", None) or [])
            if cat
        }
    )

    return {
        "poses": poses_data,
        "categories": categories,
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


@router.post("/primitives/generate", response_model=GeneratePrimitiveBlockResponse)
async def generate_primitive_block(
    req: GeneratePrimitiveBlockRequest,
    db: DatabaseSession,
    user: CurrentUser,
    generator: DynamicBlockGenerator = Depends(get_block_generator)
) -> GeneratePrimitiveBlockResponse:
    """
    Generate a new primitive block dynamically using templates and concepts.

    This endpoint allows creation of novel primitive blocks without pre-defining
    them in JSON files. It uses the concept library and template system to
    generate appropriate prompts.
    """
    gen_request = _build_generation_request(req)

    # Generate the block
    result = generator.generate_block(gen_request)

    if result.success and result.action_block:
        await _persist_generated_block(
            db,
            result.action_block,
            source="api:primitives/generate",
            user_id=user.id,
            previous_segment=req.previous_segment
        )

    return GeneratePrimitiveBlockResponse(
        success=result.success,
        primitive_block=result.action_block,
        error_message=result.error_message,
        generation_time=result.generation_time,
        template_used=result.template_used
    )


@router.post("/primitives/generate/creature", response_model=GeneratePrimitiveBlockResponse)
async def generate_creature_interaction(
    req: GenerateCreatureInteractionRequest,
    db: DatabaseSession,
    user: CurrentUser,
    generator: DynamicBlockGenerator = Depends(get_block_generator)
) -> GeneratePrimitiveBlockResponse:
    """
    Generate a creature interaction primitive block.

    This is a specialized endpoint for generating creature-based interactions
    with simplified parameters.
    """
    from pixsim7.backend.main.domain.narrative.action_blocks.concepts import CreatureType

    # Parse creature type
    try:
        creature_type = CreatureType(req.creature_type)
    except ValueError:
        return GeneratePrimitiveBlockResponse(
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
            result.action_block,
            source="api:primitives/generate/creature",
            user_id=user.id,
            previous_segment=req.previous_segment
        )

    return GeneratePrimitiveBlockResponse(
        success=result.success,
        primitive_block=result.action_block,
        error_message=result.error_message,
        generation_time=result.generation_time,
        template_used=result.template_used
    )


@router.post("/primitives/test", response_model=TestGenerationResponse)
async def test_generation_quality(
    req: TestGenerationRequest,
    user: CurrentUser,
    generator: DynamicBlockGenerator = Depends(get_block_generator)
) -> TestGenerationResponse:
    """
    Test the quality of primitive block generation.

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


@router.get("/primitives/templates")
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


@router.get("/primitives/concepts")
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
    """
    from pixsim_logging import configure_logging

    logger = configure_logging("plugin.game-dialogue")
    logger.info("Game Dialogue plugin loaded")


async def on_enable():
    """Called when plugin is enabled (after app starts)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.game-dialogue")

    # Initialize singletons
    get_narrative_engine()
    get_block_generator()

    logger.info("Game Dialogue plugin enabled - narrative engines initialized")


async def on_disable():
    """Called when plugin is disabled (before app shuts down)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.game-dialogue")
    logger.info("Game Dialogue plugin disabled")
