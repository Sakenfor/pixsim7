"""
ExecutionLoopService tests — pins the Phase 2d two-step flow contract.

Plan: automation-package-extraction Phase 2d.

Focused on the compensation behaviour (the original Phase 1c deferred debt):
- Happy path: reserve → create execution → enqueue → token kept (no release).
- Create-execution failure: reservation released as compensation, original
  exception re-raised so the loop tick can record the failure.
- Enqueue failure: same — release as compensation, exception re-raised.
- Reservation contention (None returned): try the next candidate; release
  is NOT called for the contended candidate (we never held the slot).

The service's other concerns (selection-strategy ordering, can_loop_execute
gating, device counting) are exercised indirectly via the integration test
above — these tests pin the contract that matters most for cross-DB safety.
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from pixsim7.automation.protocols import AccountSnapshot, ReservationToken


pytestmark = pytest.mark.asyncio


def _snapshot(account_id: int = 7, credits: int = 100) -> AccountSnapshot:
    return AccountSnapshot(
        id=account_id,
        email=f"acct-{account_id}@test",
        provider_id="pixverse",
        resolved_password="pw",
        user_id=42,
        total_credits=credits,
    )


def _token(account_id: int = 7, claimed_by: str = "automation:loop:1") -> ReservationToken:
    return ReservationToken(
        account_id=account_id,
        claimed_by=claimed_by,
        reserved_at=datetime.now(timezone.utc),
        nonce="abc",
    )


def _make_service():
    """Build a service with a mocked DB session — the real flow only touches
    db inside _create_execution_for_snapshot, which we patch wholesale on
    each test to either succeed or raise."""
    from pixsim7.automation.services.execution_loop_service import ExecutionLoopService

    db = MagicMock()
    db.commit = AsyncMock()
    return ExecutionLoopService(db=db)


def _stub_loop():
    """Minimal loop stub — _try_reserve_and_create only reads loop.id."""
    return SimpleNamespace(id=1)


async def test_try_reserve_and_create_happy_path_keeps_reservation():
    """Reservation succeeds + execution created + enqueue ok → release NOT called."""
    service = _make_service()
    snap = _snapshot()
    token = _token()
    fake_execution = SimpleNamespace(id=99, task_id=None)

    account_lookup = MagicMock()
    account_lookup.reserve_account = AsyncMock(return_value=(snap, token))
    account_lookup.release_reservation = AsyncMock()
    job_queue = MagicMock()
    job_queue.enqueue_automation = AsyncMock(return_value="task-123")

    create_mock = AsyncMock(return_value=fake_execution)

    with (
        patch("pixsim7.automation.services.execution_loop_service.get_account_lookup", return_value=account_lookup),
        patch("pixsim7.automation.services.execution_loop_service.get_job_queue", return_value=job_queue),
        patch.object(service, "_create_execution_for_snapshot", create_mock),
    ):
        result = await service._try_reserve_and_create(_stub_loop(), [snap])

    assert result is fake_execution
    assert fake_execution.task_id == "task-123"
    account_lookup.reserve_account.assert_awaited_once_with(snap.id, claimed_by="automation:loop:1")
    job_queue.enqueue_automation.assert_awaited_once_with(99)
    account_lookup.release_reservation.assert_not_called()


async def test_try_reserve_and_create_releases_on_create_failure():
    """Phase 1c debt closed: if INSERT execution fails after reservation,
    the slot is returned to the pool via release_reservation."""
    service = _make_service()
    snap = _snapshot()
    token = _token()

    account_lookup = MagicMock()
    account_lookup.reserve_account = AsyncMock(return_value=(snap, token))
    account_lookup.release_reservation = AsyncMock()
    job_queue = MagicMock()
    job_queue.enqueue_automation = AsyncMock()

    boom = RuntimeError("db write failed")
    create_mock = AsyncMock(side_effect=boom)

    with (
        patch("pixsim7.automation.services.execution_loop_service.get_account_lookup", return_value=account_lookup),
        patch("pixsim7.automation.services.execution_loop_service.get_job_queue", return_value=job_queue),
        patch.object(service, "_create_execution_for_snapshot", create_mock),
    ):
        with pytest.raises(RuntimeError, match="db write failed"):
            await service._try_reserve_and_create(_stub_loop(), [snap])

    account_lookup.release_reservation.assert_awaited_once_with(token)
    job_queue.enqueue_automation.assert_not_called()


async def test_try_reserve_and_create_releases_on_enqueue_failure():
    """If the enqueue commit fails after the execution insert succeeded,
    the reservation is still released — the loop can retry next tick."""
    service = _make_service()
    snap = _snapshot()
    token = _token()
    fake_execution = SimpleNamespace(id=99, task_id=None)

    account_lookup = MagicMock()
    account_lookup.reserve_account = AsyncMock(return_value=(snap, token))
    account_lookup.release_reservation = AsyncMock()
    job_queue = MagicMock()
    job_queue.enqueue_automation = AsyncMock(side_effect=RuntimeError("redis down"))

    create_mock = AsyncMock(return_value=fake_execution)

    with (
        patch("pixsim7.automation.services.execution_loop_service.get_account_lookup", return_value=account_lookup),
        patch("pixsim7.automation.services.execution_loop_service.get_job_queue", return_value=job_queue),
        patch.object(service, "_create_execution_for_snapshot", create_mock),
    ):
        with pytest.raises(RuntimeError, match="redis down"):
            await service._try_reserve_and_create(_stub_loop(), [snap])

    account_lookup.release_reservation.assert_awaited_once_with(token)


async def test_try_reserve_and_create_skips_contended_candidates():
    """If reserve_account returns None for the first candidate (SKIP LOCKED
    or full), the loop tries the next one. release_reservation is NOT called
    for the contended candidate — we never held the slot."""
    service = _make_service()
    contended = _snapshot(account_id=7)
    second = _snapshot(account_id=8)
    second_token = _token(account_id=8)
    fake_execution = SimpleNamespace(id=100, task_id=None)

    account_lookup = MagicMock()
    account_lookup.reserve_account = AsyncMock(side_effect=[None, (second, second_token)])
    account_lookup.release_reservation = AsyncMock()
    job_queue = MagicMock()
    job_queue.enqueue_automation = AsyncMock(return_value="task-200")

    create_mock = AsyncMock(return_value=fake_execution)

    with (
        patch("pixsim7.automation.services.execution_loop_service.get_account_lookup", return_value=account_lookup),
        patch("pixsim7.automation.services.execution_loop_service.get_job_queue", return_value=job_queue),
        patch.object(service, "_create_execution_for_snapshot", create_mock),
    ):
        result = await service._try_reserve_and_create(_stub_loop(), [contended, second])

    assert result is fake_execution
    assert account_lookup.reserve_account.await_count == 2
    account_lookup.release_reservation.assert_not_called()


async def test_try_reserve_and_create_returns_none_when_all_contended():
    """All candidates contended → return None, no execution, no release."""
    service = _make_service()
    snaps = [_snapshot(account_id=7), _snapshot(account_id=8)]

    account_lookup = MagicMock()
    account_lookup.reserve_account = AsyncMock(return_value=None)
    account_lookup.release_reservation = AsyncMock()
    job_queue = MagicMock()
    job_queue.enqueue_automation = AsyncMock()

    create_mock = AsyncMock()

    with (
        patch("pixsim7.automation.services.execution_loop_service.get_account_lookup", return_value=account_lookup),
        patch("pixsim7.automation.services.execution_loop_service.get_job_queue", return_value=job_queue),
        patch.object(service, "_create_execution_for_snapshot", create_mock),
    ):
        result = await service._try_reserve_and_create(_stub_loop(), snaps)

    assert result is None
    assert account_lookup.reserve_account.await_count == 2
    create_mock.assert_not_called()
    account_lookup.release_reservation.assert_not_called()


async def test_release_failure_does_not_mask_original_exception():
    """If release_reservation itself raises during compensation, the original
    create-execution exception is what surfaces — release errors are logged
    and swallowed by _release_reservation_safely so the loop keeps moving."""
    service = _make_service()
    snap = _snapshot()
    token = _token()

    account_lookup = MagicMock()
    account_lookup.reserve_account = AsyncMock(return_value=(snap, token))
    # Release also fails — but the create-execution failure is what should propagate.
    account_lookup.release_reservation = AsyncMock(side_effect=RuntimeError("release also failed"))
    job_queue = MagicMock()
    job_queue.enqueue_automation = AsyncMock()

    original = RuntimeError("create failed")
    create_mock = AsyncMock(side_effect=original)

    with (
        patch("pixsim7.automation.services.execution_loop_service.get_account_lookup", return_value=account_lookup),
        patch("pixsim7.automation.services.execution_loop_service.get_job_queue", return_value=job_queue),
        patch.object(service, "_create_execution_for_snapshot", create_mock),
    ):
        with pytest.raises(RuntimeError, match="create failed"):
            await service._try_reserve_and_create(_stub_loop(), [snap])

    account_lookup.release_reservation.assert_awaited_once_with(token)
