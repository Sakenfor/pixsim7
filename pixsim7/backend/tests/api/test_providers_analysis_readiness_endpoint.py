"""API tests for provider analysis-readiness debug endpoint."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

try:
    import httpx
    from fastapi import FastAPI

    from pixsim7.backend.main.api.dependencies import get_current_user
    from pixsim7.backend.main.api.v1.providers import router
    from pixsim7.backend.main.domain import OperationType

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


def _user(*, is_admin: bool):
    return SimpleNamespace(
        id=123,
        is_admin=lambda: is_admin,
    )


def _app(*, is_admin: bool) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_current_user] = lambda: _user(is_admin=is_admin)
    return app


class _FakeProvider:
    def __init__(
        self,
        *,
        provider_id: str,
        name: str,
        requires_credentials: bool,
        has_analyze: bool,
    ) -> None:
        self.provider_id = provider_id
        self._name = name
        self.supported_operations = [OperationType.TEXT_TO_IMAGE, OperationType.IMAGE_EDIT]
        self._manifest = SimpleNamespace(
            requires_credentials=requires_credentials,
            kind=SimpleNamespace(value="video"),
            credit_types=["web"],
        )
        if has_analyze:
            self.analyze = lambda **kwargs: None

    def get_display_name(self) -> str:
        return self._name

    def get_manifest(self):
        return self._manifest

    async def check_status(self, **kwargs):
        return None


class _FakeRegistry:
    def __init__(self, providers: dict[str, _FakeProvider]) -> None:
        self._providers = providers

    def list_provider_ids(self) -> list[str]:
        return list(self._providers.keys())

    def get(self, provider_id: str) -> _FakeProvider:
        return self._providers[provider_id]


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_analysis_readiness_requires_admin():
    app = _app(is_admin=False)
    async with _client(app) as client:
        response = await client.get("/api/v1/providers/debug/analysis-readiness")

    assert response.status_code == 403
    assert response.json()["detail"] == "Admin access required"


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_analysis_readiness_reports_pending_hooks_and_accountless(
    monkeypatch: pytest.MonkeyPatch,
):
    import pixsim7.backend.main.api.v1.providers as providers_api

    providers = {
        "z-local-mask": _FakeProvider(
            provider_id="z-local-mask",
            name="Local Mask",
            requires_credentials=False,
            has_analyze=False,
        ),
        "a-cloud-vision": _FakeProvider(
            provider_id="a-cloud-vision",
            name="Cloud Vision",
            requires_credentials=True,
            has_analyze=True,
        ),
    }
    monkeypatch.setattr(providers_api, "registry", _FakeRegistry(providers))

    app = _app(is_admin=True)
    async with _client(app) as client:
        response = await client.get("/api/v1/providers/debug/analysis-readiness")

    assert response.status_code == 200
    payload = response.json()
    assert [row["provider_id"] for row in payload] == ["a-cloud-vision", "z-local-mask"]

    ready = payload[0]
    assert ready["analysis_pipeline_ready"] is True
    assert ready["pending_reason"] is None
    assert ready["requires_credentials"] is True
    assert ready["supports_accountless"] is False

    pending = payload[1]
    assert pending["analysis_pipeline_ready"] is False
    assert pending["pending_reason"] == "provider_missing_analyze_hook"
    assert pending["missing_hooks"] == ["has_analyze"]
    assert pending["requires_credentials"] is False
    assert pending["supports_accountless"] is True
    assert pending["analysis_support"]["has_analyze"] is False
    assert pending["analysis_support"]["has_check_status"] is True
