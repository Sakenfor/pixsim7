"""
Worker health tracking module

Provides heartbeat and health monitoring for ARQ workers.
"""
import time
from datetime import datetime, timezone
from typing import Dict, Any, Optional
import platform
import psutil

from pixsim_logging import configure_logging
from pixsim7.backend.main.infrastructure.queue import (
    GENERATION_FRESH_QUEUE_NAME,
    GENERATION_RETRY_QUEUE_NAME,
    SIMULATION_SCHEDULER_QUEUE_NAME,
)

logger = configure_logging("worker.health").bind(channel="cron")

# Redis keys for health tracking
WORKER_ROLE_MAIN = "main"
WORKER_ROLE_RETRY = "retry"
WORKER_ROLE_SIMULATION = "simulation"
WORKER_ROLES = (
    WORKER_ROLE_MAIN,
    WORKER_ROLE_RETRY,
    WORKER_ROLE_SIMULATION,
)

WORKER_HEARTBEAT_KEY_TEMPLATE = "arq:worker:{role}:heartbeat"
WORKER_STATS_KEY_TEMPLATE = "arq:worker:{role}:stats"

# Backward compatibility with previous single-key worker health.
LEGACY_WORKER_HEARTBEAT_KEY = "arq:worker:heartbeat"
LEGACY_WORKER_STATS_KEY = "arq:worker:stats"
HEARTBEAT_TTL = 120  # 2 minutes - if no heartbeat, worker is considered down


class WorkerHealth:
    """Worker health tracking"""

    def __init__(self):
        self.start_time = time.time()
        self.processed_jobs = 0
        self.failed_jobs = 0
        self.process = psutil.Process()

    def increment_processed(self):
        """Increment processed job counter"""
        self.processed_jobs += 1

    def increment_failed(self):
        """Increment failed job counter"""
        self.failed_jobs += 1

    def get_uptime_seconds(self) -> float:
        """Get worker uptime in seconds"""
        return time.time() - self.start_time

    def get_memory_usage_mb(self) -> float:
        """Get worker memory usage in MB"""
        try:
            mem_info = self.process.memory_info()
            return mem_info.rss / 1024 / 1024
        except Exception:
            return 0.0

    def get_cpu_percent(self) -> float:
        """Get worker CPU usage percentage"""
        try:
            return self.process.cpu_percent(interval=0.1)
        except Exception:
            return 0.0

    def to_dict(self) -> Dict[str, Any]:
        """Convert health data to dictionary"""
        return {
            "uptime_seconds": self.get_uptime_seconds(),
            "processed_jobs": self.processed_jobs,
            "failed_jobs": self.failed_jobs,
            "memory_mb": self.get_memory_usage_mb(),
            "cpu_percent": self.get_cpu_percent(),
        }


# Global health tracker instance
_health_tracker: Optional[WorkerHealth] = None


def get_health_tracker() -> WorkerHealth:
    """Get or create the global health tracker"""
    global _health_tracker
    if _health_tracker is None:
        _health_tracker = WorkerHealth()
    return _health_tracker


async def update_heartbeat(ctx: dict) -> None:
    """
    Update worker heartbeat in Redis

    Called periodically by ARQ cron to signal worker is alive.
    Stores heartbeat timestamp and worker stats.
    """
    await update_main_heartbeat(ctx)


def _normalize_worker_role(worker_role: Optional[str]) -> str:
    """Normalize worker role for keying."""
    role = (worker_role or WORKER_ROLE_MAIN).strip().lower()
    if role not in WORKER_ROLES:
        return WORKER_ROLE_MAIN
    return role


def _worker_heartbeat_key(worker_role: str) -> str:
    return WORKER_HEARTBEAT_KEY_TEMPLATE.format(role=_normalize_worker_role(worker_role))


def _worker_stats_key(worker_role: str) -> str:
    return WORKER_STATS_KEY_TEMPLATE.format(role=_normalize_worker_role(worker_role))


async def _update_worker_heartbeat(ctx: dict, worker_role: str) -> None:
    try:
        from pixsim7.backend.main.infrastructure.redis import get_redis

        redis = await get_redis()
        health = get_health_tracker()
        normalized_role = _normalize_worker_role(worker_role)

        # Current timestamp
        now = datetime.now(timezone.utc)

        # Heartbeat data
        heartbeat_data = {
            "timestamp": now.isoformat(),
            "uptime_seconds": health.get_uptime_seconds(),
            "hostname": platform.node(),
            "python_version": platform.python_version(),
            "platform": platform.platform(),
            "worker_role": normalized_role,
        }

        # Stats data
        stats_data = {
            "processed_jobs": health.processed_jobs,
            "failed_jobs": health.failed_jobs,
            "memory_mb": health.get_memory_usage_mb(),
            "cpu_percent": health.get_cpu_percent(),
            "success_rate": (
                health.processed_jobs / (health.processed_jobs + health.failed_jobs)
                if (health.processed_jobs + health.failed_jobs) > 0
                else 1.0
            ),
        }

        # Store in Redis with TTL
        import json
        heartbeat_key = _worker_heartbeat_key(normalized_role)
        stats_key = _worker_stats_key(normalized_role)
        await redis.setex(
            heartbeat_key,
            HEARTBEAT_TTL,
            json.dumps(heartbeat_data)
        )
        await redis.setex(
            stats_key,
            HEARTBEAT_TTL,
            json.dumps(stats_data)
        )

        # Preserve legacy keys for main worker to avoid breaking older readers.
        if normalized_role == WORKER_ROLE_MAIN:
            await redis.setex(
                LEGACY_WORKER_HEARTBEAT_KEY,
                HEARTBEAT_TTL,
                json.dumps(heartbeat_data)
            )
            await redis.setex(
                LEGACY_WORKER_STATS_KEY,
                HEARTBEAT_TTL,
                json.dumps(stats_data)
            )

        logger.debug(
            "worker_heartbeat",
            role=normalized_role,
            uptime=health.get_uptime_seconds(),
            processed=health.processed_jobs,
            failed=health.failed_jobs,
        )

    except Exception as e:
        logger.error(f"Failed to update worker heartbeat: {e}")


