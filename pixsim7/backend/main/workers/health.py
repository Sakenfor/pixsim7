"""
Worker health tracking module

Provides heartbeat and health monitoring for ARQ workers.
"""
import os
import time
from datetime import datetime, timezone
from typing import Dict, Any, Optional
import platform
import psutil

from pixsim_logging import configure_logging

logger = configure_logging("worker.health")

# Redis keys for health tracking
WORKER_HEARTBEAT_KEY = "arq:worker:heartbeat"
WORKER_STATS_KEY = "arq:worker:stats"
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
    try:
        from pixsim7.backend.main.infrastructure.redis import get_redis

        redis = await get_redis()
        health = get_health_tracker()

        # Current timestamp
        now = datetime.now(timezone.utc)

        # Heartbeat data
        heartbeat_data = {
            "timestamp": now.isoformat(),
            "uptime_seconds": health.get_uptime_seconds(),
            "hostname": platform.node(),
            "python_version": platform.python_version(),
            "platform": platform.platform(),
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
        await redis.setex(
            WORKER_HEARTBEAT_KEY,
            HEARTBEAT_TTL,
            json.dumps(heartbeat_data)
        )
        await redis.setex(
            WORKER_STATS_KEY,
            HEARTBEAT_TTL,
            json.dumps(stats_data)
        )

        logger.debug(
            "worker_heartbeat",
            uptime=health.get_uptime_seconds(),
            processed=health.processed_jobs,
            failed=health.failed_jobs,
        )

    except Exception as e:
        logger.error(f"Failed to update worker heartbeat: {e}")


async def get_worker_health() -> Optional[Dict[str, Any]]:
    """
    Get current worker health from Redis

    Returns:
        Worker health data or None if worker is down
    """
    try:
        from pixsim7.backend.main.infrastructure.redis import get_redis
        import json

        redis = await get_redis()

        # Get heartbeat
        heartbeat_raw = await redis.get(WORKER_HEARTBEAT_KEY)
        stats_raw = await redis.get(WORKER_STATS_KEY)

        if not heartbeat_raw:
            return None  # Worker is down (no heartbeat)

        heartbeat = json.loads(heartbeat_raw)
        stats = json.loads(stats_raw) if stats_raw else {}

        # Combine data
        return {
            **heartbeat,
            **stats,
            "status": "running",
            "healthy": True,
        }

    except Exception as e:
        logger.error(f"Failed to get worker health: {e}")
        return None


async def get_queue_stats() -> Dict[str, Any]:
    """
    Get ARQ queue statistics from Redis

    Returns:
        Queue statistics including pending, in_progress, and completed jobs
    """
    try:
        from pixsim7.backend.main.infrastructure.redis import get_redis

        redis = await get_redis()

        # Get queue length (pending jobs)
        queue_length = await redis.llen("arq:queue:default")

        # Get in-progress jobs (ARQ uses a sorted set for in-progress)
        in_progress = await redis.zcard("arq:in-progress")

        # Count completed jobs in last hour (from results)
        # ARQ stores results with keys like "arq:result:{job_id}"
        result_keys = []
        async for key in redis.scan_iter(match="arq:result:*", count=100):
            result_keys.append(key)

        completed_count = len(result_keys)

        # Get failed jobs (if any tracking exists)
        # Note: ARQ doesn't track failed jobs by default, but we can check logs

        return {
            "pending": queue_length,
            "in_progress": in_progress,
            "completed_recent": completed_count,
            "total_tracked": queue_length + in_progress + completed_count,
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
