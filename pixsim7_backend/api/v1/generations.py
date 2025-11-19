"""
Generation API endpoints - unified generation pipeline

Handles generation requests from frontend Generation Nodes with:
- Structured generation config (strategy, constraints, style, etc.)
- Prompt versioning integration
- Social context (from Task 09)
- Validation and health checks
"""
from fastapi import APIRouter, HTTPException, Query, Request
from typing import Optional, List
from uuid import UUID

from pixsim7_backend.api.dependencies import CurrentUser, GenerationSvc, DatabaseSession
from pixsim7_backend.shared.schemas.generation_schemas import (
    CreateGenerationRequest,
    GenerationResponse,
    GenerationListResponse,
)
from pixsim7_backend.domain.enums import JobStatus, OperationType
from pixsim7_backend.shared.errors import (
    ResourceNotFoundError,
    ValidationError as DomainValidationError,
    QuotaExceededError,
)
from pixsim7_backend.shared.rate_limit import job_create_limiter, get_client_identifier
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


# ===== CREATE GENERATION =====

@router.post("/generations", response_model=GenerationResponse, status_code=201)
async def create_generation(
    request: CreateGenerationRequest,
    req: Request,
    user: CurrentUser,
    generation_service: GenerationSvc
):
    """
    Create a new generation from a Generation Node configuration

    This endpoint handles structured generation requests with:
    - Generation strategy (once, per_playthrough, per_player, always)
    - Style rules (mood, pacing, transition type)
    - Duration constraints
    - Content rating and constraints
    - Fallback configuration
    - Prompt versioning
    - Social context (intimacy, relationship state)

    Rate limited: 10 requests per 60 seconds per user/IP
    """
    # Rate limit check
    identifier = await get_client_identifier(req)
    await job_create_limiter.check(identifier)

    try:
        # Build canonical params from generation config
        canonical_params = {
            "generation_config": request.config.model_dump() if request.config else {},
            "scene_context": {
                "from_scene": request.from_scene.model_dump() if request.from_scene else None,
                "to_scene": request.to_scene.model_dump() if request.to_scene else None,
            },
            "player_context": request.player_context.model_dump() if request.player_context else None,
            "social_context": request.social_context.model_dump() if request.social_context else None,
        }

        # Determine operation type from generation type
        operation_type_map = {
            "transition": OperationType.VIDEO_TRANSITION,
            "variation": OperationType.TEXT_TO_VIDEO,
            "dialogue": OperationType.TEXT_TO_VIDEO,
            "environment": OperationType.TEXT_TO_VIDEO,
            "npc_response": OperationType.IMAGE_TO_VIDEO,
        }

        generation_type = request.config.generation_type if request.config else "transition"
        operation_type = operation_type_map.get(generation_type, OperationType.TEXT_TO_VIDEO)

        # Build prompt config if template_id or prompt_version_id provided
        prompt_config = None
        if request.prompt_version_id:
            prompt_config = {
                "versionId": str(request.prompt_version_id),
                "variables": request.template_variables or {},
                "autoSelectLatest": False,
            }
        elif request.template_id:
            # Template ID maps to a prompt family
            prompt_config = {
                "familyId": request.template_id,
                "variables": request.template_variables or {},
                "autoSelectLatest": True,
            }

        # Create generation via unified service
        generation = await generation_service.create_generation(
            user=user,
            operation_type=operation_type,
            provider_id=request.provider_id,
            params=canonical_params,
            workspace_id=request.workspace_id,
            name=request.name or f"{generation_type} generation",
            description=request.description,
            priority=request.priority,
            scheduled_at=request.scheduled_at,
            parent_generation_id=request.parent_generation_id,
            prompt_version_id=request.prompt_version_id,
        )

        # Update generation with prompt_config if we have one
        if prompt_config:
            generation.prompt_config = prompt_config
            generation.prompt_source_type = "versioned"
            await generation_service.db.commit()
            await generation_service.db.refresh(generation)

        return GenerationResponse.model_validate(generation)

    except QuotaExceededError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except DomainValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create generation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create generation: {str(e)}")


# ===== GET GENERATION =====

