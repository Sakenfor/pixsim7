"""
LLM Service - Unified AI/LLM integration for PixSim7

Provides:
- General-purpose LLM text generation
- Provider abstraction (Anthropic, OpenAI, local)
- Redis-backed response caching
- Smart cache keys with context awareness
- Cost tracking and statistics

Usage:
    from pixsim7.backend.main.services.llm import LLMService, LLMRequest

    # Initialize service
    redis_client = await get_redis()
    llm_service = LLMService(redis_client, provider="anthropic")

    # Generate text
    response = await llm_service.generate_text(
        prompt="Tell me about NPCs",
        system_prompt="You are a game developer",
        use_cache=True,
        cache_freshness=0.3
    )

    # Get cache stats
    stats = await llm_service.get_cache_stats()
    print(f"Cache hit rate: {stats.hit_rate:.2%}")
"""

from pixsim7.backend.main.services.llm.llm_service import LLMService
from pixsim7.backend.main.services.llm.llm_cache import LLMCache
from pixsim7.backend.main.services.llm.models import (
    LLMProvider,
    LLMRequest,
    LLMResponse,
    LLMCacheStats,
    CacheInvalidationRequest
)
from pixsim7.backend.main.services.llm.providers import (
    BaseLLMProvider,
    AnthropicProvider,
    OpenAIProvider,
    LocalLLMProvider,
    get_provider
)

__all__ = [
    # Main service
    "LLMService",
    "LLMCache",

    # Models
    "LLMProvider",
    "LLMRequest",
    "LLMResponse",
    "LLMCacheStats",
    "CacheInvalidationRequest",

    # Providers
    "BaseLLMProvider",
    "AnthropicProvider",
    "OpenAIProvider",
    "LocalLLMProvider",
    "get_provider"
]
