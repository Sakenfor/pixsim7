from __future__ import annotations

from io import BytesIO
from typing import AsyncIterator
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import event, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel
from starlette.datastructures import UploadFile

from pixsim7.backend.main.api.v1 import assets_upload
from pixsim7.backend.main.api.v1.assets_upload_helper import UploadPrepResult
from pixsim7.backend.main.domain.assets.content import ContentBlob
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.domain.assets.versioning import AssetVersionFamily
from pixsim7.backend.main.domain.enums import MediaType
from pixsim7.backend.main.domain.providers.models.account import ProviderAccount
from pixsim7.backend.main.domain.user import User
from pixsim7.backend.main.infrastructure.database.session import _strip_tz_from_params
from pixsim7.backend.main.services.asset.asset_factory import add_asset
from pixsim7.backend.main.shared.config import settings


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


@pytest_asyncio.fixture
async def upload_db_session() -> AsyncIterator[AsyncSession]:
    schema = f"test_upload_versioning_{uuid4().hex}"
    engine = create_async_engine(
        settings.async_database_url,
        poolclass=NullPool,
    )
    event.listen(engine.sync_engine, "before_cursor_execute", _strip_tz_from_params, retval=True)

    async with engine.connect() as conn:
        outer_tx = await conn.begin()
        try:
            try:
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            except Exception as exc:
                pytest.skip(f"pgvector extension unavailable for integration test: {exc}")

            await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
            await conn.execute(text(f'SET search_path TO "{schema}", public'))

            await conn.run_sync(
                lambda sync_conn: SQLModel.metadata.create_all(
                    sync_conn,
                    tables=[
                        User.__table__,
                        ContentBlob.__table__,
                        ProviderAccount.__table__,
                        AssetVersionFamily.__table__,
                        Asset.__table__,
                    ],
                )
            )

            session = AsyncSession(
                bind=conn,
                expire_on_commit=False,
                join_transaction_mode="create_savepoint",
            )
            try:
                yield session
            finally:
                await session.close()
        finally:
            if outer_tx.is_active:
                await outer_tx.rollback()

    await engine.dispose()


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
    assert response.versioning_status == "not_requested"

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
    assert response.versioning_status == "not_requested"


@pytest.mark.asyncio
async def test_upload_asset_versioning_rejects_invalid_parent_id(monkeypatch) -> None:
    user = MagicMock()
    user.id = 42
    db = MagicMock()
    db.execute = AsyncMock(return_value=SimpleNamespace(one_or_none=lambda: None))
    account_service = MagicMock()
    asset_service = MagicMock()

    prepare_upload_mock = AsyncMock(
        return_value=UploadPrepResult(
            sha256="d" * 64,
            width=512,
            height=512,
            stored_key="cas/42/asset.png",
            local_path="/tmp/cas/asset.png",
            existing_asset=None,
        )
    )
    add_asset_mock = AsyncMock()

    monkeypatch.setattr(assets_upload, "prepare_upload", prepare_upload_mock)
    monkeypatch.setattr(assets_upload, "add_asset", add_asset_mock)

    with pytest.raises(HTTPException) as exc:
        await assets_upload.upload_asset_to_provider(
            user=user,
            db=db,
            account_service=account_service,
            asset_service=asset_service,
            file=_make_upload_file(),
            provider_id=None,
            save_target="library",
            upload_method="mask_draw",
            upload_context='{"version_parent_id":"999"}',
        )

    assert exc.value.status_code == 422
    assert "not found" in str(exc.value.detail)
    add_asset_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_upload_asset_versioning_rejects_when_dedup_hits_parent(monkeypatch) -> None:
    user = MagicMock()
    user.id = 42
    db = MagicMock()
    db.execute = AsyncMock(
        return_value=SimpleNamespace(
            one_or_none=lambda: SimpleNamespace(id=777, user_id=42),
        )
    )
    db.rollback = AsyncMock()
    account_service = MagicMock()
    asset_service = MagicMock()

    prepare_upload_mock = AsyncMock(
        return_value=UploadPrepResult(
            sha256="e" * 64,
            width=512,
            height=512,
            stored_key="cas/42/asset.png",
            local_path="/tmp/cas/asset.png",
            existing_asset=None,
        )
    )
    add_asset_mock = AsyncMock(
        return_value=SimpleNamespace(
            id=777,
            remote_url=None,
            media_type=MediaType.IMAGE,
            provider_asset_id="local_eeeeeeeeeeeeeeee",
        )
    )

    monkeypatch.setattr(assets_upload, "prepare_upload", prepare_upload_mock)
    monkeypatch.setattr(assets_upload, "add_asset", add_asset_mock)

    with pytest.raises(HTTPException) as exc:
        await assets_upload.upload_asset_to_provider(
            user=user,
            db=db,
            account_service=account_service,
            asset_service=asset_service,
            file=_make_upload_file(),
            provider_id=None,
            save_target="library",
            upload_method="mask_draw",
            upload_context='{"version_parent_id":"777"}',
        )

    assert exc.value.status_code == 409
    assert "deduplicated to the parent asset" in str(exc.value.detail)
    add_asset_mock.assert_awaited_once()
    db.rollback.assert_awaited()


