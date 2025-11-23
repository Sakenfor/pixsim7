"""
GenerationCacheService - Redis caching for generation results

Implements Phase 6: Caching, Determinism & Seed Strategy

Features:
- Cache key computation based on canonical params and seed strategy
- Redis cache layer with TTL management
- Deduplication via reproducible hashes
- Seed strategy enforcement (playthrough, player, fixed, timestamp)
- Cache stampede prevention via distributed locking
"""
import logging
import json
import hashlib
from typing import Optional, Dict, Any, List
from datetime import timedelta
from uuid import UUID

from pixsim7.backend.main.infrastructure.redis import get_redis
from pixsim7.backend.main.domain import Generation, OperationType

logger = logging.getLogger(__name__)

# Cache TTLs by strategy
CACHE_TTL_BY_STRATEGY = {
    "once": timedelta(days=365),         # Permanent (1 year)
    "per_playthrough": timedelta(days=90),  # Playthrough-scoped
    "per_player": timedelta(days=180),      # Player-scoped
    "always": None,                          # No cache
}

# Lock TTL for preventing stampedes (30 seconds)
LOCK_TTL = 30


class GenerationCacheService:
    """
    Generation cache service with Redis backend

    Provides:
    - Cache key computation from canonical params
    - Get/set generation results with TTL
    - Deduplication via reproducible hash
    - Distributed locking for cache stampede prevention
    """

    def __init__(self):
        self._redis = None

    async def _get_redis(self):
        """Lazy load Redis client"""
        if self._redis is None:
            self._redis = await get_redis()
        return self._redis

    async def compute_cache_key(
        self,
        operation_type: OperationType,
        purpose: str,
        canonical_params: Dict[str, Any],
        strategy: str = "once",
        playthrough_id: Optional[str] = None,
        player_id: Optional[int] = None,
        version: int = 1,
    ) -> str:
        """
        Compute cache key for generation

        Format (from DYNAMIC_GENERATION_FOUNDATION.md):
            [type]|[purpose]|[fromSceneId]|[toSceneId]|[strategy]|[seed]|[version]

        Args:
            operation_type: Operation type (text_to_video, etc.)
            purpose: Generation purpose (gap_fill, npc_response, etc.)
            canonical_params: Canonical generation parameters
            strategy: Seed strategy (once, per_playthrough, per_player, always)
            playthrough_id: Playthrough seed (for per_playthrough strategy)
            player_id: Player ID (for per_player strategy)
            version: Cache version for invalidation

        Returns:
            Cache key string
        """
        # Extract scene references from canonical params
        scene_context = canonical_params.get("scene_context", {})
        from_scene = scene_context.get("from_scene", {})
        to_scene = scene_context.get("to_scene", {})
        from_scene_id = from_scene.get("id", "none")
        to_scene_id = to_scene.get("id", "none")

        # Build base key
        parts = [
            operation_type.value,
            purpose,
            str(from_scene_id),
            str(to_scene_id),
            strategy,
        ]

        # Add seed component based on strategy
        if strategy == "per_playthrough":
            if not playthrough_id:
                logger.warning("per_playthrough strategy requires playthrough_id")
            parts.append(f"pt:{playthrough_id or 'unknown'}")
        elif strategy == "per_player":
            if not player_id:
                logger.warning("per_player strategy requires player_id")
            parts.append(f"player:{player_id or 'unknown'}")
        elif strategy == "always":
            # No seed - should not be cached
            logger.warning("cache key computed for 'always' strategy - should not cache")
        # 'once' strategy has no seed component

        # Add version for cache invalidation
        parts.append(f"v{version}")

        # Join with pipe delimiter
        cache_key = "|".join(parts)

        # Add namespace prefix
        return f"generation:{cache_key}"

    async def get_cached_generation(
        self,
        cache_key: str
    ) -> Optional[int]:
        """
        Get cached generation ID by cache key

        Args:
            cache_key: Cache key from compute_cache_key()

        Returns:
            Generation ID if cached, None otherwise
        """
        try:
            redis_client = await self._get_redis()
            cached_value = await redis_client.get(cache_key)

            if cached_value:
                logger.info(f"Cache HIT: {cache_key}")
                # Track cache hits for stats
                await redis_client.incr("generation:stats:cache_hits_24h")
                return int(cached_value)

            logger.debug(f"Cache MISS: {cache_key}")
            # Track cache misses for stats
            await redis_client.incr("generation:stats:cache_misses_24h")
            return None

        except Exception as e:
            logger.error(f"Cache lookup failed for {cache_key}: {e}")
            return None

    async def cache_generation(
        self,
        cache_key: str,
        generation_id: int,
        strategy: str = "once"
    ) -> None:
        """
        Cache generation ID with TTL based on strategy

        Args:
            cache_key: Cache key from compute_cache_key()
            generation_id: Generation ID to cache
            strategy: Seed strategy (determines TTL)
        """
        if strategy == "always":
            logger.debug("Skipping cache for 'always' strategy")
            return

        try:
            redis_client = await self._get_redis()
            ttl = CACHE_TTL_BY_STRATEGY.get(strategy)

            if ttl:
                await redis_client.setex(
                    cache_key,
                    int(ttl.total_seconds()),
                    str(generation_id)
                )
                logger.info(f"Cached generation {generation_id} with TTL {ttl}: {cache_key}")

                # Increment cache stats counter for performance
                await redis_client.incr("generation:stats:total_cached")
            else:
                logger.warning(f"No TTL defined for strategy '{strategy}', skipping cache")

        except Exception as e:
            logger.error(f"Cache write failed for {cache_key}: {e}")

    async def invalidate_cache(
        self,
        cache_key: str
    ) -> bool:
        """
        Invalidate cached generation

        Args:
            cache_key: Cache key to invalidate

        Returns:
            True if key was deleted, False otherwise
        """
        try:
            redis_client = await self._get_redis()
            deleted = await redis_client.delete(cache_key)
            if deleted:
                logger.info(f"Cache invalidated: {cache_key}")
                # Decrement total cached counter
                await redis_client.decr("generation:stats:total_cached")
            return bool(deleted)

        except Exception as e:
            logger.error(f"Cache invalidation failed for {cache_key}: {e}")
            return False

    async def acquire_lock(
        self,
        cache_key: str,
        timeout: int = LOCK_TTL
    ) -> bool:
        """
        Acquire distributed lock to prevent cache stampede

        Args:
            cache_key: Cache key to lock
            timeout: Lock timeout in seconds

        Returns:
            True if lock acquired, False if already locked
        """
        lock_key = f"{cache_key}:lock"

        try:
            redis_client = await self._get_redis()
            # SET NX (only if not exists) with expiration
            acquired = await redis_client.set(
                lock_key,
                "1",
                nx=True,
                ex=timeout
            )

            if acquired:
                logger.debug(f"Lock acquired: {lock_key}")
            else:
                logger.debug(f"Lock already held: {lock_key}")

            return bool(acquired)

        except Exception as e:
            logger.error(f"Lock acquisition failed for {lock_key}: {e}")
            # On error, assume lock not acquired (fail safe)
            return False

    async def release_lock(
        self,
        cache_key: str
    ) -> None:
        """
        Release distributed lock

        Args:
            cache_key: Cache key to unlock
        """
        lock_key = f"{cache_key}:lock"

        try:
            redis_client = await self._get_redis()
            await redis_client.delete(lock_key)
            logger.debug(f"Lock released: {lock_key}")

        except Exception as e:
            logger.error(f"Lock release failed for {lock_key}: {e}")

    async def find_by_hash(
        self,
        reproducible_hash: str
    ) -> Optional[int]:
        """
        Find generation by reproducible hash (deduplication)

        Args:
            reproducible_hash: Hash from Generation.compute_hash()

        Returns:
            Generation ID if duplicate found, None otherwise
        """
        hash_key = f"generation:hash:{reproducible_hash}"

        try:
            redis_client = await self._get_redis()
            cached_value = await redis_client.get(hash_key)

            if cached_value:
                logger.info(f"Deduplication HIT: hash {reproducible_hash[:16]}...")
                return int(cached_value)

            return None

        except Exception as e:
            logger.error(f"Hash lookup failed for {reproducible_hash}: {e}")
            return None

    async def store_hash(
        self,
        reproducible_hash: str,
        generation_id: int,
        ttl: timedelta = timedelta(days=90)
    ) -> None:
        """
        Store generation hash for deduplication

        Args:
            reproducible_hash: Hash from Generation.compute_hash()
            generation_id: Generation ID
            ttl: Time to live (default 90 days)
        """
        hash_key = f"generation:hash:{reproducible_hash}"

        try:
            redis_client = await self._get_redis()
            await redis_client.setex(
                hash_key,
                int(ttl.total_seconds()),
                str(generation_id)
            )
            logger.debug(f"Stored hash {reproducible_hash[:16]}... → generation {generation_id}")

        except Exception as e:
            logger.error(f"Hash storage failed for {reproducible_hash}: {e}")

    async def get_cache_stats(
        self
    ) -> Dict[str, Any]:
        """
        Get cache statistics (optimized with counters)

        Returns:
            Dictionary with cache stats (hit rate, size, etc.)
        """
        try:
            redis_client = await self._get_redis()

            # Get cached count from counter (much faster than SCAN)
            total_cached = await redis_client.get("generation:stats:total_cached")
            total_cached = int(total_cached) if total_cached else 0

            # Get hit/miss stats for 24h
            hits_24h = await redis_client.get("generation:stats:cache_hits_24h")
            misses_24h = await redis_client.get("generation:stats:cache_misses_24h")

            hits_24h = int(hits_24h) if hits_24h else 0
            misses_24h = int(misses_24h) if misses_24h else 0

            # Calculate hit rate
            total_requests_24h = hits_24h + misses_24h
            hit_rate_24h = hits_24h / total_requests_24h if total_requests_24h > 0 else 0

            return {
                "total_cached_generations": total_cached,
                "cache_hits_24h": hits_24h,
                "cache_misses_24h": misses_24h,
                "hit_rate_24h": round(hit_rate_24h, 4),
                "redis_connected": True,
            }

        except Exception as e:
            logger.error(f"Failed to get cache stats: {e}")
            return {
                "redis_connected": False,
                "error": str(e)
            }
