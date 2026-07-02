"""
Tests for the shared deferred_action mechanism (pause/cancel).

Verifies that PROCESSING generations use cooperative deferred_action
instead of immediate status transitions, and that cancel and pause
share the same mechanism.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timezone

import pytest

from pixsim7.backend.main.domain.enums import GenerationStatus, GenerationErrorCode
from pixsim7.backend.main.services.generation.lifecycle import GenerationLifecycleService
from pixsim7.backend.main.shared.errors import InvalidOperationError


def _make_generation(
    *,
    id: int = 1,
    status: str = "processing",
    user_id: int = 42,
    deferred_action: str | None = None,
) -> MagicMock:
    gen = MagicMock()
    gen.id = id
    gen.status = GenerationStatus(status)
    gen.user_id = user_id
    gen.deferred_action = deferred_action
    gen.is_terminal = gen.status in {
        GenerationStatus.COMPLETED,
        GenerationStatus.FAILED,
        GenerationStatus.CANCELLED,
    }
    gen.updated_at = None
    gen.started_at = None
    gen.completed_at = None
    gen.cancel_requested_at = None
    return gen


def _make_user(id: int = 42, admin: bool = False) -> SimpleNamespace:
    user = SimpleNamespace(id=id)
    user.is_admin = lambda: admin
    return user


def _make_lifecycle(generation: MagicMock) -> GenerationLifecycleService:
    db = AsyncMock()
    db.get = AsyncMock(return_value=generation)
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    svc = GenerationLifecycleService(db)
    # Patch _get_generation to return our mock directly
    svc._get_generation = AsyncMock(return_value=generation)
    svc._get_generation_for_update = AsyncMock(return_value=generation)
    return svc


# ---------------------------------------------------------------------------
# cancel_generation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancel_pending_immediate():
    """PENDING generation cancels immediately (no deferral)."""
    gen = _make_generation(status="pending")
    svc = _make_lifecycle(gen)
    user = _make_user()

    # Stub update_status to simulate the transition
    svc.update_status = AsyncMock(return_value=gen)
    result = await svc.cancel_generation(1, user)

    svc.update_status.assert_called_once_with(1, GenerationStatus.CANCELLED)
    assert gen.deferred_action is None


@pytest.mark.asyncio
async def test_cancel_processing_deferred():
    """PROCESSING generation sets deferred_action='cancel' instead of
    immediately transitioning."""
    gen = _make_generation(status="processing")
    svc = _make_lifecycle(gen)
    user = _make_user()

    result = await svc.cancel_generation(1, user)

    assert gen.deferred_action == "cancel"
    assert gen.status == GenerationStatus.PROCESSING  # NOT cancelled yet


@pytest.mark.asyncio
async def test_cancel_processing_stamps_cancel_requested_at():
    """Cancel on a PROCESSING generation persists a UTC timestamp so the
    poller's grace period survives worker restarts."""
    gen = _make_generation(status="processing")
    svc = _make_lifecycle(gen)
    user = _make_user()

    before = datetime.now(timezone.utc)
    await svc.cancel_generation(1, user)
    after = datetime.now(timezone.utc)

    assert isinstance(gen.cancel_requested_at, datetime)
    assert gen.cancel_requested_at.tzinfo is not None
    assert before <= gen.cancel_requested_at <= after


@pytest.mark.asyncio
async def test_cancel_overrides_pause():
    """Cancel escalates over an existing pause deferral."""
    gen = _make_generation(status="processing", deferred_action="pause")
    svc = _make_lifecycle(gen)
    user = _make_user()

    await svc.cancel_generation(1, user)

    assert gen.deferred_action == "cancel"


@pytest.mark.asyncio
async def test_cancel_terminal_rejected():
    """Cannot cancel a terminal generation."""
    gen = _make_generation(status="completed")
    svc = _make_lifecycle(gen)
    user = _make_user()

    with pytest.raises(InvalidOperationError, match="already completed"):
        await svc.cancel_generation(1, user)


# ---------------------------------------------------------------------------
# update_status — resurrection guard (cancel-during-pickup race)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_status_refuses_to_resurrect_cancelled_into_processing():
    """Cancel-during-pickup race: a PENDING generation cancelled while a worker
    is between the pending guard and mark_started must NOT be flipped back to
    PROCESSING. update_status raises so the worker aborts and releases the slot,
    instead of resurrecting a cancelled job and spending credits."""
    gen = _make_generation(status="cancelled")
    svc = _make_lifecycle(gen)

    with pytest.raises(InvalidOperationError):
        await svc.update_status(1, GenerationStatus.PROCESSING)

    # Row untouched — still cancelled, no PROCESSING transition committed.
    assert gen.status == GenerationStatus.CANCELLED
    svc.db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_mark_started_aborts_when_cancelled_during_pickup():
    """mark_started delegates to update_status(PROCESSING); a CANCELLED row
    raises rather than resurrecting into an active state."""
    gen = _make_generation(status="cancelled")
    svc = _make_lifecycle(gen)

    with pytest.raises(InvalidOperationError):
        await svc.mark_started(1)

    assert gen.status == GenerationStatus.CANCELLED


@pytest.mark.asyncio
async def test_update_status_terminal_to_terminal_still_silently_skips():
    """The resurrection guard must NOT change the existing terminal→terminal
    behavior (poller writing COMPLETED over CANCELLED): that still returns the
    row unchanged, no raise."""
    gen = _make_generation(status="cancelled")
    svc = _make_lifecycle(gen)

    result = await svc.update_status(1, GenerationStatus.COMPLETED)

    assert result is gen
    assert gen.status == GenerationStatus.CANCELLED  # unchanged


