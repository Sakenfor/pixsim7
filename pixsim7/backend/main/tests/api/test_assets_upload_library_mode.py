from __future__ import annotations

from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from starlette.datastructures import UploadFile

from pixsim7.backend.main.api.v1 import assets_upload
from pixsim7.backend.main.api.v1.assets_upload_helper import UploadPrepResult
from pixsim7.backend.main.domain.enums import MediaType


def _make_upload_file(
    *,
    filename: str = "test.png",
    content_type: str = "image/png",
    data: bytes = b"fake-image-bytes",
) -> UploadFile:
    return UploadFile(
        filename=filename,
        file=BytesIO(data),
        headers={"content-type": content_type},
    )


@pytest.mark.asyncio
async def test_upload_asset_library_mode_saves_without_provider(monkeypatch) -> None:
    user = MagicMock()
    user.id = 42
    db = MagicMock()
    account_service = MagicMock()
    asset_service = MagicMock()
    asset_service.record_upload_attempt = AsyncMock()

    prepare_upload_mock = AsyncMock(
        return_value=UploadPrepResult(
            sha256="a" * 64,
            width=512,
            height=512,
            stored_key="cas/42/asset.png",
            local_path="/tmp/cas/asset.png",
            existing_asset=None,
        )
    )
    add_asset_mock = AsyncMock(
        return_value=SimpleNamespace(
            id=101,
            remote_url=None,
            media_type=MediaType.IMAGE,
            provider_asset_id="local_aaaaaaaaaaaaaaaa",
        )
    )

    monkeypatch.setattr(assets_upload, "prepare_upload", prepare_upload_mock)
    monkeypatch.setattr(assets_upload, "add_asset", add_asset_mock)

    response = await assets_upload.upload_asset_to_provider(
        user=user,
        db=db,
        account_service=account_service,
        asset_service=asset_service,
        file=_make_upload_file(),
        provider_id=None,
        save_target="library",
        upload_method="local",
    )

    assert response.provider_id == "local"
    assert response.asset_id == 101
    assert response.external_url == "/api/v1/assets/101/file"

    assert prepare_upload_mock.await_args.kwargs["provider_id"] == "local"
    assert add_asset_mock.await_args.kwargs["provider_id"] == "local"
    assert add_asset_mock.await_args.kwargs["remote_url"] is None


@pytest.mark.asyncio
async def test_upload_asset_library_mode_requires_local_persistence(monkeypatch) -> None:
    user = MagicMock()
    user.id = 7
    db = MagicMock()
    account_service = MagicMock()
    asset_service = MagicMock()

    prepare_upload_mock = AsyncMock(
        return_value=UploadPrepResult(
            sha256="b" * 64,
            stored_key=None,
            local_path=None,
            existing_asset=None,
        )
    )
    monkeypatch.setattr(assets_upload, "prepare_upload", prepare_upload_mock)

    with pytest.raises(HTTPException) as exc:
        await assets_upload.upload_asset_to_provider(
            user=user,
            db=db,
            account_service=account_service,
            asset_service=asset_service,
            file=_make_upload_file(),
            provider_id=None,
            save_target="library",
            upload_method="local",
        )

    assert exc.value.status_code == 500
    assert exc.value.detail == "Failed to persist file for library-only upload."


@pytest.mark.asyncio
async def test_upload_asset_library_mode_allows_local_dedup_without_new_persist(monkeypatch) -> None:
    user = MagicMock()
    user.id = 9
    db = MagicMock()
    account_service = MagicMock()
    asset_service = MagicMock()
    asset_service.record_upload_attempt = AsyncMock()

    existing = SimpleNamespace(
        id=202,
        remote_url=None,
        media_type=MediaType.IMAGE,
        provider_id="local",
        provider_uploads={"local": "local_existing"},
        provider_asset_id="local_existing",
    )

    prepare_upload_mock = AsyncMock(
        return_value=UploadPrepResult(
            sha256="c" * 64,
            width=256,
            height=256,
            stored_key=None,
            local_path=None,
            existing_asset=existing,
            dedup_note="Deduplicated by sha256, already on local",
        )
    )

    monkeypatch.setattr(assets_upload, "prepare_upload", prepare_upload_mock)

    response = await assets_upload.upload_asset_to_provider(
        user=user,
        db=db,
        account_service=account_service,
        asset_service=asset_service,
        file=_make_upload_file(),
        provider_id=None,
        save_target="library",
        upload_method="mask_draw",
    )

    assert response.provider_id == "local"
    assert response.asset_id == 202
    assert response.note == "Deduplicated by sha256, already on local"


@pytest.mark.asyncio
async def test_upload_asset_provider_mode_requires_provider_id() -> None:
    user = MagicMock()
    user.id = 7
    db = MagicMock()
    account_service = MagicMock()
    asset_service = MagicMock()

    with pytest.raises(HTTPException) as exc:
        await assets_upload.upload_asset_to_provider(
            user=user,
            db=db,
            account_service=account_service,
            asset_service=asset_service,
            file=_make_upload_file(),
            provider_id=None,
            save_target="provider",
            upload_method="local",
        )

    assert exc.value.status_code == 400
    assert exc.value.detail == "provider_id is required when save_target='provider'"
