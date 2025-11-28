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
from datetime import datetime

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession
from pixsim7.backend.main.services.prompt_dsl_adapter import analyze_prompt
from pixsim7.backend.main.services.llm.ai_hub_service import AiHubService
from pixsim7.backend.main.domain.semantic_pack import SemanticPackDB
from pixsim7.backend.main.domain.action_block import ActionBlockDB
from pixsim7.backend.main.services.semantic_packs.utils import (
    build_draft_pack_from_suggestion,
    merge_parser_hints,
)
from pixsim7.backend.main.services.action_blocks.utils import (
    build_draft_action_block_from_suggestion,
)
from pixsim7.backend.main.shared.schemas.discovery_schemas import (
    SuggestedOntologyId,
    SuggestedPackEntry,
    SuggestedActionBlock,
)
from sqlalchemy import select

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


# ===== APPLY SUGGESTION ENDPOINTS (Task 87) =====

class ApplyPackSuggestionRequest(BaseModel):
    """Request to apply a pack suggestion as a draft SemanticPackDB"""
    pack_id: str = Field(..., description="Unique pack identifier")
    pack_label: str = Field(..., description="Human-readable pack label")
    parser_hints: Dict[str, List[str]] = Field(
        default_factory=dict,
        description="Parser hints by role/attribute key"
    )
    source_prompt: Optional[str] = Field(
        None,
        description="Optional source prompt excerpt for traceability"
    )
    notes: Optional[str] = Field(
        None,
        description="Optional notes from AI suggestion"
    )


class ApplyBlockSuggestionRequest(BaseModel):
    """Request to apply a block suggestion as a draft ActionBlockDB"""
    block_id: str = Field(..., description="Unique block identifier")
    prompt: str = Field(..., description="The prompt text for this block")
    tags: Dict[str, Any] = Field(
        default_factory=dict,
        description="Structured tags (ontology-aligned where possible)"
    )
    package_name: Optional[str] = Field(
        None,
        description="Optional package/library name to organize this block"
    )
    source_prompt: Optional[str] = Field(
        None,
        description="Optional source prompt excerpt for traceability"
    )
    notes: Optional[str] = Field(
        None,
        description="Optional notes from AI suggestion"
    )


class ApplyPackSuggestionResponse(BaseModel):
    """Response after applying a pack suggestion"""
    success: bool
    pack_id: str
    message: str
    created: bool  # True if new pack was created, False if existing was updated
    pack_version: str


class ApplyBlockSuggestionResponse(BaseModel):
    """Response after applying a block suggestion"""
    success: bool
    block_id: str
    message: str
    db_id: str  # The UUID primary key


@router.post("/apply-pack")
async def apply_pack_suggestion(
    user: CurrentUser,
    db: DatabaseSession,
    request: ApplyPackSuggestionRequest,
) -> ApplyPackSuggestionResponse:
    """
    Apply a pack suggestion by creating or updating a draft SemanticPackDB.

    Behavior:
    - If pack with pack_id exists: merge parser_hints, keep status as-is
    - If pack doesn't exist: create new draft pack with status='draft'
    - Always marks pack as AI-suggested in metadata

    Args:
        request: Pack suggestion details from Prompt Lab

    Returns:
        Success response with pack ID and creation status

    Raises:
        400: If pack_id or pack_label is invalid
        500: If database operation fails
    """
    pack_id = request.pack_id.strip()
    pack_label = request.pack_label.strip()

    if not pack_id or not pack_label:
        raise HTTPException(
            status_code=400,
            detail="pack_id and pack_label are required and cannot be empty"
        )

    logger.info(
        "apply_pack_suggestion_start",
        extra={
            "user_id": user.id,
            "pack_id": pack_id,
            "has_source_prompt": bool(request.source_prompt),
        }
    )

    try:
        # Check if pack already exists
        result = await db.execute(
            select(SemanticPackDB).where(SemanticPackDB.id == pack_id)
        )
        existing_pack = result.scalar_one_or_none()

        if existing_pack:
            # Update existing pack: merge parser hints
            logger.info(
                "apply_pack_suggestion_update_existing",
                extra={
                    "user_id": user.id,
                    "pack_id": pack_id,
                    "existing_version": existing_pack.version,
                }
            )

            # Merge parser hints (don't overwrite, extend)
            existing_pack.parser_hints = merge_parser_hints(
                existing_pack.parser_hints,
                request.parser_hints,
            )

            # Update metadata to track this suggestion
            if "ai_suggestions" not in existing_pack.extra:
                existing_pack.extra["ai_suggestions"] = []

            existing_pack.extra["ai_suggestions"].append({
                "timestamp": datetime.utcnow().isoformat(),
                "source_prompt_excerpt": request.source_prompt[:200] if request.source_prompt else None,
                "notes": request.notes,
                "hints_added": request.parser_hints,
            })

            existing_pack.updated_at = datetime.utcnow()

            db.add(existing_pack)
            await db.commit()
            await db.refresh(existing_pack)

            return ApplyPackSuggestionResponse(
                success=True,
                pack_id=pack_id,
                message=f"Updated existing pack '{pack_label}' with new parser hints",
                created=False,
                pack_version=existing_pack.version,
            )

        else:
            # Create new draft pack
            logger.info(
                "apply_pack_suggestion_create_new",
                extra={
                    "user_id": user.id,
                    "pack_id": pack_id,
                }
            )

            # Build suggestion object
            suggestion = SuggestedPackEntry(
                pack_id=pack_id,
                pack_label=pack_label,
                parser_hints=request.parser_hints,
                notes=request.notes,
            )

            # Build draft pack
            new_pack = build_draft_pack_from_suggestion(
                suggestion=suggestion,
                source_prompt=request.source_prompt,
            )

            db.add(new_pack)
            await db.commit()
            await db.refresh(new_pack)

            return ApplyPackSuggestionResponse(
                success=True,
                pack_id=pack_id,
                message=f"Created new draft pack '{pack_label}'",
                created=True,
                pack_version=new_pack.version,
            )

    except Exception as e:
        logger.error(
            "apply_pack_suggestion_failed",
            extra={
                "user_id": user.id,
                "pack_id": pack_id,
                "error": str(e),
                "error_type": e.__class__.__name__,
            }
        )
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to apply pack suggestion: {str(e)}"
        )