@pytest.mark.asyncio
async def test_mark_started_pending_still_starts():
    """A genuinely PENDING generation still transitions to PROCESSING — the
    guard only blocks terminal rows, so the normal pickup path is unaffected."""
    gen = _make_generation(status="pending")
    svc = _make_lifecycle(gen)

    result = await svc.mark_started(1)

    assert result.status == GenerationStatus.PROCESSING


# ---------------------------------------------------------------------------
# pause_generation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pause_pending_immediate():
    """PENDING generation pauses immediately."""
    gen = _make_generation(status="pending")
    svc = _make_lifecycle(gen)
    user = _make_user()

    svc.update_status = AsyncMock(return_value=gen)
    await svc.pause_generation(1, user)

    svc.update_status.assert_called_once_with(1, GenerationStatus.PAUSED)


@pytest.mark.asyncio
async def test_pause_processing_deferred():
    """PROCESSING generation sets deferred_action='pause'."""
    gen = _make_generation(status="processing")
    svc = _make_lifecycle(gen)
    user = _make_user()

    await svc.pause_generation(1, user)

    assert gen.deferred_action == "pause"
    assert gen.status == GenerationStatus.PROCESSING


@pytest.mark.asyncio
async def test_pause_over_cancel_rejected():
    """Cannot pause a generation that is already being cancelled."""
    gen = _make_generation(status="processing", deferred_action="cancel")
    svc = _make_lifecycle(gen)
    user = _make_user()

    with pytest.raises(InvalidOperationError, match="already being cancelled"):
        await svc.pause_generation(1, user)


@pytest.mark.asyncio
async def test_pause_already_paused_idempotent():
    """Pausing an already-paused generation is a no-op."""
    gen = _make_generation(status="paused")
    svc = _make_lifecycle(gen)
    user = _make_user()

    result = await svc.pause_generation(1, user)
    assert result is gen


# ---------------------------------------------------------------------------
# resume_generation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resume_clears_deferred_action():
    """Resume clears any residual deferred_action."""
    gen = _make_generation(status="paused", deferred_action="pause")
    svc = _make_lifecycle(gen)
    user = _make_user()

    svc.update_status = AsyncMock(return_value=gen)
    with patch("pixsim7.backend.main.services.generation.lifecycle.event_bus") as mock_bus:
        mock_bus.publish = AsyncMock()
        # arq calls are in try/except — let them fail silently
        await svc.resume_generation(1, user)

    assert gen.deferred_action is None


# ---------------------------------------------------------------------------
# auto-retry handler: deferred_action check
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_auto_retry_respects_deferred_pause():
    """Auto-retry handler should land in PAUSED when deferred_action='pause'."""
    from pixsim7.backend.main.event_handlers.auto_retry.manifest import handle_event
    from pixsim7.backend.main.infrastructure.events.bus import Event

    gen = MagicMock()
    gen.id = 1
    gen.status = GenerationStatus.FAILED
    gen.error_message = "content filtered (output)"
    gen.error_code = GenerationErrorCode.CONTENT_FILTERED.value
    gen.retry_count = 2
    gen.attempt_id = 5
    gen.deferred_action = "pause"
    gen.preferred_account_id = None
    gen.account_id = None

    event = Event(event_type="job:failed", data={"generation_id": 1})

    mock_db = AsyncMock()
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    mock_gen_service = AsyncMock()
    mock_gen_service.get_generation = AsyncMock(return_value=gen)
    mock_gen_service.should_auto_retry = AsyncMock(return_value=True)

    with patch("pixsim7.backend.main.infrastructure.database.session.get_async_session") as mock_session:
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_db)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_session.return_value = mock_ctx
        with patch("pixsim7.backend.main.services.generation.GenerationService", return_value=mock_gen_service):
            with patch("pixsim7.backend.main.services.user.UserService"):
                with patch("pixsim7.backend.main.shared.config.settings",
                           SimpleNamespace(auto_retry_max_attempts=20, auto_retry_enabled=True)):
                    await handle_event(event)

    assert gen.status == GenerationStatus.PAUSED
    assert gen.deferred_action is None


@pytest.mark.asyncio
async def test_auto_retry_respects_deferred_cancel():
    """Auto-retry handler should land in CANCELLED when deferred_action='cancel'."""
    from pixsim7.backend.main.event_handlers.auto_retry.manifest import handle_event
    from pixsim7.backend.main.infrastructure.events.bus import Event

    gen = MagicMock()
    gen.id = 1
    gen.status = GenerationStatus.FAILED
    gen.error_message = "content filtered (output)"
    gen.error_code = GenerationErrorCode.CONTENT_FILTERED.value
    gen.retry_count = 2
    gen.attempt_id = 5
    gen.deferred_action = "cancel"
    gen.preferred_account_id = None
    gen.account_id = None

    event = Event(event_type="job:failed", data={"generation_id": 1})

    mock_db = AsyncMock()
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    mock_gen_service = AsyncMock()
    mock_gen_service.get_generation = AsyncMock(return_value=gen)
    mock_gen_service.should_auto_retry = AsyncMock(return_value=True)

    with patch("pixsim7.backend.main.infrastructure.database.session.get_async_session") as mock_session:
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_db)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_session.return_value = mock_ctx
        with patch("pixsim7.backend.main.services.generation.GenerationService", return_value=mock_gen_service):
            with patch("pixsim7.backend.main.services.user.UserService"):
                with patch("pixsim7.backend.main.shared.config.settings",
                           SimpleNamespace(auto_retry_max_attempts=20, auto_retry_enabled=True)):
                    await handle_event(event)

    assert gen.status == GenerationStatus.CANCELLED
    assert gen.deferred_action is None
