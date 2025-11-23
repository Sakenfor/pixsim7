"""
Telemetry and metrics schemas

Provides type-safe models for generation telemetry and cost tracking.
"""
from typing import Optional
from pydantic import BaseModel, Field


class CostData(BaseModel):
    """
    Cost data for a generation

    Extracted from provider responses and used for telemetry tracking.
    """
    tokens_used: int = Field(default=0, description="Total tokens used (for LLM-based providers)")
    estimated_cost_usd: float = Field(default=0.0, description="Estimated cost in USD")
    compute_seconds: Optional[float] = Field(default=None, description="Compute time in seconds")
    provider_credits: Optional[float] = Field(default=None, description="Provider-specific credits used")

    # Provider-specific fields
    input_tokens: Optional[int] = Field(default=None, description="Input tokens (for LLMs)")
    output_tokens: Optional[int] = Field(default=None, description="Output tokens (for LLMs)")
    video_seconds: Optional[float] = Field(default=None, description="Video duration generated")
    resolution: Optional[str] = Field(default=None, description="Output resolution (e.g., '1920x1080')")


class ProviderHealthMetrics(BaseModel):
    """Provider health metrics from telemetry"""
    provider_id: str
    total_generations: int
    completed: int
    failed: int
    success_rate: float = Field(ge=0.0, le=1.0, description="Success rate (0.0-1.0)")
    latency_p50: Optional[float] = Field(default=None, description="Median latency in seconds")
    latency_p95: Optional[float] = Field(default=None, description="95th percentile latency")
    latency_p99: Optional[float] = Field(default=None, description="99th percentile latency")
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    avg_cost_per_generation: float = 0.0


class OperationMetrics(BaseModel):
    """Operation type metrics from telemetry"""
    operation_type: str
    total_generations: int
    completed: int
    failed: int
    success_rate: float = Field(ge=0.0, le=1.0)
    latency_p50: Optional[float] = None
    latency_p95: Optional[float] = None
    latency_p99: Optional[float] = None
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    avg_cost_per_generation: float = 0.0


class CacheStats(BaseModel):
    """Cache statistics"""
    total_cached_generations: int
    cache_hits_24h: int = 0
    cache_misses_24h: int = 0
    hit_rate_24h: float = Field(ge=0.0, le=1.0, default=0.0)
    redis_connected: bool
    total_keys: Optional[int] = None
    memory_used_mb: Optional[float] = None


class TelemetryAlert(BaseModel):
    """Telemetry alert configuration and status"""
    alert_id: str
    alert_type: str  # 'success_rate', 'latency', 'cost', 'error_rate'
    provider_id: Optional[str] = None
    operation_type: Optional[str] = None
    threshold_value: float
    comparison: str  # 'less_than', 'greater_than', 'equals'
    current_value: Optional[float] = None
    is_triggered: bool = False
    message: Optional[str] = None


class CacheCheckRequest(BaseModel):
    """Request to check if generation would be cached"""
    operation_type: str
    purpose: str
    canonical_params: dict
    strategy: str = "once"
    playthrough_id: Optional[str] = None
    player_id: Optional[int] = None
    version: int = 1


class CacheCheckResponse(BaseModel):
    """Response from cache check"""
    cached: bool
    generation_id: Optional[int] = None
    cache_key: str
    ttl_seconds: Optional[int] = None
    estimated_age_seconds: Optional[int] = None