async def update_main_heartbeat(ctx: dict) -> None:
    await _update_worker_heartbeat(ctx, WORKER_ROLE_MAIN)


async def update_retry_heartbeat(ctx: dict) -> None:
    await _update_worker_heartbeat(ctx, WORKER_ROLE_RETRY)


async def update_simulation_heartbeat(ctx: dict) -> None:
    await _update_worker_heartbeat(ctx, WORKER_ROLE_SIMULATION)


async def get_worker_health(
    worker_role: str = WORKER_ROLE_MAIN,
    allow_legacy_fallback: bool = True,
) -> Optional[Dict[str, Any]]:
    """
    Get current worker health from Redis

    Returns:
        Worker health data or None if worker is down
    """
    try:
        from pixsim7.backend.main.infrastructure.redis import get_redis
        import json

        redis = await get_redis()
        normalized_role = _normalize_worker_role(worker_role)
        heartbeat_key = _worker_heartbeat_key(normalized_role)
        stats_key = _worker_stats_key(normalized_role)

        # Get heartbeat
        heartbeat_raw = await redis.get(heartbeat_key)
        stats_raw = await redis.get(stats_key)

        if (
            not heartbeat_raw
            and normalized_role == WORKER_ROLE_MAIN
            and allow_legacy_fallback
        ):
            # Support previous single-key schema.
            heartbeat_raw = await redis.get(LEGACY_WORKER_HEARTBEAT_KEY)
            stats_raw = await redis.get(LEGACY_WORKER_STATS_KEY)

        if not heartbeat_raw:
            return None  # Worker is down (no heartbeat)

        heartbeat = json.loads(heartbeat_raw)
        stats = json.loads(stats_raw) if stats_raw else {}

        # Combine data
        return {
            **heartbeat,
            **stats,
            "worker_role": heartbeat.get("worker_role", normalized_role),
            "status": "running",
            "healthy": True,
        }

    except Exception as e:
        logger.error(f"Failed to get worker health: {e}")
        return None


async def get_worker_family_health() -> Dict[str, Optional[Dict[str, Any]]]:
    """Get health for main, retry, and simulation workers."""
    results: Dict[str, Optional[Dict[str, Any]]] = {}
    for role in WORKER_ROLES:
        results[role] = await get_worker_health(
            worker_role=role,
            allow_legacy_fallback=(role == WORKER_ROLE_MAIN),
        )
    return results


async def get_queue_stats() -> Dict[str, Any]:
    """
    Get ARQ queue statistics from Redis

    Returns:
        Queue statistics including pending, in_progress, and completed jobs
    """
    try:
        from pixsim7.backend.main.infrastructure.redis import get_redis

        redis = await get_redis()

        # Pending jobs can exist in fresh, retry, or legacy default queue names.
        pending_fresh = await redis.llen(GENERATION_FRESH_QUEUE_NAME)
        pending_retry = await redis.llen(GENERATION_RETRY_QUEUE_NAME)
        pending_simulation = await redis.llen(SIMULATION_SCHEDULER_QUEUE_NAME)
        pending_legacy = await redis.llen("arq:queue:default")
        pending = pending_fresh + pending_retry + pending_simulation + pending_legacy

        # ARQ in-progress keying differs by version/configuration.
        # Use the most complete available count to avoid under-reporting.
        in_progress_global = await redis.zcard("arq:in-progress")
        in_progress_fresh = await redis.zcard(f"arq:in-progress:{GENERATION_FRESH_QUEUE_NAME}")
        in_progress_retry = await redis.zcard(f"arq:in-progress:{GENERATION_RETRY_QUEUE_NAME}")
        in_progress_simulation = await redis.zcard(f"arq:in-progress:{SIMULATION_SCHEDULER_QUEUE_NAME}")
        in_progress = max(in_progress_global, in_progress_fresh + in_progress_retry + in_progress_simulation)

        # Count completed jobs in last hour (from results)
        # ARQ stores results with keys like "arq:result:{job_id}"
        result_keys = []
        async for key in redis.scan_iter(match="arq:result:*", count=100):
            result_keys.append(key)

        completed_count = len(result_keys)

        # Get failed jobs (if any tracking exists)
        # Note: ARQ doesn't track failed jobs by default, but we can check logs

        return {
            "pending": pending,
            "pending_fresh": pending_fresh,
            "pending_retry": pending_retry,
            "pending_simulation": pending_simulation,
            "pending_legacy": pending_legacy,
            "in_progress": in_progress,
            "completed_recent": completed_count,
            "total_tracked": pending + in_progress + completed_count,
        }

    except Exception as e:
        logger.error(f"Failed to get queue stats: {e}")
        return {
            "pending": 0,
            "in_progress": 0,
            "completed_recent": 0,
            "total_tracked": 0,
            "error": str(e),
        }
