from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from pixsim7.backend.main.api.v1 import assets as assets_api
from pixsim7.backend.main.domain.enums import MediaType, SyncStatus
from pixsim7.backend.main.shared.schemas.asset_schemas import AssetResponse, AssetSearchRequest


def _minimal_asset_response(*, asset_id: int, user_id: int, created_at: datetime) -> AssetResponse:
    return AssetResponse(
        id=asset_id,
        user_id=user_id,
        media_type=MediaType.IMAGE,
        provider_id="pixverse",
        provider_asset_id=f"provider-{asset_id}",
        sync_status=SyncStatus.REMOTE,
        created_at=created_at,
    )


@pytest.mark.asyncio
async def test_search_assets_uses_similarity_cursor_mode(monkeypatch) -> None:
    now = datetime.now(timezone.utc)
    fake_asset = MagicMock()
    fake_asset.id = 7
    fake_asset.created_at = now

    asset_service = MagicMock()
    asset_service.list_assets = AsyncMock(return_value=[fake_asset])

    db = MagicMock()
    user = MagicMock()
    user.id = 42
    user.is_admin.return_value = False

    monkeypatch.setattr(
        assets_api,
        "build_asset_response_with_tags",
        AsyncMock(return_value=_minimal_asset_response(asset_id=7, user_id=42, created_at=now)),
    )

    response = await assets_api.search_assets(
        user=user,
        asset_service=asset_service,
        db=db,
        request=AssetSearchRequest(limit=1, similar_to=7),
    )

    assert response.next_cursor == "simoff:1"
    assert response.offset == 0
    assert len(response.assets) == 1
    assert asset_service.list_assets.await_args.kwargs["similar_to"] == 7
    assert asset_service.list_assets.await_args.kwargs["offset"] == 0
    assert asset_service.list_assets.await_args.kwargs["cursor"] is None


@pytest.mark.asyncio
async def test_search_assets_parses_similarity_cursor_as_offset(monkeypatch) -> None:
    now = datetime.now(timezone.utc)
    fake_asset = MagicMock()
    fake_asset.id = 8
    fake_asset.created_at = now

    asset_service = MagicMock()
    asset_service.list_assets = AsyncMock(return_value=[fake_asset])

    db = MagicMock()
    user = MagicMock()
    user.id = 42
    user.is_admin.return_value = False

    monkeypatch.setattr(
        assets_api,
        "build_asset_response_with_tags",
        AsyncMock(return_value=_minimal_asset_response(asset_id=8, user_id=42, created_at=now)),
    )

    response = await assets_api.search_assets(
        user=user,
        asset_service=asset_service,
        db=db,
        request=AssetSearchRequest(limit=1, similar_to=8, cursor="simoff:10"),
    )

    assert response.offset == 10
    assert response.next_cursor == "simoff:11"
    assert asset_service.list_assets.await_args.kwargs["offset"] == 10
    assert asset_service.list_assets.await_args.kwargs["cursor"] is None


@pytest.mark.asyncio
async def test_search_assets_keeps_cursor_for_standard_mode(monkeypatch) -> None:
    now = datetime.now(timezone.utc)
    fake_asset = MagicMock()
    fake_asset.id = 11
    fake_asset.created_at = now

    asset_service = MagicMock()
    asset_service.list_assets = AsyncMock(return_value=[fake_asset])

    db = MagicMock()
    user = MagicMock()
    user.id = 42
    user.is_admin.return_value = False

    monkeypatch.setattr(
        assets_api,
        "build_asset_response_with_tags",
        AsyncMock(return_value=_minimal_asset_response(asset_id=11, user_id=42, created_at=now)),
    )

    response = await assets_api.search_assets(
        user=user,
        asset_service=asset_service,
        db=db,
        request=AssetSearchRequest(limit=1),
    )

    assert response.next_cursor is not None
    assert response.next_cursor.endswith("|11")
