"""
Redis client management

Provides Redis connection for:
- Caching
- Session storage
- ARQ job queue
"""
import logging
from typing import Optional
import redis.asyncio as redis
from arq import create_pool
from arq.connections import ArqRedis, RedisSettings
from pixsim7_backend.shared.config import settings

logger = logging.getLogger(__name__)

# Global instances
_redis_client: Optional[redis.Redis] = None
_arq_pool: Optional[ArqRedis] = None


async def get_redis() -> redis.Redis:
    """
    Get Redis client instance

    Returns a singleton Redis client for caching and general use.

    Usage:
        redis_client = await get_redis()
        await redis_client.set("key", "value")
        value = await redis_client.get("key")
    """
    global _redis_client

    if _redis_client is None:
        logger.info(f"Connecting to Redis: {settings.redis_url}")
        _redis_client = await redis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True
        )
        logger.info("✅ Redis connected")

    return _redis_client


async def get_arq_pool() -> ArqRedis:
    """
    Get ARQ Redis pool for job queueing

    Returns a singleton ARQ pool for enqueuing background jobs.

    Usage:
        arq_pool = await get_arq_pool()
        await arq_pool.enqueue_job("process_job", job_id=123)
    """
    global _arq_pool

    if _arq_pool is None:
        logger.info(f"Creating ARQ pool: {settings.redis_url}")
        _arq_pool = await create_pool(
            RedisSettings.from_dsn(settings.redis_url)
        )
        logger.info("✅ ARQ pool created")

    return _arq_pool


async def close_redis() -> None:
    """
    Close Redis connections

    Call this during application shutdown to cleanly close connections.
    """
    global _redis_client, _arq_pool

    if _redis_client:
        logger.info("Closing Redis client")
        await _redis_client.close()
        _redis_client = None

    if _arq_pool:
        logger.info("Closing ARQ pool")
        await _arq_pool.close()
        _arq_pool = None

    logger.info("✅ Redis connections closed")


async def check_redis_connection() -> bool:
    """
    Check if Redis is available

    Returns:
        True if Redis is accessible, False otherwise
    """
    try:
        redis_client = await get_redis()
        await redis_client.ping()
        return True
    except Exception as e:
        logger.error(f"Redis connection check failed: {e}")
        return False