@router.post("/apply-block")
async def apply_block_suggestion(
    user: CurrentUser,
    db: DatabaseSession,
    request: ApplyBlockSuggestionRequest,
) -> ApplyBlockSuggestionResponse:
    """
    Apply a block suggestion by creating a draft ActionBlockDB.

    Behavior:
    - If block with block_id exists: return 400 error (no overwrites)
    - If block doesn't exist: create new draft block with source_type='ai_suggested'
    - Always marks block as AI-suggested in metadata

    Args:
        request: Block suggestion details from Prompt Lab

    Returns:
        Success response with block ID and database UUID

    Raises:
        400: If block_id already exists or is invalid
        500: If database operation fails
    """
    block_id = request.block_id.strip()
    prompt = request.prompt.strip()

    if not block_id or not prompt:
        raise HTTPException(
            status_code=400,
            detail="block_id and prompt are required and cannot be empty"
        )

    logger.info(
        "apply_block_suggestion_start",
        extra={
            "user_id": user.id,
            "block_id": block_id,
            "has_source_prompt": bool(request.source_prompt),
        }
    )

    try:
        # Check if block already exists
        result = await db.execute(
            select(ActionBlockDB).where(ActionBlockDB.block_id == block_id)
        )
        existing_block = result.scalar_one_or_none()

        if existing_block:
            # Block already exists - don't overwrite
            logger.warning(
                "apply_block_suggestion_already_exists",
                extra={
                    "user_id": user.id,
                    "block_id": block_id,
                }
            )
            raise HTTPException(
                status_code=400,
                detail=f"ActionBlock with block_id '{block_id}' already exists. "
                       f"Cannot overwrite existing blocks."
            )

        # Create new draft block
        logger.info(
            "apply_block_suggestion_create_new",
            extra={
                "user_id": user.id,
                "block_id": block_id,
                "package_name": request.package_name,
            }
        )

        # Build suggestion object
        suggestion = SuggestedActionBlock(
            block_id=block_id,
            prompt=prompt,
            tags=request.tags,
            notes=request.notes,
        )

        # Build draft action block
        new_block = build_draft_action_block_from_suggestion(
            suggestion=suggestion,
            package_name=request.package_name,
            source_prompt=request.source_prompt,
        )

        db.add(new_block)
        await db.commit()
        await db.refresh(new_block)

        return ApplyBlockSuggestionResponse(
            success=True,
            block_id=block_id,
            message=f"Created new draft ActionBlock '{block_id}'",
            db_id=str(new_block.id),
        )

    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(
            "apply_block_suggestion_failed",
            extra={
                "user_id": user.id,
                "block_id": block_id,
                "error": str(e),
                "error_type": e.__class__.__name__,
            }
        )
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to apply block suggestion: {str(e)}"
        )
