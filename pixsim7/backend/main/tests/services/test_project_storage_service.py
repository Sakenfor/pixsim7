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


