"""Regression tests for the Redis-backed RateLimiter.

These guard the self-healing-TTL behaviour. A previous implementation used
``INCR`` without ever re-applying an expiry, so if a key was ever created (or
left) without a TTL it would wedge at the cap forever and 429 every request
with a nonsensical "try again in -1 seconds".
"""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from pixsim7.backend.main.shared import rate_limit
from pixsim7.backend.main.shared.rate_limit import RateLimiter, get_client_identifier


class FakeRedis:
    """Minimal async Redis double covering the ops RateLimiter.check uses."""

    def __init__(self):
        self.vals: dict[str, int] = {}
        self.exp: dict[str, int] = {}

    async def incr(self, key: str) -> int:
        self.vals[key] = int(self.vals.get(key, 0)) + 1
        return self.vals[key]

    async def ttl(self, key: str) -> int:
        if key not in self.vals:
            return -2  # key does not exist
        return self.exp.get(key, -1)  # -1 == exists but no expiry

    async def expire(self, key: str, seconds: int) -> bool:
        if key not in self.vals:
            return False
        self.exp[key] = seconds
        return True

    async def delete(self, key: str) -> None:
        self.vals.pop(key, None)
        self.exp.pop(key, None)


@pytest.fixture
def fake_redis(monkeypatch):
    redis = FakeRedis()

    async def _get_redis():
        return redis

    monkeypatch.setattr(rate_limit, "get_redis", _get_redis)
    return redis


@pytest.mark.asyncio
async def test_allows_up_to_limit_then_rejects(fake_redis):
    limiter = RateLimiter(key_prefix="test", max_requests=3, window_seconds=60)

    # First three requests pass.
    for _ in range(3):
        await limiter.check("user:1")

    # Fourth is rejected.
    with pytest.raises(HTTPException) as exc:
        await limiter.check("user:1")
    assert exc.value.status_code == 429


@pytest.mark.asyncio
async def test_first_request_sets_expiry(fake_redis):
    limiter = RateLimiter(key_prefix="test", max_requests=3, window_seconds=60)
    await limiter.check("user:1")
    assert await fake_redis.ttl("ratelimit:test:user:1") == 60


@pytest.mark.asyncio
async def test_self_heals_key_left_without_ttl(fake_redis):
    """A key wedged at the cap with no TTL must recover, not 429 with -1."""
    limiter = RateLimiter(key_prefix="test", max_requests=3, window_seconds=60)
    key = "ratelimit:test:user:1"

    # Simulate the wedged state: count at/over cap, no expiry (ttl == -1).
    fake_redis.vals[key] = 5

    with pytest.raises(HTTPException) as exc:
        await limiter.check("user:1")

    # The expiry is re-armed and the Retry-After is sane (never negative).
    assert await fake_redis.ttl(key) == 60
    assert exc.value.headers["Retry-After"] == "60"
    assert "-1" not in exc.value.detail


@pytest.mark.asyncio
async def test_reset_clears_counter(fake_redis):
    limiter = RateLimiter(key_prefix="test", max_requests=1, window_seconds=60)
    await limiter.check("user:1")
    with pytest.raises(HTTPException):
        await limiter.check("user:1")

    await limiter.reset("user:1")

    # After reset the window starts fresh.
    await limiter.check("user:1")


def _fake_request(host="127.0.0.1"):
    return SimpleNamespace(state=SimpleNamespace(), client=SimpleNamespace(host=host))


@pytest.mark.asyncio
async def test_identifier_prefers_real_user_id():
    principal = SimpleNamespace(id=5, on_behalf_of=None)
    assert await get_client_identifier(_fake_request(), principal) == "user:5"


@pytest.mark.asyncio
async def test_identifier_uses_on_behalf_of_for_agents():
    # Agent sub is id=0, delegating to user 1 — limited as user 1, not the agent.
    principal = SimpleNamespace(id=0, on_behalf_of=1)
    assert await get_client_identifier(_fake_request(), principal) == "user:1"


@pytest.mark.asyncio
async def test_identifier_falls_back_to_ip_without_principal():
    assert await get_client_identifier(_fake_request("10.0.0.9")) == "ip:10.0.0.9"
