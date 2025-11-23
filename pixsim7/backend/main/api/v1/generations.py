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

from pixsim7.backend.main.api.dependencies import CurrentUser, GenerationSvc, DatabaseSession
from pixsim7.backend.main.shared.schemas.generation_schemas import (
    CreateGenerationRequest,
    GenerationResponse,
    GenerationListResponse,
)
from pixsim7.backend.main.services.generation.social_context_builder import (
    build_generation_social_context,
)
from pixsim7.backend.main.domain.enums import GenerationStatus, OperationType
from pixsim7.backend.main.shared.errors import (
    ResourceNotFoundError,
    ValidationError as DomainValidationError,
    QuotaExceededError,
)
from pixsim7.backend.main.shared.rate_limit import job_create_limiter, get_client_identifier
import logging
from pydantic import BaseModel, Field

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
        # Build or enrich social context if world_id and session_id available
        social_context_dict = None
        if request.social_context:
            social_context_dict = request.social_context.model_dump()
        elif request.player_context and request.player_context.playthrough_id:
            # Try to build social context from session if available
            # This requires knowing the world_id and npc_id, which may come from scene context
            # For now, just use provided social context
            pass

        # Build canonical params from generation config
        canonical_params = {
            "generation_config": request.config.model_dump() if request.config else {},
            "scene_context": {
                "from_scene": request.from_scene.model_dump() if request.from_scene else None,
                "to_scene": request.to_scene.model_dump() if request.to_scene else None,
            },
            "player_context": request.player_context.model_dump() if request.player_context else None,
            "social_context": social_context_dict,
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


# ===== SIMPLE IMAGE-TO-VIDEO GENERATION (LEGACY-FRIENDLY) =====

class SimpleImageToVideoRequest(BaseModel):
  """Minimal request for quick image-to-video generations.

  This is designed for thin clients (e.g., Chrome extension) that only have
  an image URL and a freeform prompt, and don't need full GenerationNodeConfig.
  """
  provider_id: str = Field(..., min_length=1, max_length=50)
  prompt: str = Field(..., min_length=1, max_length=4096)
  image_url: str = Field(..., min_length=1, max_length=2048)
  name: Optional[str] = Field(None, max_length=255)
  priority: int = Field(7, ge=0, le=10)


@router.post("/generations/simple-image-to-video", response_model=GenerationResponse, status_code=201)
async def create_simple_image_to_video(
    request: SimpleImageToVideoRequest,
    req: Request,
    user: CurrentUser,
    generation_service: GenerationSvc,
):
  """Create a simple IMAGE_TO_VIDEO generation from raw prompt + image URL.

  This endpoint intentionally uses the legacy flat parameter format so that:
  - `prompt` and `image_url` are validated at the service layer
  - Canonicalization keeps `prompt`/`image_url` as top-level fields
  - Input extraction can derive a `seed_image` input from `image_url`

  It is primarily intended for tooling like the Chrome extension's Quick Generate.
  """
  # Rate limit check (reuse same limiter)
  identifier = await get_client_identifier(req)
  await job_create_limiter.check(identifier)

  try:
    params = {
      "prompt": request.prompt,
      "image_url": request.image_url,
    }

    generation = await generation_service.create_generation(
      user=user,
      operation_type=OperationType.IMAGE_TO_VIDEO,
      provider_id=request.provider_id,
      params=params,
      workspace_id=None,
      name=request.name or f"Quick image-to-video",
      description=None,
      priority=request.priority,
      scheduled_at=None,
      parent_generation_id=None,
      prompt_version_id=None,
    )

    return GenerationResponse.model_validate(generation)

  except QuotaExceededError as e:
    raise HTTPException(status_code=429, detail=str(e))
  except DomainValidationError as e:
    raise HTTPException(status_code=400, detail=str(e))
  except Exception as e:
    logger.error(f"Failed to create simple image-to-video generation: {e}", exc_info=True)
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
    status: Optional[GenerationStatus] = Query(None),
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


# ===== RETRY GENERATION =====

@router.post("/generations/{generation_id}/retry", response_model=GenerationResponse)
async def retry_generation(
    generation_id: int,
    user: CurrentUser,
    generation_service: GenerationSvc
):
    """
    Retry a failed generation

    Creates a new generation with the same parameters as the failed one.
    Useful for generations that failed due to:
    - Content filtering (romantic/erotic content that might pass on retry)
    - Temporary provider errors
    - Rate limits

    Only the generation owner or admin can retry.
    Maximum retry attempts per generation are limited by server configuration
    (settings.auto_retry_max_attempts, default: 10).
    """
    try:
        new_generation = await generation_service.retry_generation(generation_id, user)
        return GenerationResponse.model_validate(new_generation)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to retry generation {generation_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retry generation: {str(e)}")


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


# ===== BUILD SOCIAL CONTEXT =====

@router.post("/generations/social-context/build")
async def build_social_context(
    world_id: int = Query(..., description="World ID for schema lookup"),
    session_id: Optional[int] = Query(None, description="Game session ID for relationship state"),
    npc_id: Optional[str] = Query(None, description="NPC ID for relationship lookup"),
    user_max_rating: Optional[str] = Query(None, description="User's maximum content rating"),
    db: DatabaseSession = None,
    user: CurrentUser = None,
):
    """
    Build GenerationSocialContext from relationship state

    This helper endpoint builds social context from:
    - Relationship metrics (affinity, trust, chemistry, tension)
    - World schemas (relationship tiers, intimacy levels)
    - World and user content rating preferences

    Useful for frontend/game-core to get social context before creating a generation.

    Returns GenerationSocialContext dict with:
    - intimacyLevelId: Computed intimacy level ID
    - relationshipTierId: Computed relationship tier ID
    - intimacyBand: Simplified intimacy band
    - contentRating: Content rating (clamped by world/user)
    - worldMaxRating: World's max rating
    - userMaxRating: User's max rating (if provided)
    - relationshipValues: Raw relationship values used
    """
    try:
        context = await build_generation_social_context(
            db=db,
            world_id=world_id,
            session_id=session_id,
            npc_id=npc_id,
            user_max_rating=user_max_rating,
        )
        return context
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to build social context: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to build social context: {str(e)}")


# ===== PHASE 7: TELEMETRY ENDPOINTS =====

@router.get("/generations/telemetry/providers")
async def get_provider_health_metrics(
    user: CurrentUser
):
    """
    Get health metrics for all providers (Phase 7)

    Returns aggregated metrics including:
    - Success rates
    - Latency percentiles (p50, p95, p99)
    - Total costs and token usage
    - Error counts

    Useful for monitoring provider performance and debugging.
    """
    try:
        telemetry = GenerationTelemetryService()
        health_data = await telemetry.get_all_provider_health()
        return {"providers": health_data}
    except Exception as e:
        logger.error(f"Failed to get provider health: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get provider health: {str(e)}")


@router.get("/generations/telemetry/providers/{provider_id}")
async def get_provider_health(
    provider_id: str,
    user: CurrentUser
):
    """
    Get health metrics for a specific provider (Phase 7)

    Returns:
    - total_generations: Total number of generations
    - completed/failed: Success and failure counts
    - success_rate: Success rate (0.0 - 1.0)
    - latency_p50/p95/p99: Latency percentiles in seconds
    - total_tokens: Total tokens used
    - total_cost_usd: Total estimated cost
    - avg_cost_per_generation: Average cost per generation
    """
    try:
        telemetry = GenerationTelemetryService()
        health = await telemetry.get_provider_health(provider_id)
        return health
    except Exception as e:
        logger.error(f"Failed to get provider health for {provider_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get provider health: {str(e)}")


@router.get("/generations/telemetry/operations/{operation_type}")
async def get_operation_metrics(
    operation_type: OperationType,
    user: CurrentUser
):
    """
    Get metrics for a specific operation type (Phase 7)

    Returns similar structure to provider health, aggregated by operation type.
    """
    try:
        telemetry = GenerationTelemetryService()
        metrics = await telemetry.get_operation_metrics(operation_type)
        return metrics
    except Exception as e:
        logger.error(f"Failed to get operation metrics for {operation_type.value}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get operation metrics: {str(e)}")


@router.get("/generations/cache/stats")
async def get_cache_stats(
    user: CurrentUser
):
    """
    Get generation cache statistics (Phase 6)

    Returns:
    - total_cached_generations: Number of cached generations
    - redis_connected: Redis connection status
    """
    try:
        cache = GenerationCacheService()
        stats = await cache.get_cache_stats()
        return stats
    except Exception as e:
        logger.error(f"Failed to get cache stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get cache stats: {str(e)}")


# ===== CACHE MANAGEMENT ENDPOINTS =====

@router.delete("/generations/cache/{cache_key}")
async def invalidate_cache_key(
    cache_key: str,
    user: CurrentUser
):
    """
    Invalidate specific cache key

    Args:
        cache_key: Cache key to invalidate (e.g., from cache check response)

    Returns:
        Success status and whether key was deleted
    """
    try:
        cache = GenerationCacheService()
        deleted = await cache.invalidate_cache(cache_key)
        return {"success": True, "deleted": deleted, "cache_key": cache_key}
    except Exception as e:
        logger.error(f"Failed to invalidate cache key {cache_key}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to invalidate cache: {str(e)}")


@router.post("/generations/cache/check")
async def check_cache(
    request: Request,
    user: CurrentUser
):
    """
    Check if generation would be cached (without creating it)

    Request body should match CacheCheckRequest schema.

    Returns CacheCheckResponse with:
    - cached: boolean
    - generation_id: ID if cached
    - cache_key: computed cache key
    - ttl_seconds: remaining TTL if cached
    """
    try:
        from pixsim7.backend.main.shared.schemas.telemetry_schemas import CacheCheckRequest, CacheCheckResponse
        from pixsim7.backend.main.domain.enums import OperationType as OpType

        body = await request.json()
        check_req = CacheCheckRequest(**body)

        cache = GenerationCacheService()

        # Compute cache key
        cache_key = await cache.compute_cache_key(
            operation_type=OpType(check_req.operation_type),
            purpose=check_req.purpose,
            canonical_params=check_req.canonical_params,
            strategy=check_req.strategy,
            playthrough_id=check_req.playthrough_id,
            player_id=check_req.player_id,
            version=check_req.version,
        )

        # Check if cached
        generation_id = await cache.get_cached_generation(cache_key)

        # Get TTL if cached
        ttl_seconds = None
        if generation_id:
            from pixsim7.backend.main.infrastructure.redis import get_redis
            redis_client = await get_redis()
            ttl_seconds = await redis_client.ttl(cache_key)

        return CacheCheckResponse(
            cached=generation_id is not None,
            generation_id=generation_id,
            cache_key=cache_key,
            ttl_seconds=ttl_seconds if ttl_seconds and ttl_seconds > 0 else None,
        )

    except Exception as e:
        logger.error(f"Failed to check cache: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to check cache: {str(e)}")


# ===== REDIS HEALTH CHECK =====

@router.get("/health/redis")
async def redis_health_check():
    """
    Check Redis connection health

    Returns:
    - connected: boolean
    - latency_ms: ping latency in milliseconds
    """
    try:
        from pixsim7.backend.main.infrastructure.redis import get_redis
        import time

        redis_client = await get_redis()

        # Measure ping latency
        start = time.time()
        await redis_client.ping()
        latency_ms = (time.time() - start) * 1000

        return {
            "connected": True,
            "latency_ms": round(latency_ms, 2),
            "status": "healthy"
        }

    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        return {
            "connected": False,
            "latency_ms": None,
            "status": "unhealthy",
            "error": str(e)
        }
