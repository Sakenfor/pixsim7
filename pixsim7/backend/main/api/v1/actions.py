"""
Action Selection and Playback API endpoints.

Handles action selection, progression, and library browsing for narrative scenes.
"""

from __future__ import annotations
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
from pixsim7.backend.main.domain.game.models import GameSession, GameWorld, GameNPC
from pixsim7.backend.main.domain.narrative import NarrativeEngine
from pixsim7.backend.main.domain.narrative.action_blocks import (
    ActionEngine,
    ActionSelectionContext,
    BranchIntent
)
from pixsim7.backend.main.domain.narrative.action_blocks.generator import (
    DynamicBlockGenerator,
    GenerationRequest,
)
from pixsim7.backend.main.api.v1.generation import GenerateActionBlockRequest


router = APIRouter()


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
                from pixsim7.backend.main.domain.stats import StatEngine
                from pixsim7.backend.main.domain.stats.migration import (
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
                    from pixsim7.backend.main.domain.stats import WorldStatsConfig
                    stats_config = WorldStatsConfig.model_validate(world_meta['stats_config'])
                else:
                    from pixsim7.backend.main.domain.stats import WorldStatsConfig
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
