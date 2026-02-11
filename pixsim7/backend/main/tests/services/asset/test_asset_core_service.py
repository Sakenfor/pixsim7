from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from pixsim7.backend.main.services.asset.core import ASSET_DELETED, AssetCoreService, event_bus


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar(self):
        return self._value


class _OneResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


@pytest.mark.asyncio
async def test_create_from_submission_returns_existing_source_generation_asset() -> None:
    db = AsyncMock()
    service = AssetCoreService(db=db, user_service=MagicMock())

    generation = MagicMock()
    generation.id = 777
    generation.asset_id = None
    generation.user_id = 42
    generation.prompt_version_id = None

    existing_asset = MagicMock()
    existing_asset.id = 9001

    submission = MagicMock()
    submission.status = "success"

    db.execute = AsyncMock(
        side_effect=[
            _OneResult(generation),      # SELECT ... FOR UPDATE generation
            _OneResult(existing_asset),  # SELECT asset by source_generation_id
        ]
    )
    db.get = AsyncMock(return_value=None)
    db.add = MagicMock()
    db.commit = AsyncMock()

    service._extract_prompt_from_generation = MagicMock(return_value=None)
    service._auto_tag_generated_asset = AsyncMock()
    service._create_generation_lineage = AsyncMock()

    with patch.object(event_bus, "publish", new=AsyncMock()) as publish_mock:
        asset = await service.create_from_submission(submission=submission, generation=generation)

    assert asset is existing_asset
    db.add.assert_not_called()
    db.commit.assert_not_awaited()
    service._auto_tag_generated_asset.assert_not_awaited()
    service._create_generation_lineage.assert_not_awaited()
    publish_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_delete_asset_uses_owner_id_and_deletes_storage_after_commit() -> None:
    db = AsyncMock()
    service = AssetCoreService(db=db, user_service=MagicMock())

    asset = MagicMock()
    asset.id = 55
    asset.user_id = 42
    asset.local_path = None
    asset.stored_key = "u/42/content/aa/hash.mp4"
    asset.content_id = None
    asset.provider_asset_id = None
    asset.provider_id = None

    requester = MagicMock()
    requester.id = 1

    service.get_asset_for_user = AsyncMock(return_value=asset)
    service._delete_from_provider = AsyncMock()

    commit_done = {"value": False}

    async def _commit_side_effect():
        commit_done["value"] = True

    async def _execute_side_effect(stmt):
        if "SELECT count(*) AS count_1" in str(stmt):
            params = stmt.compile().params
            # Stored key cleanup must not scope by requester user id.
            assert "user_id_1" not in params
            return _ScalarResult(0)
        return MagicMock()

    db.execute = AsyncMock(side_effect=_execute_side_effect)
    db.delete = AsyncMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock(side_effect=_commit_side_effect)

    storage = MagicMock()

    async def _storage_delete_side_effect(_key: str):
        assert commit_done["value"] is True
        return True

    storage.delete = AsyncMock(side_effect=_storage_delete_side_effect)

    with patch("pixsim7.backend.main.services.storage.get_storage_service", return_value=storage):
        with patch.object(event_bus, "publish", new=AsyncMock()) as publish_mock:
            await service.delete_asset(asset_id=55, user=requester, delete_from_provider=False)

    storage.delete.assert_awaited_once_with("u/42/content/aa/hash.mp4")
    publish_mock.assert_awaited_once()

    event_type, payload = publish_mock.await_args.args
    assert event_type == ASSET_DELETED
    assert payload["asset_id"] == 55
    assert payload["user_id"] == 42
    assert payload["deleted_by_user_id"] == 1

