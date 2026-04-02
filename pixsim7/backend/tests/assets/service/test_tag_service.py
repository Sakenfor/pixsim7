from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from pixsim7.backend.main.services.tag_service import TagService


class _ScalarRows:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)

    def first(self):
        return self._rows[0] if self._rows else None


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return _ScalarRows(self._rows)


class _RowResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)


@pytest.mark.asyncio
async def test_sync_prompt_version_analyzer_tags_prunes_stale_assertions() -> None:
    db = AsyncMock()
    service = TagService(db)
    prompt_version_id = uuid4()

    existing_keep = SimpleNamespace(prompt_version_id=prompt_version_id, tag_id=10, source="analyzer")
    existing_stale = SimpleNamespace(prompt_version_id=prompt_version_id, tag_id=99, source="analyzer")

    db.execute = AsyncMock(return_value=_Result([existing_keep, existing_stale]))
    db.delete = AsyncMock()
    db.commit = AsyncMock()

    resolved_tag = SimpleNamespace(id=10, slug="camera:closeup")
    service._resolve_tag_for_assignment = AsyncMock(return_value=resolved_tag)
    service._assign_tags = AsyncMock(return_value=[resolved_tag])

    assigned = await service.sync_prompt_version_analyzer_tags(
        prompt_version_id=prompt_version_id,
        tag_slugs=["camera:closeup"],
        auto_create=True,
    )

    assert assigned == [resolved_tag]
    db.delete.assert_awaited_once_with(existing_stale)
    db.commit.assert_awaited_once()
    service._assign_tags.assert_awaited_once()

    assign_kwargs = service._assign_tags.await_args.kwargs
    assert assign_kwargs["target_id"] == prompt_version_id
    assert assign_kwargs["tag_slugs"] == ["camera:closeup"]
    assert assign_kwargs["source"] == "analyzer"
    assert assign_kwargs["auto_create"] is False


@pytest.mark.asyncio
async def test_sync_prompt_version_analyzer_tags_empty_input_clears_analyzer_rows() -> None:
    db = AsyncMock()
    service = TagService(db)
    prompt_version_id = uuid4()

    existing = SimpleNamespace(prompt_version_id=prompt_version_id, tag_id=7, source="analyzer")
    db.execute = AsyncMock(return_value=_Result([existing]))
    db.delete = AsyncMock()
    db.commit = AsyncMock()

    service._assign_tags = AsyncMock(return_value=[])

    assigned = await service.sync_prompt_version_analyzer_tags(
        prompt_version_id=prompt_version_id,
        tag_slugs=[],
        auto_create=True,
    )

    assert assigned == []
    db.delete.assert_awaited_once_with(existing)
    db.commit.assert_awaited_once()
    service._assign_tags.assert_not_called()


@pytest.mark.asyncio
async def test_list_prompt_version_tag_assertions_includes_provenance_fields() -> None:
    db = AsyncMock()
    service = TagService(db)
    prompt_version_id = uuid4()

    created_at = datetime.now(timezone.utc)
    tag = SimpleNamespace(
        id=3,
        slug="camera:closeup",
        namespace="camera",
        name="closeup",
        display_name="Camera: Closeup",
    )
    assertion = SimpleNamespace(
        source="analyzer",
        confidence=0.82,
        created_at=created_at,
    )
    db.execute = AsyncMock(return_value=_RowResult([(tag, assertion)]))

    rows = await service.list_prompt_version_tag_assertions(prompt_version_id)

    assert len(rows) == 1
    assert rows[0]["tag"] is tag
    assert rows[0]["source"] == "analyzer"
    assert rows[0]["confidence"] == 0.82
    assert rows[0]["created_at"] == created_at
