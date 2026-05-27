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

        # Atomic increment — creates the key at 1 on the first hit of a window.
        count = await redis.incr(key)

        # Guarantee the key always carries an expiry. INCR never sets a TTL, so
        # without this a key created by INCR (count == 1) would live forever;
        # the counter would then wedge at the cap and 429 every request with a
        # nonsensical "try again in -1 seconds". Re-arm the expiry whenever it
        # is missing (ttl == -1) or the key is brand new (count == 1).
        ttl = await redis.ttl(key)
        if count == 1 or ttl < 0:
            await redis.expire(key, self.window_seconds)
            ttl = self.window_seconds

        if count > self.max_requests:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Try again in {ttl} seconds.",
                headers={"Retry-After": str(ttl)}
            )
    
    def update_limits(
        self,
        max_requests: int | None = None,
        window_seconds: int | None = None,
    ) -> None:
        """Update rate limit parameters at runtime."""
        if max_requests is not None:
            self.max_requests = max_requests
        if window_seconds is not None:
            self.window_seconds = window_seconds

    def to_dict(self) -> dict:
        """Serialize current config for API responses."""
        return {
            "key_prefix": self.key_prefix,
            "max_requests": self.max_requests,
            "window_seconds": self.window_seconds,
        }

    async def reset(self, identifier: str) -> None:
        """Reset rate limit for identifier (for testing or admin override)"""
        redis = await get_redis()
        key = f"ratelimit:{self.key_prefix}:{identifier}"
        await redis.delete(key)


# Predefined rate limiters for common endpoints
login_limiter = RateLimiter(key_prefix="login", max_requests=5, window_seconds=60)
job_create_limiter = RateLimiter(key_prefix="job_create", max_requests=20, window_seconds=60)


async def get_client_identifier(request: Request, principal=None) -> str:
    """
    Get client identifier for rate limiting.

    Prefers the authenticated principal so limits are per-user rather than
    per-IP (all dev traffic shares one IP, which would silently pool every
    user into a single bucket). An agent acting on behalf of a user is limited
    as that user. Falls back to IP for pre-auth endpoints (e.g. login).
    """
    # Prefer the authenticated principal passed by the route.
    if principal is not None:
        # Agents carry the delegating user in ``on_behalf_of``; real users
        # carry their own id. ``id == 0`` is the agent/system sub, so an agent
        # with no delegation still falls through to its principal id.
        effective_user_id = getattr(principal, "on_behalf_of", None) or getattr(principal, "id", None)
        if effective_user_id:
            return f"user:{effective_user_id}"

    # Legacy: user_id stashed on request state by middleware, if any.
    if hasattr(request.state, "user_id"):
        return f"user:{request.state.user_id}"

    # Fall back to IP address (unauthenticated callers).
    client_ip = request.client.host if request.client else "unknown"
    return f"ip:{client_ip}"
