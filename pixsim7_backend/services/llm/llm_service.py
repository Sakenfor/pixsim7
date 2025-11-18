"""
LLM Service

General-purpose LLM service for text generation across the application.
Provides unified interface, caching, and cost tracking.

Usage:
    from pixsim7_backend.services.llm import LLMService

    llm_service = LLMService(redis_client, provider="anthropic")

    response = await llm_service.generate_text(
        prompt="Hello, how are you?",
        system_prompt="You are a helpful assistant",
        use_cache=True,
        cache_freshness=0.3
    )
"""
import logging
from typing import Optional, Dict, Any
from redis.asyncio import Redis

from pixsim7_backend.services.llm.models import (
    LLMProvider,
    LLMRequest,
    LLMResponse,
    LLMCacheStats,
    CacheInvalidationRequest
)
from pixsim7_backend.services.llm.providers import get_provider, BaseLLMProvider
from pixsim7_backend.services.llm.llm_cache import LLMCache

logger = logging.getLogger(__name__)


class LLMService:
    """
    General-purpose LLM service

    Features:
    - Provider abstraction (Anthropic, OpenAI, local LLMs)
    - Redis-backed response caching
    - Smart cache keys with context awareness
    - Adjustable freshness threshold
    - Cost tracking and statistics
    - Streaming support (future)
    """

    def __init__(
        self,
        redis_client: Redis,
        provider: str = "anthropic",
        api_key: Optional[str] = None
    ):
        """
        Initialize LLM service

        Args:
            redis_client: Redis client for caching
            provider: Provider to use ("anthropic", "openai", "local")
            api_key: Optional API key (uses env var if not provided)
        """
        self.redis = redis_client
        self.cache = LLMCache(redis_client)

        # Initialize provider
        provider_enum = LLMProvider(provider)
        self.provider: BaseLLMProvider = get_provider(provider_enum, api_key)

        logger.info(f"LLMService initialized with provider: {provider}")

    async def generate(
        self,
        request: LLMRequest,
        context: Optional[Dict[str, Any]] = None
    ) -> LLMResponse:
        """
        Generate text from prompt with caching

        Args:
            request: LLM request
            context: Additional context for cache key generation
                    (e.g., {"npc_id": 12, "relationship_state": {...}})

        Returns:
            LLM response
        """
        # Try to get from cache
        if request.use_cache:
            cached_response = await self.cache.get(request, context)
            if cached_response:
                return cached_response

        # Generate new response
        response = await self.provider.generate(request)

        # Cache the response
        if request.use_cache:
            await self.cache.set(request, response, context)

        return response

    async def generate_text(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 1000,
        temperature: float = 0.7,
        use_cache: bool = True,
        cache_key: Optional[str] = None,
        cache_ttl: int = 3600,
        cache_freshness: float = 0.0,
        context: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Simple text generation (convenience method)

        Args:
            prompt: User prompt
            system_prompt: System prompt
            model: Model to use (provider-specific, uses default if None)
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            use_cache: Whether to use caching
            cache_key: Custom cache key
            cache_ttl: Cache TTL in seconds
            cache_freshness: Freshness threshold (0.0-1.0)
            context: Additional context for cache key
            metadata: Additional metadata

        Returns:
            Generated text
        """
        request = LLMRequest(
            prompt=prompt,
            system_prompt=system_prompt,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            use_cache=use_cache,
            cache_key=cache_key,
            cache_ttl=cache_ttl,
            cache_freshness=cache_freshness,
            metadata=metadata or {}
        )

        response = await self.generate(request, context)
        return response.text

    async def get_cache_stats(self) -> LLMCacheStats:
        """
        Get cache statistics

        Returns:
            Cache statistics
        """
        return await self.cache.get_stats()

    async def invalidate_cache(
        self,
        pattern: Optional[str] = None,
        cache_keys: Optional[list[str]] = None,
        invalidate_all: bool = False
    ) -> int:
        """
        Invalidate cache entries

        Args:
            pattern: Redis key pattern (e.g., '*npc:12*')
            cache_keys: Specific cache keys to invalidate
            invalidate_all: Invalidate all LLM cache entries

        Returns:
            Number of keys deleted
        """
        return await self.cache.invalidate(pattern, cache_keys, invalidate_all)

    async def clear_cache_stats(self) -> None:
        """Clear cache statistics"""
        await self.cache.clear_stats()

    # Provider-specific methods

    def get_provider_name(self) -> str:
        """Get current provider name"""
        return self.provider.__class__.__name__

    def get_default_model(self) -> str:
        """Get default model for current provider"""
        return self.provider.get_default_model()

    def estimate_cost(self, usage: Dict[str, int]) -> float:
        """
        Estimate cost for token usage

        Args:
            usage: Token usage dict

        Returns:
            Estimated cost in USD
        """
        return self.provider.estimate_cost(usage)
