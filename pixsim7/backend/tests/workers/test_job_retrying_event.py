"""
Tests for the ``job:retrying`` WebSocket event emitted on non-terminal
retry-budget requeues (content-filter retry loop, account rotation).

The event exists so the frontend refetches retry/attempt counters instead of
freezing them at their first-observed value (the optimistic WS path only
patches ``status`` and never refreshes counts for non-terminal transitions).
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from pixsim7.backend.main.services.generation.processing import (
    requeue as job_processor_requeue,
)
from pixsim7.backend.main.services.generation.processing.requeue import (
    _publish_job_retrying,
    _requeue_generation_for_account_rotation,
    _defer_pinned_generation,
)


class _NoopLogger:
    def info(self, *args, **kwargs) -> None:
        return None

    def warning(self, *args, **kwargs) -> None:
        return None

    def error(self, *args, **kwargs) -> None:
        return None

    def debug(self, *args, **kwargs) -> None:
        return None


class _RecordingLogger(_NoopLogger):
    def __init__(self) -> None:
        self.debug_events: list[str] = []

    def debug(self, event, *args, **kwargs) -> None:
        self.debug_events.append(event)


class _FakeDB:
    def __init__(self) -> None:
        self.commits = 0

    async def commit(self) -> None:
        self.commits += 1

    async def refresh(self, obj) -> None:
        return None


def _fake_generation(**overrides):
    base = dict(
        id=4242,
        user_id=7,
        status="pending",
        retry_count=2,
        account_id=99,
        preferred_account_id=None,
        started_at=object(),
        scheduled_at=None,
        updated_at=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


# ---------------------------------------------------------------------------
# _publish_job_retrying
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_publish_job_retrying_emits_event(monkeypatch: pytest.MonkeyPatch) -> None:
    generation = _fake_generation(id=1001, user_id=12, retry_count=3, status="pending")

    publish_mock = AsyncMock()
    monkeypatch.setattr(
        "pixsim7.backend.main.infrastructure.events.bus.event_bus.publish",
        publish_mock,
    )

    await _publish_job_retrying(
        generation,
        reason="content_filtered_retry",
        gen_logger=_NoopLogger(),
    )

    publish_mock.assert_awaited_once()
    event_type, payload = publish_mock.await_args.args
    assert event_type == "job:retrying"
    assert payload == {
        "job_id": 1001,
        "generation_id": 1001,
        "user_id": 12,
        "status": "pending",
        "retry_attempt": 3,
        "reason": "content_filtered_retry",
    }


@pytest.mark.asyncio
async def test_publish_job_retrying_unwraps_enum_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    generation = _fake_generation(status=SimpleNamespace(value="processing"))

    publish_mock = AsyncMock()
    monkeypatch.setattr(
        "pixsim7.backend.main.infrastructure.events.bus.event_bus.publish",
        publish_mock,
    )

    await _publish_job_retrying(
        generation, reason="content_filtered_account_rotation", gen_logger=_NoopLogger()
    )

    _, payload = publish_mock.await_args.args
    assert payload["status"] == "processing"


@pytest.mark.asyncio
async def test_publish_job_retrying_is_best_effort(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    generation = _fake_generation()

    async def _boom(*args, **kwargs):
        raise RuntimeError("redis bridge down")

    monkeypatch.setattr(
        "pixsim7.backend.main.infrastructure.events.bus.event_bus.publish",
        _boom,
    )
    logger = _RecordingLogger()

    # Must not raise — a publish failure can't be allowed to break the requeue.
    await _publish_job_retrying(generation, reason="content_filtered_retry", gen_logger=logger)

    assert "job_retrying_event_publish_failed" in logger.debug_events


# ---------------------------------------------------------------------------
# _requeue_generation_for_account_rotation -> emits only when retry budget bumps
# ---------------------------------------------------------------------------


def _patch_requeue_infra(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_arq_pool():
        return SimpleNamespace()

    monkeypatch.setattr(
        "pixsim7.backend.main.infrastructure.redis.get_arq_pool",
        _fake_get_arq_pool,
    )
    monkeypatch.setattr(
        job_processor_requeue,
        "enqueue_generation_retry_job",
        AsyncMock(return_value={"deduped": False}),
    )


@pytest.mark.asyncio
async def test_account_rotation_requeue_emits_job_retrying_when_incrementing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_requeue_infra(monkeypatch)
    publish_spy = AsyncMock()
    monkeypatch.setattr(job_processor_requeue, "_publish_job_retrying", publish_spy)

    generation = _fake_generation(retry_count=1)

    result = await _requeue_generation_for_account_rotation(
        db=_FakeDB(),
        generation=generation,
        generation_id=generation.id,
        failed_account_id=99,
        reason="content_filtered_account_rotation",
        log_event="generation_requeued_content_filter_rotation",
        account_log_field="filtered_account_id",
        gen_logger=_NoopLogger(),
        increment_retry=True,
    )

    assert result is not None and result["status"] == "requeued"
    assert generation.retry_count == 2
    publish_spy.assert_awaited_once()
    assert publish_spy.await_args.kwargs["reason"] == "content_filtered_account_rotation"


@pytest.mark.asyncio
async def test_account_rotation_requeue_skips_event_without_increment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_requeue_infra(monkeypatch)
    publish_spy = AsyncMock()
    monkeypatch.setattr(job_processor_requeue, "_publish_job_retrying", publish_spy)

    generation = _fake_generation(retry_count=1)

    result = await _requeue_generation_for_account_rotation(
        db=_FakeDB(),
        generation=generation,
        generation_id=generation.id,
        failed_account_id=99,
        reason="account_rotation",
        log_event="generation_requeued_rotation",
        account_log_field="rotated_account_id",
        gen_logger=_NoopLogger(),
        increment_retry=False,
    )

    assert result is not None and result["status"] == "requeued"
    assert generation.retry_count == 1  # budget untouched
    publish_spy.assert_not_awaited()


# ---------------------------------------------------------------------------
# _defer_pinned_generation -> cooldown/yield waits are NOT "retrying"
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pinned_defer_does_not_emit_job_retrying(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pinned cooldown defers bump retry_count too, but they are cooldown/yield
    waits — not retries — so they intentionally do not emit job:retrying.
    Guards the scoping decision against future regression."""
    async def _fake_get_arq_pool():
        return SimpleNamespace()

    monkeypatch.setattr(
        "pixsim7.backend.main.infrastructure.redis.get_arq_pool",
        _fake_get_arq_pool,
    )
    monkeypatch.setattr(
        job_processor_requeue,
        "enqueue_generation_retry_job",
        AsyncMock(return_value={"deduped": False, "actual_defer_seconds": 30}),
    )
    monkeypatch.setattr(
        job_processor_requeue, "set_generation_wait_metadata", AsyncMock()
    )
    monkeypatch.setattr(
        job_processor_requeue, "release_generation_enqueue_lease", AsyncMock()
    )
    publish_spy = AsyncMock()
    monkeypatch.setattr(job_processor_requeue, "_publish_job_retrying", publish_spy)

    generation = _fake_generation(retry_count=1)

    result = await _defer_pinned_generation(
        db=_FakeDB(),
        generation=generation,
        generation_id=generation.id,
        account_id=99,
        defer_seconds=30,
        reason="pinned_content_filter_yield",
        gen_logger=_NoopLogger(),
        increment_retry=True,
    )

    assert result is not None and result["status"] == "waiting"
    publish_spy.assert_not_awaited()
