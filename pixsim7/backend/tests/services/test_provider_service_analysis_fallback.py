from __future__ import annotations

from types import SimpleNamespace

import pytest

from pixsim7.backend.main.domain import ProviderStatus
from pixsim7.backend.main.services.provider.provider_service import ProviderService


class _FakeDb:
    def __init__(self) -> None:
        self._items = []

    def add(self, item) -> None:
        self._items.append(item)

    async def commit(self) -> None:
        return None

    async def refresh(self, item) -> None:
        return None


@pytest.mark.asyncio
async def test_execute_analysis_records_pending_metadata_when_provider_has_no_analyze(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = _FakeDb()
    service = ProviderService(db)

    provider = SimpleNamespace()

    class _Registry:
        @staticmethod
        def get(provider_id: str):
            assert provider_id == "no-analyze-provider"
            return provider

    import pixsim7.backend.main.services.provider.provider_service as provider_service_module

    monkeypatch.setattr(provider_service_module, "registry", _Registry())

    analysis = SimpleNamespace(
        id=123,
        provider_id="no-analyze-provider",
        analyzer_id="asset:mask-auto",
        model_id="sam2",
        prompt=None,
        params={"asset_url": "https://example.test/image.png"},
        retry_count=0,
    )
    account = SimpleNamespace(id=77)

    submission = await service.execute_analysis(analysis=analysis, account=account)

    assert submission.status == "success"
    assert submission.response["status"] == ProviderStatus.COMPLETED.value
    result = submission.response["result"]
    assert result["pending_implementation"] is True
    assert result["reason"] == "provider_missing_analyze_hook"
    assert result["provider_id"] == "no-analyze-provider"
    assert result["analyzer_id"] == "asset:mask-auto"
    assert result["analysis_support"]["has_analyze"] is False


@pytest.mark.asyncio
async def test_check_analysis_status_shortcuts_pending_implementation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = _FakeDb()
    service = ProviderService(db)

    class _Provider:
        async def check_status(self, **kwargs):
            raise AssertionError("check_status must not be called for pending placeholders")

    class _Registry:
        @staticmethod
        def get(provider_id: str):
            assert provider_id == "no-analyze-provider"
            return _Provider()

    import pixsim7.backend.main.services.provider.provider_service as provider_service_module

    monkeypatch.setattr(provider_service_module, "registry", _Registry())

    submission = SimpleNamespace(
        provider_id="no-analyze-provider",
        provider_job_id="analysis-123",
        response={
            "status": "completed",
            "result": {
                "pending_implementation": True,
                "reason": "provider_missing_analyze_hook",
            },
        },
    )
    account = SimpleNamespace(id=77)

    status = await service.check_analysis_status(submission=submission, account=account)

    assert status.status == ProviderStatus.COMPLETED
    assert status.progress == 1.0
    assert status.metadata["pending_implementation"] is True
