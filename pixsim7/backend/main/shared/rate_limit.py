"""
Rate limiting utilities using Redis
"""
import time
from typing import Optional
from fastapi import HTTPException, Request
from pixsim7.backend.main.infrastructure.redis import get_redis


class RateLimiter:
    """
    Redis-backed rate limiter
    
    Usage:
        limiter = RateLimiter(key_prefix="login", max_requests=5, window_seconds=60)
        await limiter.check(user_id=123)  # Raises HTTPException if rate limit exceeded
    """
    
    def __init__(self, key_prefix: str, max_requests: int, window_seconds: int):
        """
        Initialize rate limiter
        
        Args:
            key_prefix: Redis key prefix (e.g., "login", "job_create")
            max_requests: Maximum requests allowed in window
            window_seconds: Time window in seconds
        """
        self.key_prefix = key_prefix
        self.max_requests = max_requests
        self.window_seconds = window_seconds
    
    async def check(self, identifier: str) -> None:
        """
        Check if request should be allowed
        
        Args:
            identifier: User ID, IP address, or other identifier
            
        Raises:
            HTTPException: 429 Too Many Requests if limit exceeded
        """
        redis = await get_redis()
        key = f"ratelimit:{self.key_prefix}:{identifier}"
        
        # Get current count
        current = await redis.get(key)
        
        if current is None:
            # First request in window
            await redis.setex(key, self.window_seconds, 1)
            return
        
        count = int(current)
        
        if count >= self.max_requests:
            # Rate limit exceeded
            ttl = await redis.ttl(key)
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Try again in {ttl} seconds.",
                headers={"Retry-After": str(ttl)}
            )
        
        # Increment counter
        await redis.incr(key)
    
    async def reset(self, identifier: str) -> None:
        """Reset rate limit for identifier (for testing or admin override)"""
        redis = await get_redis()
        key = f"ratelimit:{self.key_prefix}:{identifier}"
        await redis.delete(key)


# Predefined rate limiters for common endpoints
login_limiter = RateLimiter(key_prefix="login", max_requests=5, window_seconds=60)
job_create_limiter = RateLimiter(key_prefix="job_create", max_requests=10, window_seconds=60)


async def get_client_identifier(request: Request) -> str:
    """
    Get client identifier for rate limiting
    
    Uses authenticated user_id if available, otherwise falls back to IP address.
    """
    # Try to get user_id from request state (set by auth dependency)
    if hasattr(request.state, "user_id"):
        return f"user:{request.state.user_id}"
    
    # Fall back to IP address
    client_ip = request.client.host if request.client else "unknown"
    return f"ip:{client_ip}"
