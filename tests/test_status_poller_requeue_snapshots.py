from datetime import datetime, timedelta, timezone

import pytest

from pixsim7.backend.main.workers import status_poller as sp


class _FakeScalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        values = []
        for row in self._rows:
            if isinstance(row, tuple):
                values.append(row[0])
            else:
                values.append(row)
        return values


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)

    def scalars(self):
        return _FakeScalars(self._rows)


class _FakeDb:
    def __init__(self, select_results):
        self._select_results = list(select_results)
        self.commit_calls = 0
        self.rollback_calls = 0
        self.close_calls = 0
        self.update_calls = 0

    async def execute(self, query):
        if getattr(query, "is_update", False):
            self.update_calls += 1
            return _FakeResult([])
        if not self._select_results:
            raise AssertionError("No fake rows available for execute()")
        return _FakeResult(self._select_results.pop(0))

    async def commit(self):
        self.commit_calls += 1

    async def rollback(self):
        self.rollback_calls += 1

    async def close(self):
        self.close_calls += 1


def _fake_get_db_provider(db):
    async def _fake_get_db():
        yield db

    return _fake_get_db


@pytest.mark.asyncio
async def test_requeue_pending_generations_uses_snapshots_and_survives_rollback(monkeypatch):
    now = datetime.now(timezone.utc)
    fake_db = _FakeDb(
        select_results=[
            [(11, 2, 0)],
            [101, 102],
            [(201, now - timedelta(seconds=120))],
            [(301, now - timedelta(seconds=240))],
        ]
    )
    monkeypatch.setattr(sp, "get_db", _fake_get_db_provider(fake_db))

    get_pool_calls = 0

    async def _fake_get_arq_pool():
        nonlocal get_pool_calls
        get_pool_calls += 1
        return object()

    monkeypatch.setattr(
        "pixsim7.backend.main.infrastructure.redis.get_arq_pool",
        _fake_get_arq_pool,
    )

    fresh_calls: list[int] = []
    clear_calls: list[int] = []
    retry_calls: list[int] = []

    async def _fake_get_wait_metadata(pool, generation_id):  # noqa: ARG001
        return {"reason": "ready"}

    async def _fake_enqueue_fresh(pool, generation_id):  # noqa: ARG001
        fresh_calls.append(generation_id)
        if generation_id == 102:
            raise RuntimeError("queue unavailable")
        return True

    async def _fake_clear_wait_metadata(pool, generation_id):  # noqa: ARG001
        clear_calls.append(generation_id)

    async def _fake_enqueue_retry(pool, generation_id):  # noqa: ARG001
        retry_calls.append(generation_id)
        return {"deduped": generation_id == 301}

    monkeypatch.setattr(sp, "get_generation_wait_metadata", _fake_get_wait_metadata)
    monkeypatch.setattr(sp, "enqueue_generation_fresh_job", _fake_enqueue_fresh)
    monkeypatch.setattr(sp, "clear_generation_wait_metadata", _fake_clear_wait_metadata)
    monkeypatch.setattr(sp, "enqueue_generation_retry_job", _fake_enqueue_retry)

    result = await sp.requeue_pending_generations({})

    assert result["pinned_dispatched"] == 1
    assert result["requeued"] == 2
    assert result["skipped"] == 1
    assert result["errors"] == 1
    assert fake_db.commit_calls == 1
    assert fake_db.rollback_calls == 1
    assert fake_db.update_calls == 1
    assert fake_db.close_calls == 1
    assert get_pool_calls == 2
    assert fresh_calls == [101, 102]
    assert clear_calls == [101]
    assert retry_calls == [201, 301]


@pytest.mark.asyncio
async def test_requeue_pending_generations_idle_path_skips_queue_calls(monkeypatch):
    fake_db = _FakeDb(
        select_results=[
            [],
            [],
            [],
        ]
    )
    monkeypatch.setattr(sp, "get_db", _fake_get_db_provider(fake_db))

    async def _unexpected_get_arq_pool():
        raise AssertionError("ARQ pool should not be requested in idle path")

    monkeypatch.setattr(
        "pixsim7.backend.main.infrastructure.redis.get_arq_pool",
        _unexpected_get_arq_pool,
    )

    async def _unexpected_enqueue_retry(pool, generation_id):  # noqa: ARG001
        raise AssertionError("No generation should be retried in idle path")

    monkeypatch.setattr(sp, "enqueue_generation_retry_job", _unexpected_enqueue_retry)

    result = await sp.requeue_pending_generations({})

    assert result == {
        "requeued": 0,
        "pinned_dispatched": 0,
        "skipped": 0,
        "errors": 0,
    }
    assert fake_db.commit_calls == 0
    assert fake_db.rollback_calls == 0
    assert fake_db.update_calls == 0
    assert fake_db.close_calls == 1