@pytest.mark.asyncio
async def test_upload_asset_versioning_failure_rolls_back_asset_and_emits_no_created_event(
    monkeypatch,
    upload_db_session: AsyncSession,
) -> None:
    user_row = User(
        email="upload-versioning@example.com",
        username="upload_versioning_user",
        password_hash="hash",
    )
    upload_db_session.add(user_row)
    await upload_db_session.commit()
    await upload_db_session.refresh(user_row)

    parent_asset = await add_asset(
        upload_db_session,
        user_id=user_row.id,
        media_type=MediaType.IMAGE,
        provider_id="local",
        provider_asset_id="local_parent",
        remote_url=None,
        width=128,
        height=128,
        mime_type="image/png",
        file_size_bytes=128,
        sha256="f" * 64,
        stored_key="cas/parent.png",
        local_path="/tmp/parent.png",
        commit=True,
    )
    parent_asset_id = parent_asset.id
    baseline_asset_count = (
        await upload_db_session.execute(select(func.count()).select_from(Asset))
    ).scalar_one()
    baseline_family_count = (
        await upload_db_session.execute(select(func.count()).select_from(AssetVersionFamily))
    ).scalar_one()

    publish_mock = AsyncMock()
    monkeypatch.setattr(
        "pixsim7.backend.main.services.asset.asset_factory.event_bus.publish",
        publish_mock,
    )

    prepare_upload_mock = AsyncMock(
        return_value=UploadPrepResult(
            sha256="1" * 64,
            width=256,
            height=256,
            stored_key="cas/new.png",
            local_path="/tmp/new.png",
            existing_asset=None,
        )
    )
    monkeypatch.setattr(assets_upload, "prepare_upload", prepare_upload_mock)

    async def _fail_versioning(*args, **kwargs):
        raise RuntimeError("forced versioning failure")

    monkeypatch.setattr(
        "pixsim7.backend.main.services.asset.versioning.AssetVersioningService.apply_version_for_upload",
        _fail_versioning,
    )

    user = SimpleNamespace(id=user_row.id, preferences={})
    account_service = MagicMock()
    asset_service = SimpleNamespace(record_upload_attempt=AsyncMock())

    with pytest.raises(HTTPException) as exc:
        await assets_upload.upload_asset_to_provider(
            user=user,
            db=upload_db_session,
            account_service=account_service,
            asset_service=asset_service,
            file=_make_upload_file(),
            provider_id=None,
            save_target="library",
            upload_method="mask_draw",
            upload_context=f'{{"version_parent_id":"{parent_asset_id}"}}',
        )

    assert exc.value.status_code == 500
    assert "Failed to apply versioning for upload" in str(exc.value.detail)
    publish_mock.assert_not_awaited()

    asset_count_after = (
        await upload_db_session.execute(select(func.count()).select_from(Asset))
    ).scalar_one()
    family_count_after = (
        await upload_db_session.execute(select(func.count()).select_from(AssetVersionFamily))
    ).scalar_one()
    parent_after = (
        await upload_db_session.execute(
            select(Asset).where(Asset.id == parent_asset_id)
        )
    ).scalar_one_or_none()

    assert asset_count_after == baseline_asset_count
    assert family_count_after == baseline_family_count
    assert parent_after is not None
    assert parent_after.version_family_id is None
    assert parent_after.version_number is None


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
