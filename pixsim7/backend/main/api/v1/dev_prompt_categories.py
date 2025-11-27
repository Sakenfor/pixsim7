"""
Dev Prompt Category Discovery API

Dev-only endpoint for AI-assisted category discovery in Prompt Lab.
Analyzes prompts and suggests ontology IDs, semantic pack entries, and ActionBlocks.

Purpose:
- Help identify gaps in parser/ontology coverage
- Suggest new categories and semantic elements
- Never mutates ontology/packs/ActionBlocks (read-only suggestions)

Design:
- Uses SimplePromptParser for baseline analysis
- Calls AI Hub to generate structured suggestions
- Returns proposals that can be manually reviewed and applied
"""
from fastapi import APIRouter, HTTPException
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
import logging

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession
from pixsim7.backend.main.services.prompt_dsl_adapter import analyze_prompt
from pixsim7.backend.main.services.llm.ai_hub_service import AiHubService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dev/prompt-categories", tags=["dev"])


# ===== REQUEST/RESPONSE SCHEMAS =====

class PromptCategoryDiscoveryRequest(BaseModel):
    """Request model for category discovery analysis."""
    prompt_text: str = Field(..., min_length=1)
    # Optional context for better suggestions
    world_id: Optional[str] = None
    pack_ids: Optional[List[str]] = None
    # Optional hint whether this is a "family" seed or a one-off prompt
    use_case: Optional[str] = Field(
        default=None,
        description="Optional hint: 'family-seed', 'one-off', etc."
    )


class SuggestedOntologyId(BaseModel):
    """A suggested ontology ID from AI analysis."""
    id: str
    label: str
    description: Optional[str] = None
    kind: str  # e.g. "action", "state", "part", "manner", "agency"
    confidence: float


class SuggestedPackEntry(BaseModel):
    """A suggested semantic pack entry."""
    pack_id: str
    pack_label: str
    parser_hints: Dict[str, List[str]]  # candidate hints for this pack
    notes: Optional[str] = None


class SuggestedActionBlock(BaseModel):
    """A suggested ActionBlock for reuse."""
    block_id: str
    prompt: str
    tags: Dict[str, Any]
    notes: Optional[str] = None


class PromptCategoryDiscoveryResponse(BaseModel):
    """Response model with parser analysis and AI suggestions."""
    prompt_text: str
    parser_roles: List[Dict[str, Any]]      # summary of roles/blocks from SimplePromptParser
    existing_ontology_ids: List[str]        # union of ontology_ids already found
    suggestions: Dict[str, Any]             # raw AI suggestion payload (for debugging)
    suggested_ontology_ids: List[SuggestedOntologyId]
    suggested_packs: List[SuggestedPackEntry]
    suggested_action_blocks: List[SuggestedActionBlock]


# ===== ENDPOINT =====

@router.post("/discover")
async def discover_prompt_categories(
    user: CurrentUser,
    db: DatabaseSession,
    request: PromptCategoryDiscoveryRequest,
) -> PromptCategoryDiscoveryResponse:
    """
    Analyze a prompt and suggest ontology categories, pack entries, and ActionBlocks.

    This dev-only endpoint:
    1. Parses the prompt using SimplePromptParser
    2. Extracts existing ontology coverage
    3. Calls AI Hub to propose new categories and semantic elements
    4. Returns structured suggestions for manual review

    Does NOT mutate any data - purely analytical.

    Args:
        request: Prompt text and optional context

    Returns:
        Parsed prompt summary + AI-generated suggestions

    Raises:
        400: If prompt_text is empty
        500: If AI analysis fails or returns invalid JSON
    """
    prompt_text = request.prompt_text.strip()

    if not prompt_text:
        raise HTTPException(
            status_code=400,
            detail="prompt_text is required and cannot be empty"
        )

    logger.info(
        "category_discovery_start",
        extra={
            "user_id": user.id,
            "prompt_length": len(prompt_text),
            "world_id": request.world_id,
            "pack_ids": request.pack_ids,
            "use_case": request.use_case,
        }
    )

    # Step 1: Analyze prompt with SimplePromptParser
    try:
        analysis = await analyze_prompt(prompt_text)
        blocks = analysis.get("blocks", [])
        tags = analysis.get("tags", [])
    except Exception as e:
        logger.error(
            "prompt_analysis_failed",
            extra={
                "error": str(e),
                "error_type": e.__class__.__name__,
                "user_id": user.id,
            }
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to analyze prompt: {str(e)}"
        )

    # Step 2: Extract existing ontology IDs from block metadata
    existing_ontology_ids: List[str] = []
    parser_roles: List[Dict[str, Any]] = []

    for block in blocks:
        role = block.get("role", "other")
        text = block.get("text", "")

        # Build simplified block summary for response
        parser_roles.append({
            "role": role,
            "text": text,
        })

    # For now, we don't have ontology_ids in the basic analysis
    # They would come from ParsedBlock.metadata if we had access to the raw parsed blocks
    # We'll get them from the AI suggestions instead

    # Step 3: Build context for AI Hub
    analysis_context = {
        "blocks": blocks,
        "tags": tags,
        "existing_ontology_ids": existing_ontology_ids,
        "world_id": request.world_id,
        "pack_ids": request.pack_ids or [],
        "use_case": request.use_case,
    }

    # Step 4: Call AI Hub to get category suggestions
    ai_hub = AiHubService(db)

    try:
        ai_suggestions = await ai_hub.suggest_prompt_categories(
            user=user,
            model_id=None,  # Use default prompt_edit model
            prompt_text=prompt_text,
            analysis_context=analysis_context,
        )
    except Exception as e:
        logger.error(
            "ai_category_suggestion_failed",
            extra={
                "error": str(e),
                "error_type": e.__class__.__name__,
                "user_id": user.id,
            }
        )
        raise HTTPException(
            status_code=500,
            detail=f"AI category suggestion failed: {str(e)}"
        )

    # Step 5: Parse AI suggestions into typed responses
    try:
        suggested_ontology_ids = [
            SuggestedOntologyId(**item)
            for item in ai_suggestions.get("suggested_ontology_ids", [])
        ]

        suggested_packs = [
            SuggestedPackEntry(**item)
            for item in ai_suggestions.get("suggested_packs", [])
        ]

        suggested_action_blocks = [
            SuggestedActionBlock(**item)
            for item in ai_suggestions.get("suggested_action_blocks", [])
        ]
    except Exception as e:
        logger.error(
            "ai_response_parse_failed",
            extra={
                "error": str(e),
                "error_type": e.__class__.__name__,
                "raw_response": ai_suggestions,
                "user_id": user.id,
            }
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse AI response: {str(e)}"
        )

    # Log summary stats
    logger.debug(
        "category_discovery_complete",
        extra={
            "user_id": user.id,
            "prompt_length": len(prompt_text),
            "existing_ontology_count": len(existing_ontology_ids),
            "suggested_ontology_count": len(suggested_ontology_ids),
            "suggested_pack_count": len(suggested_packs),
            "suggested_action_block_count": len(suggested_action_blocks),
        }
    )

    # Step 6: Build and return response
    return PromptCategoryDiscoveryResponse(
        prompt_text=prompt_text,
        parser_roles=parser_roles,
        existing_ontology_ids=existing_ontology_ids,
        suggestions=ai_suggestions,  # Include raw response for debugging
        suggested_ontology_ids=suggested_ontology_ids,
        suggested_packs=suggested_packs,
        suggested_action_blocks=suggested_action_blocks,
    )
