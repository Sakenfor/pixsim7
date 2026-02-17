"""
Cache key computation helpers for generation deduplication.
"""
import logging
from typing import Dict, Any

from pixsim7.backend.main.domain import OperationType, User
from pixsim7.backend.main.services.generation.cache import GenerationCacheService

logger = logging.getLogger(__name__)


async def compute_generation_cache_key(
    cache_service: GenerationCacheService,
    user: User,
    operation_type: OperationType,
    purpose: str,
    canonical_params: Dict[str, Any],
    strategy: str,
    params: Dict[str, Any],
) -> str:
    """
    Compute cache key for generation deduplication.

    Extracts player context from params and delegates to cache service.
    """
    player_context = params.get("player_context") or {}
    if not isinstance(player_context, dict):
        player_context = {}
    playthrough_id = player_context.get("playthrough_id")
    player_id = user.id

    return await cache_service.compute_cache_key(
        operation_type=operation_type,
        purpose=purpose,
        canonical_params=canonical_params,
        strategy=strategy,
        playthrough_id=playthrough_id,
        player_id=player_id,
        version=1,  # Can be incremented for cache invalidation
    )
