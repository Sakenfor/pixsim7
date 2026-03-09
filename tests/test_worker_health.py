import json

import pytest

from pixsim7.backend.main.workers import health as wh


class _FakeRedis:
    def __init__(self):
        self.values: dict[str, str] = {}

    async def setex(self, key: str, ttl: int, value: str):
        self.values[key] = value

    async def get(self, key: str):
        return self.values.get(key)


@pytest.fixture(autouse=True)
def _reset_health_tracker():
    wh._health_tracker = None
    yield
    wh._health_tracker = None


@pytest.mark.asyncio
async def test_update_main_heartbeat_writes_role_and_legacy_keys(monkeypatch):
    fake_redis = _FakeRedis()

    async def _fake_get_redis():
        return fake_redis

    monkeypatch.setattr(
        "pixsim7.backend.main.infrastructure.redis.get_redis",
        _fake_get_redis,
    )

    await wh.update_main_heartbeat({})

    assert "arq:worker:main:heartbeat" in fake_redis.values
    assert "arq:worker:main:stats" in fake_redis.values
    assert "arq:worker:heartbeat" in fake_redis.values
    assert "arq:worker:stats" in fake_redis.values

    heartbeat_payload = json.loads(fake_redis.values["arq:worker:main:heartbeat"])
    assert heartbeat_payload["worker_role"] == "main"


@pytest.mark.asyncio
async def test_update_retry_and_simulation_heartbeats_use_role_keys(monkeypatch):
    fake_redis = _FakeRedis()

    async def _fake_get_redis():
        return fake_redis

    monkeypatch.setattr(
        "pixsim7.backend.main.infrastructure.redis.get_redis",
        _fake_get_redis,
    )

    await wh.update_retry_heartbeat({})
    await wh.update_simulation_heartbeat({})

    assert "arq:worker:retry:heartbeat" in fake_redis.values
    assert "arq:worker:retry:stats" in fake_redis.values
    assert "arq:worker:simulation:heartbeat" in fake_redis.values
    assert "arq:worker:simulation:stats" in fake_redis.values
    assert "arq:worker:heartbeat" not in fake_redis.values


@pytest.mark.asyncio
async def test_get_worker_health_supports_legacy_main_fallback(monkeypatch):
    fake_redis = _FakeRedis()
    fake_redis.values["arq:worker:heartbeat"] = json.dumps(
        {
            "timestamp": "2026-03-09T12:00:00+00:00",
            "uptime_seconds": 10.0,
            "hostname": "test-host",
            "python_version": "3.11.0",
            "platform": "test-platform",
        }
    )
    fake_redis.values["arq:worker:stats"] = json.dumps(
        {
            "processed_jobs": 1,
            "failed_jobs": 0,
            "memory_mb": 12.5,
            "cpu_percent": 2.0,
            "success_rate": 1.0,
        }
    )

    async def _fake_get_redis():
        return fake_redis

    monkeypatch.setattr(
        "pixsim7.backend.main.infrastructure.redis.get_redis",
        _fake_get_redis,
    )

    main_health = await wh.get_worker_health("main")
    assert main_health is not None
    assert main_health["worker_role"] == "main"
    assert main_health["processed_jobs"] == 1


@pytest.mark.asyncio
async def test_get_worker_family_health_returns_all_three_roles(monkeypatch):
    fake_redis = _FakeRedis()

    async def _fake_get_redis():
        return fake_redis

    monkeypatch.setattr(
        "pixsim7.backend.main.infrastructure.redis.get_redis",
        _fake_get_redis,
    )

    await wh.update_main_heartbeat({})
    await wh.update_retry_heartbeat({})
    await wh.update_simulation_heartbeat({})

    family = await wh.get_worker_family_health()

    assert set(family.keys()) == {"main", "retry", "simulation"}
    assert family["main"] is not None
    assert family["retry"] is not None
    assert family["simulation"] is not None
