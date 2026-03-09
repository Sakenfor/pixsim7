from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from pixsim7.backend.main.services.generation.tracking import GenerationTrackingService


class _ScalarRows:
    def __init__(self, values):
        self._values = values

    def first(self):
        return self._values[0] if self._values else None

    def all(self):
        return list(self._values)


class _ExecuteResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return _ScalarRows(self._values)


def _user(user_id: int, *, admin: bool = False):
    return SimpleNamespace(id=user_id, is_admin=lambda: admin)


def _manifest(*, generation_id: int = 100):
    return SimpleNamespace(
        asset_id=10,
        batch_id=uuid4(),
        item_index=0,
        generation_id=generation_id,
        block_template_id=None,
        template_slug=None,
        roll_seed=None,
        selected_block_ids=["blk-1"],
        slot_results=[{"slot_key": "subject", "selected": True}],
        assembled_prompt="prompt",
        prompt_version_id=None,
        manifest_metadata={"mode": "quickgen_each", "strategy": "each", "input_asset_ids": [1, 2]},
        created_at=datetime.now(timezone.utc),
    )


@pytest.mark.asyncio
async def test_asset_tracking_hides_inaccessible_generation_references() -> None:
    asset = SimpleNamespace(id=10, user_id=1)
    manifest = _manifest(generation_id=222)
    foreign_generation = SimpleNamespace(id=222, user_id=2)
    db = SimpleNamespace(
        get=AsyncMock(side_effect=[asset, manifest, foreign_generation]),
        execute=AsyncMock(return_value=_ExecuteResult([])),
    )
    service = GenerationTrackingService(db)

    result = await service.get_asset_tracking(10, _user(1))

    assert result is not None
    assert result["generation"] is None
    assert result["latest_submission"] is None
    assert any("not accessible" in warning for warning in result["consistency_warnings"])


@pytest.mark.asyncio
async def test_run_tracking_filters_generation_visibility_before_submissions() -> None:
    manifest = _manifest(generation_id=333)
    db = SimpleNamespace(
        execute=AsyncMock(
            side_effect=[
                _ExecuteResult([manifest]),  # manifests query
                _ExecuteResult([]),  # generations query after ownership filter
            ]
        ),
    )
    service = GenerationTrackingService(db)

    result = await service.get_run_tracking(uuid4(), _user(1))

    assert result is not None
    assert result["items"][0]["generation_status"] is None
    assert result["items"][0]["latest_submission"] is None
    assert "missing or inaccessible generation" in result["items"][0]["item_warnings"][0]
    # No third execute() call means submission batch lookup was skipped.
    assert db.execute.await_count == 2
    generation_query = db.execute.await_args_list[1].args[0]
    assert "generations.user_id" in str(generation_query).lower()


def test_manifest_summary_coerces_input_asset_ids_to_ints() -> None:
    manifest = _manifest()
    manifest.manifest_metadata = {"input_asset_ids": [1, "2", "bad", None, 3.0]}

    summary = GenerationTrackingService._manifest_summary(manifest)

    assert summary["input_asset_ids"] == [1, 2, 3]