@router.get("/generations/{generation_id}", response_model=GenerationResponse)
async def get_generation(
    generation_id: int,
    user: CurrentUser,
    generation_service: GenerationSvc
):
    """
    Get generation by ID

    Returns full generation details including:
    - Status and lifecycle timestamps
    - Canonical parameters and inputs
    - Prompt configuration
    - Result asset (if completed)
    """
    try:
        generation = await generation_service.get_generation_for_user(generation_id, user)
        return GenerationResponse.model_validate(generation)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to get generation {generation_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get generation: {str(e)}")


# ===== LIST GENERATIONS =====

@router.get("/generations", response_model=GenerationListResponse)
async def list_generations(
    user: CurrentUser,
    generation_service: GenerationSvc,
    workspace_id: Optional[int] = Query(None),
    status: Optional[JobStatus] = Query(None),
    operation_type: Optional[OperationType] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """
    List generations for current user

    Filters:
    - workspace_id: Filter by workspace
    - status: Filter by status (pending, processing, completed, failed, cancelled)
    - operation_type: Filter by operation type
    - limit/offset: Pagination

    Returns generations ordered by priority and creation time.
    """
    try:
        generations = await generation_service.list_generations(
            user=user,
            workspace_id=workspace_id,
            status=status,
            operation_type=operation_type,
            limit=limit,
            offset=offset,
        )

        total = await generation_service.count_generations(
            user=user,
            workspace_id=workspace_id,
            status=status,
            operation_type=operation_type,
        )

        return GenerationListResponse(
            generations=[GenerationResponse.model_validate(g) for g in generations],
            total=total,
            limit=limit,
            offset=offset,
        )
    except Exception as e:
        logger.error(f"Failed to list generations: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list generations: {str(e)}")


# ===== CANCEL GENERATION =====

@router.post("/generations/{generation_id}/cancel", response_model=GenerationResponse)
async def cancel_generation(
    generation_id: int,
    user: CurrentUser,
    generation_service: GenerationSvc
):
    """
    Cancel a pending or processing generation

    Attempts to cancel the generation both locally and on the provider.
    Only the generation owner or admin can cancel.
    """
    try:
        generation = await generation_service.cancel_generation(generation_id, user)
        return GenerationResponse.model_validate(generation)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to cancel generation {generation_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to cancel generation: {str(e)}")


# ===== VALIDATE GENERATION CONFIG =====

@router.post("/generations/validate")
async def validate_generation_config(
    request: CreateGenerationRequest,
    user: CurrentUser,
):
    """
    Validate a generation configuration without creating it

    Returns validation errors, warnings, and suggestions.
    Useful for editor-time validation of Generation Nodes.
    """
    errors = []
    warnings = []
    suggestions = []

    try:
        if not request.config:
            errors.append("Generation config is required")
            return {
                "valid": False,
                "errors": errors,
                "warnings": warnings,
                "suggestions": suggestions,
            }

        config = request.config

        # Validate duration constraints
        if config.duration:
            if config.duration.min and config.duration.max and config.duration.min > config.duration.max:
                errors.append("Duration min cannot be greater than max")
            if config.duration.target and config.duration.min and config.duration.target < config.duration.min:
                errors.append("Duration target cannot be less than min")
            if config.duration.target and config.duration.max and config.duration.target > config.duration.max:
                errors.append("Duration target cannot be greater than max")

            # Warnings for unusual durations
            if config.duration.max and config.duration.max > 60:
                warnings.append("Duration max > 60s may be expensive")

        # Validate strategy + cost warnings
        if config.strategy == "always":
            warnings.append("Strategy 'always' regenerates on every playthrough - may be expensive")
            if config.duration.max and config.duration.max > 30:
                errors.append("Strategy 'always' with duration > 30s is not recommended")

        # Validate fallback configuration
        if config.fallback:
            if config.fallback.mode == "default_content" and not config.fallback.default_content_id:
                errors.append("Fallback mode 'default_content' requires default_content_id")
            if config.fallback.mode == "retry" and (not config.fallback.max_retries or config.fallback.max_retries < 1):
                errors.append("Fallback mode 'retry' requires max_retries >= 1")
            if config.fallback.timeout_ms and config.fallback.timeout_ms < 1000:
                errors.append("Fallback timeout must be at least 1000ms")

        # Validate constraints
        if config.constraints:
            if config.constraints.required_elements and config.constraints.avoid_elements:
                intersection = set(config.constraints.required_elements) & set(config.constraints.avoid_elements)
                if intersection:
                    errors.append(f"Elements cannot be both required and avoided: {', '.join(intersection)}")

        # Suggestions
        if not config.template_id and not request.prompt_version_id:
            suggestions.append("Consider specifying a template_id or prompt_version_id for consistent prompts")

        if config.strategy == "once" and not config.seed_source:
            suggestions.append("Strategy 'once' without seed_source may produce non-deterministic results")

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
            "suggestions": suggestions,
        }

    except Exception as e:
        logger.error(f"Validation error: {e}", exc_info=True)
        return {
            "valid": False,
            "errors": [f"Validation failed: {str(e)}"],
            "warnings": warnings,
            "suggestions": suggestions,
        }
