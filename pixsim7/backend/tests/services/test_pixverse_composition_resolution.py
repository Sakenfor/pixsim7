from types import SimpleNamespace

import pytest

from pixsim7.backend.main.services.asset.sync import AssetSyncService
from pixsim7.backend.main.services.provider.adapters.pixverse_composition import (
    resolve_composition_assets_for_pixverse,
)
from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import PixverseApiMode


class _ScalarResult:
    def __init__(self, value=None):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _DbSession:
    async def execute(self, *_args, **_kwargs):
        return _ScalarResult(None)


class _Provider:
    def __init__(self):
        self.calls = []

    async def _resolve_webapi_url_from_id(self, account, value, **kwargs):
        self.calls.append((account, value, kwargs))
        return "https://media.pixverse.ai/upload/openapi-image.jpg"


@pytest.mark.asyncio
async def test_webapi_resolution_reuses_numeric_openapi_upload_id(monkeypatch):
    async def _cached_provider_ref(self, *, asset_id: int, target_provider_id: str):
        assert asset_id == 123
        assert target_provider_id == "pixverse"
        return "456789"

    monkeypatch.setattr(
        AssetSyncService,
        "get_asset_for_provider",
        _cached_provider_ref,
    )

    provider = _Provider()
    account = SimpleNamespace(id=7)

    resolved = await resolve_composition_assets_for_pixverse(
        [{"asset": "asset:123", "media_type": "image"}],
        db_session=_DbSession(),
        api_mode=PixverseApiMode.WEBAPI,
        provider=provider,
        account=account,
    )

    assert resolved == ["https://media.pixverse.ai/upload/openapi-image.jpg"]
    assert provider.calls == [
        (
            account,
            "456789",
            {
                "media_type": "image",
                "asset_id": 123,
                "remote_url": None,
            },
        )
    ]
