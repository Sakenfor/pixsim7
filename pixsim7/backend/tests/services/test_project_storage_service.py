from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.exc import IntegrityError

from pixsim7.backend.main.services.game.project_storage import GameProjectStorageService


class _Bundle:
    schema_version = 3

    def model_dump(self, mode: str = "json") -> dict:
        assert mode == "json"
        return {
            "schema_version": self.schema_version,
            "core": {
                "world": {"name": "W", "meta": {}, "world_time": 0.0},
                "locations": [],
                "npcs": [],
                "scenes": [],
                "items": [],
            },
            "extensions": {},
        }


@pytest.mark.asyncio
async def test_get_project_excludes_drafts_by_default() -> None:
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result)

    service = GameProjectStorageService(db)
    await service.get_project(owner_user_id=7, project_id=11)

    stmt = db.execute.await_args.args[0]
    sql = str(stmt).lower()

    assert "is_draft" in sql
    assert "= false" in sql


@pytest.mark.asyncio
async def test_get_project_can_include_drafts() -> None:
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result)

    service = GameProjectStorageService(db)
    await service.get_project(owner_user_id=7, project_id=11, include_drafts=True)

    stmt = db.execute.await_args.args[0]
    sql = str(stmt).lower()

    assert "is_draft = false" not in sql


@pytest.mark.asyncio
async def test_upsert_draft_recovers_from_integrity_race() -> None:
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock(
        side_effect=[
            IntegrityError("insert", {"owner_user_id": 1}, Exception("duplicate_draft_scope")),
            None,
        ]
    )
    db.rollback = AsyncMock()
    db.refresh = AsyncMock()

    service = GameProjectStorageService(db)
    existing = SimpleNamespace(bundle={}, schema_version=1, source_world_id=None)
    service.get_latest_draft = AsyncMock(side_effect=[None, existing])

    bundle = _Bundle()
    saved = await service.upsert_draft(
        owner_user_id=1,
        bundle=bundle,
        source_world_id=99,
        draft_source_project_id=5,
    )

    assert saved is existing
    assert existing.bundle == bundle.model_dump(mode="json")
    assert existing.schema_version == 3
    assert existing.source_world_id == 99

    db.rollback.assert_awaited_once()
    assert db.commit.await_count == 2
    db.refresh.assert_awaited_once_with(existing)

    first_added = db.add.call_args_list[0].args[0]
    assert first_added.is_draft is True
    assert first_added.draft_source_project_id == 5


@pytest.mark.asyncio
async def test_save_project_defaults_new_snapshot_to_user_provenance() -> None:
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    service = GameProjectStorageService(db)
    bundle = _Bundle()

    await service.save_project(
        owner_user_id=1,
        name="New Project",
        bundle=bundle,
    )

    added = db.add.call_args.args[0]
    assert added.origin_kind == "user"
    assert added.origin_source_key is None
    assert added.origin_parent_project_id is None
    assert added.origin_meta == {}


@pytest.mark.asyncio
async def test_save_project_overwrite_preserves_existing_provenance_without_request() -> None:
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    existing = SimpleNamespace(
        id=7,
        name="Existing",
        source_world_id=1,
        schema_version=1,
        bundle={},
        origin_kind="seed",
        origin_source_key="bananza_boat_slice_v1",
        origin_parent_project_id=None,
        origin_meta={"seed_key": "bananza_boat_slice_v1"},
    )

    service = GameProjectStorageService(db)
    service.get_project = AsyncMock(return_value=existing)
    bundle = _Bundle()

    await service.save_project(
        owner_user_id=1,
        name="Existing Updated",
        bundle=bundle,
        overwrite_project_id=7,
    )

    assert existing.origin_kind == "seed"
    assert existing.origin_source_key == "bananza_boat_slice_v1"
    assert existing.origin_parent_project_id is None
    assert existing.origin_meta == {"seed_key": "bananza_boat_slice_v1"}


@pytest.mark.asyncio
async def test_duplicate_project_sets_duplicate_provenance() -> None:
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    source = SimpleNamespace(
        id=11,
        source_world_id=3,
        schema_version=1,
        origin_source_key="bananza_boat_slice_v1",
        origin_meta={"seed_key": "bananza_boat_slice_v1"},
        bundle={"core": {"world": {"name": "Bananza"}}},
    )

    service = GameProjectStorageService(db)
    service.get_project = AsyncMock(return_value=source)

    await service.duplicate_project(
        owner_user_id=1,
        project_id=11,
        name="Copy",
    )

    added = db.add.call_args.args[0]
    assert added.origin_kind == "duplicate"
    assert added.origin_parent_project_id == 11
    assert added.origin_source_key == "bananza_boat_slice_v1"
    assert added.origin_meta.get("duplicated_from_project_id") == 11


@pytest.mark.asyncio
async def test_get_latest_project_by_origin_source_key_filters_non_drafts() -> None:
    db = AsyncMock()
    result = MagicMock()
    expected = SimpleNamespace(id=9)
    result.scalar_one_or_none.return_value = expected
    db.execute = AsyncMock(return_value=result)

    service = GameProjectStorageService(db)
    resolved = await service.get_latest_project_by_origin_source_key(
        owner_user_id=5,
        source_key="  bananza.seed.v1  ",
    )

    assert resolved is expected
    stmt = db.execute.await_args.args[0]
    sql = str(stmt).lower()
    assert "origin_source_key" in sql
    assert "is_draft = false" in sql
    assert "order by" in sql


@pytest.mark.asyncio
async def test_get_latest_project_by_origin_source_key_skips_blank_key() -> None:
    db = AsyncMock()
    db.execute = AsyncMock()

    service = GameProjectStorageService(db)
    resolved = await service.get_latest_project_by_origin_source_key(
        owner_user_id=5,
        source_key="   ",
    )

    assert resolved is None
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_get_latest_project_by_name_filters_non_drafts() -> None:
    db = AsyncMock()
    result = MagicMock()
    expected = SimpleNamespace(id=12)
    result.scalar_one_or_none.return_value = expected
    db.execute = AsyncMock(return_value=result)

    service = GameProjectStorageService(db)
    resolved = await service.get_latest_project_by_name(
        owner_user_id=7,
        name="  Bananza Project  ",
    )

    assert resolved is expected
    stmt = db.execute.await_args.args[0]
    sql = str(stmt).lower()
    assert " is_draft = false" in sql
    assert "name" in sql

