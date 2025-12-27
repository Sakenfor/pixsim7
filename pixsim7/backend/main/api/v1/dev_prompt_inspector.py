"""
Dev Prompt Inspector API

Dev-only endpoint for inspecting and analyzing prompts used in generations.
Shows structured breakdown of prompt components without modifying database.

Purpose:
- Debug prompt structure and parsing
- Understand what components are in a prompt
- View prompt analysis for assets or generations

Design:
- Read-only inspection (no DB changes)
- Uses prompt parser adapter for parsing
- Returns plain JSON (no DSL types)
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, Dict, Any
from sqlmodel import select

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession
from pixsim7.backend.main.domain.generation.models import Generation
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.services.prompt.parser import parse_prompt_to_blocks, analyze_prompt
from pixsim_logging import get_logger
from pydantic import BaseModel

logger = get_logger()

router = APIRouter(prefix="/dev/prompt-inspector", tags=["dev"])


@router.get("")
async def inspect_prompt(
    user: CurrentUser,
    db: DatabaseSession,
    asset_id: Optional[int] = Query(None, description="Asset ID to inspect"),
    job_id: Optional[int] = Query(None, description="Generation/Job ID to inspect"),
) -> Dict[str, Any]:
    """
    Inspect prompt structure for an asset or generation.

    Returns the original prompt text and parsed blocks showing:
    - Role (character, action, setting, mood, romance, other)
    - Text content
    - Component type (for debugging)

    Query parameters:
    - asset_id: Look up generation that created this asset
    - job_id: Look up generation directly (job_id == generation_id)

    Exactly one of asset_id or job_id must be provided.

    Returns:
        {
            "prompt": "full original prompt text",
            "blocks": [
                {"role": "character", "text": "...", "component_type": "..."},
                {"role": "action", "text": "...", "component_type": "..."},
                ...
            ]
        }

    Raises:
        400: If both or neither asset_id/job_id provided
        404: If asset/generation not found or no prompt available
        403: If user doesn't own the asset/generation
    """
    # Validate query params
    if asset_id is not None and job_id is not None:
        raise HTTPException(
            status_code=400,
            detail="Provide exactly one of asset_id or job_id, not both"
        )

    if asset_id is None and job_id is None:
        raise HTTPException(
            status_code=400,
            detail="Must provide either asset_id or job_id"
        )

    # Look up generation
    generation: Optional[Generation] = None

    if job_id is not None:
        # Direct generation lookup
        stmt = select(Generation).where(Generation.id == job_id)
        result = await db.execute(stmt)
        generation = result.scalar_one_or_none()

        if not generation:
            raise HTTPException(
                status_code=404,
                detail=f"Generation {job_id} not found"
            )

        # Check ownership
        if generation.user_id != user.id:
            raise HTTPException(
                status_code=403,
                detail="You don't have permission to view this generation"
            )

    elif asset_id is not None:
        # Asset lookup → find generation that created it
        stmt = select(Asset).where(Asset.id == asset_id)
        result = await db.execute(stmt)
        asset = result.scalar_one_or_none()

        if not asset:
            raise HTTPException(
                status_code=404,
                detail=f"Asset {asset_id} not found"
            )

        # Check ownership
        if asset.user_id != user.id:
            raise HTTPException(
                status_code=403,
                detail="You don't have permission to view this asset"
            )

        # Find generation that created this asset
        stmt = select(Generation).where(Generation.asset_id == asset_id)
        result = await db.execute(stmt)
        generation = result.scalar_one_or_none()

        if not generation:
            raise HTTPException(
                status_code=404,
                detail=f"No generation found for asset {asset_id}"
            )

    # Extract prompt text (prefer final_prompt, fallback to inlinePrompt in prompt_config)
    prompt_text = generation.final_prompt
    if not prompt_text and generation.prompt_config:
        inline_prompt = generation.prompt_config.get("inlinePrompt")
        if inline_prompt:
            prompt_text = inline_prompt

    if not prompt_text:
        raise HTTPException(
            status_code=404,
            detail="No prompt available for this generation"
        )

    # Parse prompt using adapter
    try:
        parsed = await parse_prompt_to_blocks(prompt_text)
    except Exception as e:
        # Log error but don't fail - return empty blocks
        # This ensures the UI can still show the prompt text
        logger.warning(
            "prompt_dsl_parse_failed",
            error=str(e),
            error_type=e.__class__.__name__,
            generation_id=generation.id,
            user_id=user.id,
        )
        parsed = {"blocks": []}

    # Return response
    return {
        "prompt": prompt_text,
        "blocks": parsed["blocks"]
    }


class AnalyzePromptRequest(BaseModel):
    """Request model for analyzing arbitrary prompt text."""
    prompt_text: str


@router.post("/analyze-prompt")
async def analyze_prompt_text(
    user: CurrentUser,
    request: AnalyzePromptRequest,
) -> Dict[str, Any]:
    """
    Analyze arbitrary prompt text and return structured breakdown.

    Dev-only endpoint for quick prompt analysis without needing an asset/job.
    Returns the original prompt text, parsed blocks, and auto-generated tags.

    Request body:
        { "prompt_text": "..." }

    Returns:
        {
            "prompt": "original text",
            "blocks": [
                {"role": "character", "text": "...", "component_type": "..."},
                {"role": "action", "text": "...", "component_type": "..."},
                ...
            ],
            "tags": ["has:character", "tone:soft", "camera:pov", ...]
        }

    Raises:
        400: If prompt_text is empty or missing
    """
    if not request.prompt_text or not request.prompt_text.strip():
        raise HTTPException(
            status_code=400,
            detail="prompt_text is required and cannot be empty"
        )

    # Analyze prompt using adapter
    try:
        analysis = await analyze_prompt(request.prompt_text)
    except Exception as e:
        # Log error but don't fail - return minimal structure
        logger.warning(
            "prompt_analysis_failed",
            error=str(e),
            error_type=e.__class__.__name__,
            user_id=user.id,
        )
        analysis = {
            "prompt": request.prompt_text,
            "blocks": [],
            "tags": []
        }

    return analysis
