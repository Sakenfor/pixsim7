"""
LLM Service Models

Pydantic models for LLM requests and responses
"""
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from enum import Enum


class LLMProvider(str, Enum):
    """Supported LLM providers"""
    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    LOCAL = "local"


class LLMRequest(BaseModel):
    """Request for LLM text generation"""
    prompt: str = Field(..., description="The prompt to send to the LLM")
    system_prompt: Optional[str] = Field(None, description="System prompt (if supported)")
    model: Optional[str] = Field(None, description="Model to use (provider-specific)")
    max_tokens: int = Field(default=1000, ge=1, le=8000, description="Maximum tokens to generate")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0, description="Temperature for sampling")

    # Caching parameters
    use_cache: bool = Field(default=True, description="Whether to use response caching")
    cache_key: Optional[str] = Field(None, description="Custom cache key (auto-generated if None)")
    cache_ttl: int = Field(default=3600, description="Cache TTL in seconds (1 hour default)")
    cache_freshness: float = Field(default=0.0, ge=0.0, le=1.0,
                                     description="Freshness threshold (0.0=always use cache, 1.0=always regenerate)")

    # Advanced parameters
    top_p: Optional[float] = Field(None, ge=0.0, le=1.0, description="Top-p sampling")
    stop_sequences: Optional[List[str]] = Field(None, description="Stop sequences")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata for logging/tracking")


class LLMResponse(BaseModel):
    """Response from LLM generation"""
    text: str = Field(..., description="Generated text")
    provider: str = Field(..., description="Provider used")
    model: str = Field(..., description="Model used")

    # Cache info
    cached: bool = Field(..., description="Whether response was cached")
    cache_key: Optional[str] = Field(None, description="Cache key used")

    # Usage statistics
    usage: Optional[Dict[str, int]] = Field(None, description="Token usage (if available)")

    # Cost tracking
    estimated_cost: Optional[float] = Field(None, description="Estimated cost in USD")

    # Timing
    generation_time_ms: Optional[float] = Field(None, description="Generation time in milliseconds")

    # Metadata
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class LLMCacheStats(BaseModel):
    """Statistics about LLM cache"""
    total_keys: int = Field(..., description="Total number of cached responses")
    total_hits: int = Field(default=0, description="Total cache hits")
    total_misses: int = Field(default=0, description="Total cache misses")
    hit_rate: float = Field(default=0.0, description="Cache hit rate (0.0-1.0)")
    estimated_savings_usd: float = Field(default=0.0, description="Estimated cost savings from cache")
    storage_bytes: Optional[int] = Field(None, description="Approximate cache storage size")


class CacheInvalidationRequest(BaseModel):
    """Request to invalidate cache entries"""
    pattern: Optional[str] = Field(None, description="Redis key pattern to match (e.g., 'npc:*', 'dialogue:*')")
    cache_keys: Optional[List[str]] = Field(None, description="Specific cache keys to invalidate")
    invalidate_all: bool = Field(default=False, description="Invalidate all LLM cache entries")
