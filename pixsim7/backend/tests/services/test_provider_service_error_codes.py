from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from pixsim7.backend.main.domain.enums import OperationType
from pixsim7.backend.main.services.provider.provider_service import ProviderService
from pixsim7.backend.main.shared.errors import ProviderConcurrentLimitError


class _FakeDB:
    def __init__(self) -> None:
        self.added: list[object] = []

    def add(self, obj) -> None:
        self.added.append(obj)

    async def commit(self) -> None:
        return None

    async def refresh(self, obj) -> None:
        if getattr(obj, "id", None) is None:
            setattr(obj, "id", len(self.added))


class _FakeProvider:
    provider_id = "pixverse"

    def map_parameters(self, operation_type, params):
        return dict(params)

    def requires_file_preparation(self) -> bool:
        return False

    async def execute(self, *, operation_type, account, params):
        raise ProviderConcurrentLimitError("pixverse")


class _FakeSubmission:
    def __init__(self) -> None:
        self.id = 99
        self.provider_job_id = None
        self.response = {}
        self.status = "pending"
        self.responded_at = None

    def calculate_duration(self) -> None:
        return None


@pytest.mark.asyncio
async def test_execute_generation_writes_structured_error_code_to_submission_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = _FakeDB()
    service = ProviderService(db)
    provider = _FakeProvider()
    published_events: list[tuple[str, dict]] = []

    async def _fake_publish(event_type: str, payload: dict) -> None:
        published_events.append((event_type, payload))

    monkeypatch.setattr(
        "pixsim7.backend.main.services.provider.provider_service.registry.get",
        lambda provider_id: provider,
    )
    monkeypatch.setattr(
        "pixsim7.backend.main.services.provider.provider_service.event_bus.publish",
        _fake_publish,
    )

    generation = SimpleNamespace(
        id=101,
        provider_id="pixverse",
        operation_type=OperationType.TEXT_TO_VIDEO,
        retry_count=0,
        attempt_id=2,
        resolved_params=None,
        started_at=datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc),
    )
    account = SimpleNamespace(id=11)

    with pytest.raises(ProviderConcurrentLimitError):
        await service.execute_generation(
            generation=generation,
            account=account,
            params={"prompt": "hello"},
        )

    submission = db.added[-1]
    assert submission.status == "error"
    assert submission.generation_attempt_id == generation.attempt_id
    assert submission.response["error_type"] == "ProviderConcurrentLimitError"
    assert submission.response["error_code"] == "provider_concurrent_limit"
    assert submission.response["generation_attempt_started_at"] == generation.started_at.isoformat()
    assert any(
        payload.get("error_code") == "provider_concurrent_limit"
        for _, payload in published_events
    )


@pytest.mark.asyncio
async def test_execute_with_payload_writes_structured_error_code_to_submission_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = _FakeDB()
    service = ProviderService(db)
    provider = _FakeProvider()
    submission = _FakeSubmission()
    published_events: list[tuple[str, dict]] = []

    async def _fake_publish(event_type: str, payload: dict) -> None:
        published_events.append((event_type, payload))

    monkeypatch.setattr(
        "pixsim7.backend.main.services.provider.provider_service.event_bus.publish",
        _fake_publish,
    )

    generation = SimpleNamespace(
        id=202,
        provider_id="pixverse",
        operation_type=OperationType.TEXT_TO_VIDEO,
        started_at=datetime(2026, 3, 1, 12, 34, 56, tzinfo=timezone.utc),
    )
    account = SimpleNamespace(id=22)

    with pytest.raises(ProviderConcurrentLimitError):
        await service._execute_with_payload(
            provider=provider,
            generation=generation,
            account=account,
            submission=submission,
            execute_params={"prompt": "hello"},
        )

    assert submission.status == "error"
    assert submission.response["error_type"] == "ProviderConcurrentLimitError"
    assert submission.response["error_code"] == "provider_concurrent_limit"
    assert submission.response["generation_attempt_started_at"] == generation.started_at.isoformat()
    assert any(
        payload.get("error_code") == "provider_concurrent_limit"
        for _, payload in published_events
    )
