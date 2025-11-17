import asyncio
import os
import tempfile
from types import SimpleNamespace

import pytest
from PIL import Image

from pixsim7_backend.services.upload.upload_service import UploadService
from pixsim7_backend.domain import ProviderAccount, AccountStatus, MediaType
from pixsim7_backend.shared.errors import InvalidOperationError
from pixsim7_backend.services.provider import registry as provider_registry


class DummyDb:
    def __init__(self, preferred_account: ProviderAccount | None):
        self._preferred = preferred_account

    async def execute(self, *_args, **_kwargs):
        # Return an object with scalar_one_or_none()
        return SimpleNamespace(scalar_one_or_none=lambda: self._preferred)


class DummyAccountService:
    def __init__(self, fallback_account: ProviderAccount | None):
        self._fallback = fallback_account

    async def select_account(self, provider_id: str) -> ProviderAccount:
        if self._fallback is None:
            raise RuntimeError("select_account should not be called in this test")
        return self._fallback


class DummyProvider:
    provider_id = "pixverse"

    async def upload_asset(self, account: ProviderAccount, file_path: str):
        # If account has api_key or any openapi api_keys entry, return URL; else return ID
        api_keys = getattr(account, "api_keys", None) or []
        has_openapi = any(
            isinstance(entry, dict)
            and entry.get("kind") == "openapi"
            and entry.get("value")
            for entry in api_keys
        )
        if getattr(account, "api_key", None) or has_openapi:
            return "https://cdn.example.com/media/ok.jpg"
        return "media_12345"


@pytest.fixture(autouse=True)
def _clear_registry():
    # Ensure clean provider registry for each test
    provider_registry.registry.clear()
    provider_registry.registry.register(DummyProvider())
    yield
    provider_registry.registry.clear()


def make_temp_image(size=(128, 128), color=(200, 100, 50)) -> str:
    fd, path = tempfile.mkstemp(suffix=".jpg")
    os.close(fd)
    img = Image.new("RGB", size, color)
    img.save(path, format="JPEG", quality=90)
    return path


@pytest.mark.asyncio
async def test_upload_uses_openapi_account_when_available():
    # Preferred account with OpenAPI key present
    preferred = ProviderAccount(
        id=1,
        provider_id="pixverse",
        email="openapi@example.com",
        status=AccountStatus.ACTIVE,
        api_key="pk-openapi",
    )
    db = DummyDb(preferred_account=preferred)
    accounts = DummyAccountService(fallback_account=None)

    svc = UploadService(db, accounts)
    tmp = make_temp_image()
    try:
        res = await svc.upload(provider_id="pixverse", media_type=MediaType.IMAGE, tmp_path=tmp)
        assert res.external_url and res.external_url.startswith("http")
        # Note may include 'Uploaded via OpenAPI'
        assert res.provider_id == "pixverse"
        assert res.media_type == MediaType.IMAGE
    finally:
        try:
            os.unlink(tmp)
        except Exception:
            pass


@pytest.mark.asyncio
async def test_upload_falls_back_to_regular_account_when_no_openapi():
    # No preferred openapi account -> select_account used
    fallback = ProviderAccount(
        id=2,
        provider_id="pixverse",
        email="webapi@example.com",
        status=AccountStatus.ACTIVE,
    )
    db = DummyDb(preferred_account=None)
    accounts = DummyAccountService(fallback_account=fallback)

    svc = UploadService(db, accounts)
    tmp = make_temp_image()
    try:
        res = await svc.upload(provider_id="pixverse", media_type=MediaType.IMAGE, tmp_path=tmp)
        # No api key -> provider returns media ID
        assert res.provider_asset_id and res.provider_asset_id.startswith("media_")
        assert res.external_url is None
        assert res.provider_id == "pixverse"
    finally:
        try:
            os.unlink(tmp)
        except Exception:
            pass


@pytest.mark.asyncio
async def test_upload_rejection_path_surface_error():
    # Patch _prepare_file_for_provider to raise acceptance error
    fallback = ProviderAccount(
        id=3,
        provider_id="pixverse",
        email="reject@example.com",
        status=AccountStatus.ACTIVE,
    )
    db = DummyDb(preferred_account=None)
    accounts = DummyAccountService(fallback_account=fallback)

    svc = UploadService(db, accounts)

    async def reject(*args, **kwargs):
        raise InvalidOperationError("Pixverse upload rejected: image exceeds 20MB after resizing.")

    # Monkeypatch the method
    orig = svc._prepare_file_for_provider
    svc._prepare_file_for_provider = reject  # type: ignore

    tmp = make_temp_image()
    try:
        with pytest.raises(InvalidOperationError):
            await svc.upload(provider_id="pixverse", media_type=MediaType.IMAGE, tmp_path=tmp)
    finally:
        # Restore and cleanup
        svc._prepare_file_for_provider = orig  # type: ignore
        try:
            os.unlink(tmp)
        except Exception:
            pass
