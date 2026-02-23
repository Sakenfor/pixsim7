from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from pixsim7.backend.main.services.asset.core import ASSET_DELETED, AssetCoreService, event_bus
from pixsim7.backend.main.domain.generation.models import GenerationBatchItemManifest


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


@pytest.mark.asyncio
async def test_create_from_submission_persists_batch_manifest_from_run_context() -> None:
    db = AsyncMock()
    service = AssetCoreService(db=db, user_service=MagicMock())

    generation = MagicMock()
    generation.id = 101
    generation.asset_id = None
    generation.user_id = 42
    generation.prompt_version_id = None
    generation.reproducible_hash = "abc123"
    generation.final_prompt = "A test prompt"
    generation.operation_type = MagicMock()
    generation.operation_type.value = "image_to_video"
    generation.raw_params = {
        "generation_config": {
            "run_context": {
                "mode": "quickgen_each",
                "run_id": "c8ff6f4d-5af8-4f36-a768-f8d4d9097b78",
                "strategy": "each",
                "item_index": 2,
                "item_total": 5,
                "input_asset_ids": [11, 22],
            }
        }
    }
    generation.inputs = [{"asset": "asset:11"}, {"asset": "asset:22"}]

    submission = MagicMock()
    submission.status = "success"
    submission.provider_id = "pixverse"
    submission.account_id = 9
    submission.model = "v4.5"
    submission.response = {
        "provider_asset_id": "pv-asset-1",
        "asset_url": "https://example.com/out.mp4",
        "media_type": "video",
        "metadata": {},
    }

    db.execute = AsyncMock(
        side_effect=[
            _OneResult(generation),  # SELECT ... FOR UPDATE generation
            _OneResult(None),        # SELECT asset by source_generation_id
        ]
    )
    db.get = AsyncMock(return_value=None)
    db.refresh = AsyncMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    added: list = []

    def _add(obj):
        # Simulate DB assigning primary key after flush for the new asset.
        if obj.__class__.__name__ == "Asset" and getattr(obj, "id", None) is None:
            obj.id = 555
        added.append(obj)

    db.add = MagicMock(side_effect=_add)

    service._extract_prompt_from_generation = MagicMock(return_value="Prompt from generation")
    service._auto_tag_generated_asset = AsyncMock()
    service._create_generation_lineage = AsyncMock()

    with patch.object(event_bus, "publish", new=AsyncMock()):
        asset = await service.create_from_submission(submission=submission, generation=generation)

    assert asset.id == 555
    manifest = next((obj for obj in added if isinstance(obj, GenerationBatchItemManifest)), None)
    assert manifest is not None
    assert manifest.asset_id == 555
    assert str(manifest.batch_id) == "c8ff6f4d-5af8-4f36-a768-f8d4d9097b78"
    assert manifest.item_index == 2
    assert manifest.generation_id == 101
    assert manifest.manifest_metadata.get("strategy") == "each"
    assert manifest.manifest_metadata.get("input_asset_ids") == [11, 22]
