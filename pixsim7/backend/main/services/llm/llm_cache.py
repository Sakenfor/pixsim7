"""
LLM Response Cache

Redis-backed caching for LLM responses with smart cache keys and adjustable freshness
"""
import hashlib
import json
import random
from typing import Optional, Dict, Any
import logging
from redis.asyncio import Redis

from pixsim7.backend.main.services.llm.models import LLMRequest, LLMResponse, LLMCacheStats

logger = logging.getLogger(__name__)


class LLMCache:
    """
    Redis-backed cache for LLM responses

    Features:
    - Smart cache key generation (hash prompt + context)
    - Adjustable freshness threshold (probabilistic cache bypass)
    - TTL support
    - Cache statistics and cost tracking
    """

    # Cache key prefix
    CACHE_PREFIX = "llm:cache:"
    STATS_KEY = "llm:cache:stats"

    def __init__(self, redis_client: Redis):
        self.redis = redis_client

    def generate_cache_key(
        self,
        request: LLMRequest,
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Generate smart cache key based on request and context

        Args:
            request: LLM request
            context: Additional context (NPC personality, relationship state, etc.)

        Returns:
            Cache key string
        """
        # Use custom cache key if provided
        if request.cache_key:
            return f"{self.CACHE_PREFIX}{request.cache_key}"

        # Build hash input from request
        hash_input = {
            "prompt": request.prompt,
            "system_prompt": request.system_prompt,
            "model": request.model,
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
        }

        # Add context if provided (e.g., NPC personality, relationship state)
        if context:
            hash_input["context"] = context

        # Create deterministic hash
        hash_str = json.dumps(hash_input, sort_keys=True)
        cache_hash = hashlib.md5(hash_str.encode()).hexdigest()

        return f"{self.CACHE_PREFIX}{cache_hash}"

    def should_use_cache(self, freshness: float) -> bool:
        """
        Determine if cache should be used based on freshness threshold

        Args:
            freshness: Freshness threshold (0.0-1.0)
                      0.0 = always use cache if available
                      0.5 = 50% chance to bypass cache
                      1.0 = always bypass cache (regenerate)

        Returns:
            True if cache should be used, False to regenerate
        """
        if freshness >= 1.0:
            return False  # Always regenerate
        if freshness <= 0.0:
            return True   # Always use cache

        # Probabilistic: higher freshness = more likely to regenerate
        return random.random() > freshness

    async def get(
        self,
        request: LLMRequest,
        context: Optional[Dict[str, Any]] = None
    ) -> Optional[LLMResponse]:
        """
        Get cached response if available

        Args:
            request: LLM request
            context: Additional context for cache key

        Returns:
            Cached response or None
        """
        if not request.use_cache:
            return None

        # Check freshness threshold
        if not self.should_use_cache(request.cache_freshness):
            logger.debug(f"Cache bypassed due to freshness threshold: {request.cache_freshness}")
            await self._increment_stat("misses")
            return None

        cache_key = self.generate_cache_key(request, context)

        try:
            cached_data = await self.redis.get(cache_key)
            if cached_data:
                # Parse cached response
                response_dict = json.loads(cached_data)
                response = LLMResponse(**response_dict)

                # Mark as cached
                response.cached = True
                response.cache_key = cache_key

                # Update stats
                await self._increment_stat("hits")
                if response.estimated_cost:
                    await self._increment_stat("savings_usd", response.estimated_cost)

                logger.info(f"Cache HIT: {cache_key[:16]}... (saved ${response.estimated_cost:.4f})")
                return response
            else:
                await self._increment_stat("misses")
                return None

        except Exception as e:
            logger.error(f"Cache get error: {e}")
            return None

    async def set(
        self,
        request: LLMRequest,
        response: LLMResponse,
        context: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Cache response

        Args:
            request: Original request
            response: Response to cache
            context: Additional context for cache key
        """
        if not request.use_cache:
            return

        cache_key = self.generate_cache_key(request, context)

        try:
            # Store response as JSON
            response_dict = response.model_dump()
            await self.redis.setex(
                cache_key,
                request.cache_ttl,
                json.dumps(response_dict)
            )

            logger.info(f"Cache SET: {cache_key[:16]}... (TTL: {request.cache_ttl}s)")

        except Exception as e:
            logger.error(f"Cache set error: {e}")

    async def invalidate(
        self,
        pattern: Optional[str] = None,
        cache_keys: Optional[list[str]] = None,
        invalidate_all: bool = False
    ) -> int:
        """
        Invalidate cache entries

        Args:
            pattern: Redis key pattern (e.g., 'llm:cache:*npc*')
            cache_keys: Specific cache keys to invalidate
            invalidate_all: Invalidate all LLM cache entries

        Returns:
            Number of keys deleted
        """
        deleted = 0

        try:
            if invalidate_all:
                # Delete all cache entries
                pattern = f"{self.CACHE_PREFIX}*"
                keys = []
                async for key in self.redis.scan_iter(match=pattern):
                    keys.append(key)

                if keys:
                    deleted = await self.redis.delete(*keys)

            elif pattern:
                # Delete by pattern
                full_pattern = f"{self.CACHE_PREFIX}{pattern}"
                keys = []
                async for key in self.redis.scan_iter(match=full_pattern):
                    keys.append(key)

                if keys:
                    deleted = await self.redis.delete(*keys)

            elif cache_keys:
                # Delete specific keys
                full_keys = [f"{self.CACHE_PREFIX}{k}" if not k.startswith(self.CACHE_PREFIX) else k
                             for k in cache_keys]
                if full_keys:
                    deleted = await self.redis.delete(*full_keys)

            logger.info(f"Cache invalidated: {deleted} keys deleted")
            return deleted

        except Exception as e:
            logger.error(f"Cache invalidation error: {e}")
            return 0

    async def get_stats(self) -> LLMCacheStats:
        """
        Get cache statistics

        Returns:
            Cache statistics
        """
        try:
            # Get total cached keys
            total_keys = 0
            async for _ in self.redis.scan_iter(match=f"{self.CACHE_PREFIX}*"):
                total_keys += 1

            # Get stats from Redis
            stats_data = await self.redis.hgetall(self.STATS_KEY)

            hits = int(stats_data.get("hits", 0))
            misses = int(stats_data.get("misses", 0))
            savings_usd = float(stats_data.get("savings_usd", 0.0))

            total_requests = hits + misses
            hit_rate = hits / total_requests if total_requests > 0 else 0.0

            return LLMCacheStats(
                total_keys=total_keys,
                total_hits=hits,
                total_misses=misses,
                hit_rate=hit_rate,
                estimated_savings_usd=savings_usd
            )

        except Exception as e:
            logger.error(f"Error getting cache stats: {e}")
            return LLMCacheStats(total_keys=0)

    async def _increment_stat(self, stat_name: str, value: float = 1.0) -> None:
        """
        Increment cache statistics

        Args:
            stat_name: Name of stat (hits, misses, savings_usd)
            value: Value to increment by
        """
        try:
            await self.redis.hincrbyfloat(self.STATS_KEY, stat_name, value)
        except Exception as e:
            logger.error(f"Error incrementing stat {stat_name}: {e}")

    async def clear_stats(self) -> None:
        """Clear cache statistics"""
        try:
            await self.redis.delete(self.STATS_KEY)
            logger.info("Cache stats cleared")
        except Exception as e:
            logger.error(f"Error clearing stats: {e}")
