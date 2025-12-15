"""
Action Block Generation API endpoints.

Handles dynamic generation and testing of action blocks for narrative scenes.
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional

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
from pixsim7.backend.main.domain.game import GameSession, GameWorld, GameNPC
from pixsim7.backend.main.domain.narrative import NarrativeEngine
from pixsim7.backend.main.domain.narrative.action_blocks import ActionEngine
from pixsim7.backend.main.domain.narrative.action_blocks.generator import (
    DynamicBlockGenerator,
    GenerationRequest,
    GenerationResult,
    PreviousSegmentSnapshot
)
from pixsim7.backend.main.domain.narrative.action_blocks.types_v2 import ContentRating


router = APIRouter()


class PreviousSegmentInput(BaseModel):
    """Previous segment snapshot for generation context"""
    block_id: str
    segment_id: str
    asset_id: str
    asset_url: str
    pose: str
    intensity: float
    tags: Optional[List[str]] = None
    mood: Optional[str] = None
    branch_intent: Optional[str] = None
    summary: Optional[str] = None


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


# ============================================================================
