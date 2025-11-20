"""
LLM Cache Management API endpoints.

Provides cache statistics, invalidation, and management functionality.
"""

from typing import Dict, Any

from fastapi import APIRouter, Depends

from pixsim7_backend.api.dependencies import CurrentUser, get_llm_service, LLMSvc
from pixsim7_backend.services.llm import LLMService, LLMCacheStats, CacheInvalidationRequest


router = APIRouter()


@router.get("/cache/stats", response_model=LLMCacheStats)
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


@router.post("/cache/invalidate")
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


@router.post("/cache/clear-stats")
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
