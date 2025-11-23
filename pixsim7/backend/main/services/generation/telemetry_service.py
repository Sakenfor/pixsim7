"""
GenerationTelemetryService - Metrics and monitoring for generations

Implements Phase 7: Telemetry (Cost, Latency, Provider Health)

Features:
- Cost tracking (tokens, compute time)
- Latency metrics (p50, p95, p99)
- Provider health monitoring
- Failure pattern detection
- Redis-based metrics aggregation
"""
import logging
import time
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from collections import defaultdict
import statistics

from pixsim7.backend.main.infrastructure.redis import get_redis
from pixsim7.backend.main.domain import Generation, GenerationStatus, OperationType
from pixsim7.backend.main.shared.schemas.telemetry_schemas import (
    CostData,
    ProviderHealthMetrics,
    OperationMetrics,
    TelemetryAlert,
)

logger = logging.getLogger(__name__)


class GenerationTelemetryService:
    """
    Telemetry service for generation metrics

    Tracks:
    - Cost (tokens, API calls, compute time)
    - Latency (percentiles, averages)
    - Provider health (success rate, error patterns)
    - Operation type performance
    """

    def __init__(self):
        self._redis = None

    async def _get_redis(self):
        """Lazy load Redis client"""
        if self._redis is None:
            self._redis = await get_redis()
        return self._redis

    async def record_generation_metrics(
        self,
        generation: Generation,
        cost_data: Optional[CostData] = None
    ) -> None:
        """
        Record metrics for a completed generation

        Args:
            generation: Completed generation
            cost_data: Optional cost information:
                {
                    "tokens_used": 1000,
                    "estimated_cost_usd": 0.05,
                    "compute_seconds": 45.3
                }
        """
        if not generation.is_terminal:
            logger.warning(f"Attempted to record metrics for non-terminal generation {generation.id}")
            return

        try:
            redis_client = await self._get_redis()

            # Compute latency
            latency_seconds = generation.duration_seconds or 0

            # Build metrics payload
            metrics = {
                "generation_id": generation.id,
                "operation_type": generation.operation_type.value,
                "provider_id": generation.provider_id,
                "status": generation.status.value,
                "latency_seconds": latency_seconds,
                "timestamp": generation.completed_at.isoformat() if generation.completed_at else datetime.utcnow().isoformat(),
            }

            # Add cost data if available
            if cost_data:
                metrics.update({
                    "tokens_used": cost_data.tokens_used,
                    "estimated_cost_usd": cost_data.estimated_cost_usd,
                    "compute_seconds": cost_data.compute_seconds or latency_seconds,
                    "input_tokens": cost_data.input_tokens,
                    "output_tokens": cost_data.output_tokens,
                })

            # Store individual metric (for detailed analysis)
            metric_key = f"generation:metrics:{generation.id}"
            await redis_client.setex(
                metric_key,
                86400 * 7,  # Keep for 7 days
                str(metrics)
            )

            # Update aggregated metrics
            await self._update_aggregated_metrics(
                provider_id=generation.provider_id,
                operation_type=generation.operation_type,
                status=generation.status,
                latency=latency_seconds,
                cost_data=cost_data
            )

            logger.debug(f"Recorded metrics for generation {generation.id}: {latency_seconds:.2f}s")

        except Exception as e:
            logger.error(f"Failed to record metrics for generation {generation.id}: {e}")

    async def _update_aggregated_metrics(
        self,
        provider_id: str,
        operation_type: OperationType,
        status: GenerationStatus,
        latency: float,
        cost_data: Optional[CostData] = None
    ) -> None:
        """
        Update aggregated metrics for provider/operation

        Maintains rolling windows for latency percentiles and success rates
        """
        try:
            redis_client = await self._get_redis()

            # Key prefixes for different aggregations
            provider_prefix = f"generation:agg:provider:{provider_id}"
            operation_prefix = f"generation:agg:operation:{operation_type.value}"

            # Increment counters
            await redis_client.hincrby(f"{provider_prefix}:counters", "total", 1)
            await redis_client.hincrby(f"{operation_prefix}:counters", "total", 1)

            if status == GenerationStatus.COMPLETED:
                await redis_client.hincrby(f"{provider_prefix}:counters", "completed", 1)
                await redis_client.hincrby(f"{operation_prefix}:counters", "completed", 1)
            elif status == GenerationStatus.FAILED:
                await redis_client.hincrby(f"{provider_prefix}:counters", "failed", 1)
                await redis_client.hincrby(f"{operation_prefix}:counters", "failed", 1)

            # Store latency sample (for percentile calculation)
            # Use sorted sets with timestamp as score for time-windowing
            timestamp = time.time()
            await redis_client.zadd(
                f"{provider_prefix}:latencies",
                {str(latency): timestamp}
            )
            await redis_client.zadd(
                f"{operation_prefix}:latencies",
                {str(latency): timestamp}
            )

            # Trim old latency samples (keep last 24 hours)
            cutoff = timestamp - (86400)
            await redis_client.zremrangebyscore(
                f"{provider_prefix}:latencies",
                "-inf",
                cutoff
            )
            await redis_client.zremrangebyscore(
                f"{operation_prefix}:latencies",
                "-inf",
                cutoff
            )

            # Store cost data if available
            if cost_data:
                if cost_data.tokens_used > 0:
                    await redis_client.hincrbyfloat(f"{provider_prefix}:counters", "total_tokens", cost_data.tokens_used)
                    await redis_client.hincrbyfloat(f"{operation_prefix}:counters", "total_tokens", cost_data.tokens_used)

                if cost_data.estimated_cost_usd > 0:
                    await redis_client.hincrbyfloat(f"{provider_prefix}:counters", "total_cost_usd", cost_data.estimated_cost_usd)
                    await redis_client.hincrbyfloat(f"{operation_prefix}:counters", "total_cost_usd", cost_data.estimated_cost_usd)

        except Exception as e:
            logger.error(f"Failed to update aggregated metrics: {e}")

    async def get_provider_health(
        self,
        provider_id: str
    ) -> ProviderHealthMetrics:
        """
        Get health metrics for a specific provider

        Returns:
            {
                "total_generations": 100,
                "completed": 95,
                "failed": 5,
                "success_rate": 0.95,
                "latency_p50": 12.5,
                "latency_p95": 45.2,
                "latency_p99": 78.3,
                "total_tokens": 50000,
                "total_cost_usd": 2.50,
                "avg_cost_per_generation": 0.025
            }
        """
        try:
            redis_client = await self._get_redis()
            prefix = f"generation:agg:provider:{provider_id}"

            # Get counters
            counters = await redis_client.hgetall(f"{prefix}:counters")
            total = int(counters.get("total", 0))
            completed = int(counters.get("completed", 0))
            failed = int(counters.get("failed", 0))
            total_tokens = float(counters.get("total_tokens", 0))
            total_cost_usd = float(counters.get("total_cost_usd", 0))

            # Calculate success rate
            success_rate = completed / total if total > 0 else 0

            # Get latency percentiles
            latencies = await redis_client.zrange(f"{prefix}:latencies", 0, -1)
            latency_values = [float(l) for l in latencies]

            latency_p50 = None
            latency_p95 = None
            latency_p99 = None

            if latency_values:
                latency_values_sorted = sorted(latency_values)
                latency_p50 = statistics.median(latency_values_sorted)

                if len(latency_values_sorted) >= 20:  # Need enough samples
                    p95_idx = int(len(latency_values_sorted) * 0.95)
                    p99_idx = int(len(latency_values_sorted) * 0.99)
                    latency_p95 = latency_values_sorted[p95_idx]
                    latency_p99 = latency_values_sorted[p99_idx]

            return ProviderHealthMetrics(
                provider_id=provider_id,
                total_generations=total,
                completed=completed,
                failed=failed,
                success_rate=round(success_rate, 4),
                latency_p50=round(latency_p50, 2) if latency_p50 else None,
                latency_p95=round(latency_p95, 2) if latency_p95 else None,
                latency_p99=round(latency_p99, 2) if latency_p99 else None,
                total_tokens=int(total_tokens),
                total_cost_usd=round(total_cost_usd, 4),
                avg_cost_per_generation=round(total_cost_usd / total, 4) if total > 0 else 0,
            )

        except Exception as e:
            logger.error(f"Failed to get provider health for {provider_id}: {e}")
            # Return empty metrics on error
            return ProviderHealthMetrics(
                provider_id=provider_id,
                total_generations=0,
                completed=0,
                failed=0,
                success_rate=0.0,
            )

    async def get_operation_metrics(
        self,
        operation_type: OperationType
    ) -> OperationMetrics:
        """
        Get metrics for a specific operation type

        Returns similar structure to get_provider_health
        """
        try:
            redis_client = await self._get_redis()
            prefix = f"generation:agg:operation:{operation_type.value}"

            # Get counters
            counters = await redis_client.hgetall(f"{prefix}:counters")
            total = int(counters.get("total", 0))
            completed = int(counters.get("completed", 0))
            failed = int(counters.get("failed", 0))
            total_tokens = float(counters.get("total_tokens", 0))
            total_cost_usd = float(counters.get("total_cost_usd", 0))

            # Calculate success rate
            success_rate = completed / total if total > 0 else 0

            # Get latency percentiles
            latencies = await redis_client.zrange(f"{prefix}:latencies", 0, -1)
            latency_values = [float(l) for l in latencies]

            latency_p50 = None
            latency_p95 = None
            latency_p99 = None

            if latency_values:
                latency_values_sorted = sorted(latency_values)
                latency_p50 = statistics.median(latency_values_sorted)

                if len(latency_values_sorted) >= 20:
                    p95_idx = int(len(latency_values_sorted) * 0.95)
                    p99_idx = int(len(latency_values_sorted) * 0.99)
                    latency_p95 = latency_values_sorted[p95_idx]
                    latency_p99 = latency_values_sorted[p99_idx]

            return OperationMetrics(
                operation_type=operation_type.value,
                total_generations=total,
                completed=completed,
                failed=failed,
                success_rate=round(success_rate, 4),
                latency_p50=round(latency_p50, 2) if latency_p50 else None,
                latency_p95=round(latency_p95, 2) if latency_p95 else None,
                latency_p99=round(latency_p99, 2) if latency_p99 else None,
                total_tokens=int(total_tokens),
                total_cost_usd=round(total_cost_usd, 4),
                avg_cost_per_generation=round(total_cost_usd / total, 4) if total > 0 else 0,
            )

        except Exception as e:
            logger.error(f"Failed to get operation metrics for {operation_type.value}: {e}")
            return OperationMetrics(
                operation_type=operation_type.value,
                total_generations=0,
                completed=0,
                failed=0,
                success_rate=0.0,
            )

    async def get_all_provider_health(
        self
    ) -> List[ProviderHealthMetrics]:
        """
        Get health metrics for all providers

        Returns list of provider health dictionaries
        """
        try:
            redis_client = await self._get_redis()

            # Find all provider keys
            cursor = 0
            provider_ids = set()
            pattern = "generation:agg:provider:*:counters"

            while True:
                cursor, keys = await redis_client.scan(
                    cursor=cursor,
                    match=pattern,
                    count=100
                )

                for key in keys:
                    # Extract provider_id from key
                    # Key format: "generation:agg:provider:{provider_id}:counters"
                    parts = key.split(":")
                    if len(parts) >= 4:
                        provider_ids.add(parts[3])

                if cursor == 0:
                    break

            # Get health for each provider
            health_results = []
            for provider_id in provider_ids:
                health = await self.get_provider_health(provider_id)
                health_results.append(health)

            # Sort by total generations (most active first)
            health_results.sort(key=lambda x: x.get("total_generations", 0), reverse=True)

            return health_results

        except Exception as e:
            logger.error(f"Failed to get all provider health: {e}")
            return []

    async def record_provider_error(
        self,
        provider_id: str,
        error_type: str,
        error_message: str
    ) -> None:
        """
        Record provider error for pattern detection

        Args:
            provider_id: Provider that errored
            error_type: Error category (rate_limit, timeout, api_error, etc.)
            error_message: Error details
        """
        try:
            redis_client = await self._get_redis()
            error_key = f"generation:errors:provider:{provider_id}:{error_type}"

            # Increment error counter
            await redis_client.hincrby(error_key, "count", 1)

            # Store recent error message (for debugging)
            await redis_client.hset(error_key, "last_error", error_message)
            await redis_client.hset(error_key, "last_seen", datetime.utcnow().isoformat())

            # Set expiration (keep for 7 days)
            await redis_client.expire(error_key, 86400 * 7)

            logger.info(f"Recorded error for provider {provider_id}: {error_type}")

        except Exception as e:
            logger.error(f"Failed to record provider error: {e}")
