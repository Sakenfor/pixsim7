"""
Tests for GenerationRetryService.retry_generation().

Covers authorization, status validation, retry_count budget (not attempt_id),
parameter propagation, and parent linking.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from pixsim7.backend.main.domain.enums import GenerationStatus
from pixsim7.backend.main.services.generation.retry import GenerationRetryService
from pixsim7.backend.main.shared.errors import InvalidOperationError


def _make_original(
    *,
    id: int = 1,
    user_id: int = 42,
    status: str = "failed",
    retry_count: int = 0,
    attempt_id: int = 0,
    operation_type: str = "text_to_image",
    provider_id: str = "pixverse",
    raw_params: dict | None = None,
    workspace_id: int | None = None,
    name: str | None = "test gen",
    description: str | None = None,
    priority: int = 5,
    prompt_version_id=None,
    preferred_account_id=None,
    analyzer_id=None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=id,
        user_id=user_id,
        status=GenerationStatus(status),
        retry_count=retry_count,
        attempt_id=attempt_id,
        operation_type=operation_type,
        provider_id=provider_id,
        raw_params=raw_params or {"model": "v2"},
        workspace_id=workspace_id,
        name=name,
        description=description,
        priority=priority,
        prompt_version_id=prompt_version_id,
        preferred_account_id=preferred_account_id,
        analyzer_id=analyzer_id,
    )


def _make_user(id: int = 42, admin: bool = False) -> SimpleNamespace:
    ns = SimpleNamespace(id=id)
    ns.is_admin = lambda: admin
    return ns


def _make_new_generation(id: int = 99) -> MagicMock:
    gen = MagicMock()
    gen.id = id
    gen.retry_count = 0
    return gen


def _make_service(original) -> GenerationRetryService:
    db = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    creation = AsyncMock()
    creation.create_generation = AsyncMock(return_value=_make_new_generation())
    svc = GenerationRetryService(db, creation_service=creation)
    svc._get_generation = AsyncMock(return_value=original)
    return svc


# ---------------------------------------------------------------------------
# Authorization
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_retry_same_user_allowed():
    original = _make_original(user_id=42)
    svc = _make_service(original)
    result = await svc.retry_generation(1, _make_user(42), max_retries=20)
    assert result.id == 99


@pytest.mark.asyncio
async def test_retry_other_user_rejected():
    original = _make_original(user_id=42)
    svc = _make_service(original)
    with pytest.raises(InvalidOperationError, match="Cannot retry other"):
        await svc.retry_generation(1, _make_user(99), max_retries=20)


@pytest.mark.asyncio
async def test_retry_admin_allowed():
    original = _make_original(user_id=42)
    svc = _make_service(original)
    result = await svc.retry_generation(1, _make_user(99, admin=True), max_retries=20)
    assert result.id == 99


# ---------------------------------------------------------------------------
# Status validation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_retry_failed_allowed():
    svc = _make_service(_make_original(status="failed"))
    result = await svc.retry_generation(1, _make_user(), max_retries=20)
    assert result.id == 99


@pytest.mark.asyncio
async def test_retry_cancelled_allowed():
    svc = _make_service(_make_original(status="cancelled"))
    result = await svc.retry_generation(1, _make_user(), max_retries=20)
    assert result.id == 99


@pytest.mark.asyncio
async def test_retry_processing_rejected():
    svc = _make_service(_make_original(status="processing"))
    with pytest.raises(InvalidOperationError, match="Can only retry"):
        await svc.retry_generation(1, _make_user(), max_retries=20)


@pytest.mark.asyncio
async def test_retry_pending_rejected():
    svc = _make_service(_make_original(status="pending"))
    with pytest.raises(InvalidOperationError, match="Can only retry"):
        await svc.retry_generation(1, _make_user(), max_retries=20)


# ---------------------------------------------------------------------------
# retry_count budget (NOT attempt_id)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_retry_count_at_max_rejected():
    svc = _make_service(_make_original(retry_count=20, attempt_id=20))
    with pytest.raises(InvalidOperationError, match="Maximum retries"):
        await svc.retry_generation(1, _make_user(), max_retries=20)


@pytest.mark.asyncio
async def test_retry_count_above_max_rejected():
    svc = _make_service(_make_original(retry_count=25, attempt_id=80))
    with pytest.raises(InvalidOperationError, match="Maximum retries"):
        await svc.retry_generation(1, _make_user(), max_retries=20)


@pytest.mark.asyncio
async def test_high_attempt_id_does_not_block_retry():
    """attempt_id inflated by concurrent waits should not block retry."""
    svc = _make_service(_make_original(retry_count=2, attempt_id=50))
    result = await svc.retry_generation(1, _make_user(), max_retries=20)
    assert result.id == 99


@pytest.mark.asyncio
async def test_retry_count_one_below_max_allowed():
    svc = _make_service(_make_original(retry_count=19, attempt_id=70))
    result = await svc.retry_generation(1, _make_user(), max_retries=20)
    assert result.id == 99


@pytest.mark.asyncio
async def test_max_retries_resolved_from_settings():
    """When max_retries is None, GenerationSettings.auto_retry_max_attempts is used."""
    svc = _make_service(_make_original(retry_count=5))
    with patch(
        "pixsim7.backend.main.services.generation.generation_settings.GenerationSettings.get",
        return_value=SimpleNamespace(auto_retry_max_attempts=5),
    ):
        with pytest.raises(InvalidOperationError, match="Maximum retries"):
            await svc.retry_generation(1, _make_user())


# ---------------------------------------------------------------------------
# Parameter propagation and parent linking
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_generation_called_with_original_params():
    original = _make_original(
        provider_id="pixverse",
        raw_params={"model": "v3", "quality": "1080p"},
        priority=8,
        name="original",
        preferred_account_id=7,
    )
    svc = _make_service(original)
    await svc.retry_generation(1, _make_user(), max_retries=20)

    call_kwargs = svc.creation.create_generation.call_args.kwargs
    assert call_kwargs["provider_id"] == "pixverse"
    assert call_kwargs["params"] == {"model": "v3", "quality": "1080p"}
    assert call_kwargs["priority"] == 8
    assert call_kwargs["name"] == "Retry: original"
    assert call_kwargs["parent_generation_id"] == 1
    assert call_kwargs["preferred_account_id"] == 7


@pytest.mark.asyncio
async def test_retry_count_incremented_on_new_generation():
    original = _make_original(retry_count=3)
    new_gen = _make_new_generation()
    svc = _make_service(original)
    svc.creation.create_generation = AsyncMock(return_value=new_gen)

    await svc.retry_generation(1, _make_user(), max_retries=20)

    assert new_gen.retry_count == 4


@pytest.mark.asyncio
async def test_name_none_when_original_has_no_name():
    original = _make_original(name=None)
    svc = _make_service(original)
    await svc.retry_generation(1, _make_user(), max_retries=20)

    call_kwargs = svc.creation.create_generation.call_args.kwargs
    assert call_kwargs["name"] is None
