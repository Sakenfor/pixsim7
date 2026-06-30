"""Tests for the hover-fed cohort-count endpoints.

These split the sibling/cohort counts off the asset response (they ran ~7 GROUP
BY queries per asset on the hot path) into dedicated lazy endpoints. The handlers
just resolve ownership and delegate to ``AssetSiblingCountService.counts_map`` —
so these tests assert the wiring (ownership scoping, owner-grouping, skip of
missing ids, error mapping) with the service mocked. See plan
``media-card-sibling-badges``.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from fastapi import HTTPException

from pixsim7.backend.main.api.v1 import assets as assets_api
from pixsim7.backend.main.shared.errors import ResourceNotFoundError


def _asset(asset_id: int, user_id: int) -> MagicMock:
    asset = MagicMock()
    asset.id = asset_id
    asset.user_id = user_id
    return asset


@pytest.mark.asyncio
async def test_single_cohort_counts_returns_service_map(monkeypatch) -> None:
    asset = _asset(7, 42)
    asset_service = MagicMock()
    asset_service.get_asset_for_user = AsyncMock(return_value=asset)

    seen_cutoff: list = []

    class _Svc:
        def __init__(self, db):
            pass

        async def counts_map(self, assets, owner_user_id, broken_score_cutoff=None):
            assert owner_user_id == 42  # owner-scoped to the asset's user
            seen_cutoff.append(broken_score_cutoff)
            return {a.id: {"p": 3, "ip": 2} for a in assets}

    monkeypatch.setattr(assets_api, "AssetSiblingCountService", _Svc)

    user = MagicMock()
    result = await assets_api.get_asset_cohort_counts(
        asset_id=7,
        user=user,
        asset_service=asset_service,
        db=MagicMock(),
        broken_score_cutoff=5,
    )

    assert result == {"p": 3, "ip": 2}
    # The badge's "hide broken" cutoff is threaded through to the count service.
    assert seen_cutoff == [5]
    asset_service.get_asset_for_user.assert_awaited_once_with(7, user)


@pytest.mark.asyncio
async def test_single_cohort_counts_empty_when_no_facets(monkeypatch) -> None:
    asset_service = MagicMock()
    asset_service.get_asset_for_user = AsyncMock(return_value=_asset(9, 1))

    class _Empty:
        def __init__(self, db):
            pass

        async def counts_map(self, assets, owner_user_id, broken_score_cutoff=None):
            return {}

    monkeypatch.setattr(assets_api, "AssetSiblingCountService", _Empty)

    result = await assets_api.get_asset_cohort_counts(
        asset_id=9, user=MagicMock(), asset_service=asset_service, db=MagicMock()
    )
    assert result == {}


@pytest.mark.asyncio
async def test_single_cohort_counts_404_for_missing_asset(monkeypatch) -> None:
    asset_service = MagicMock()
    asset_service.get_asset_for_user = AsyncMock(
        side_effect=ResourceNotFoundError("Asset", 404)
    )

    with pytest.raises(HTTPException) as exc:
        await assets_api.get_asset_cohort_counts(
            asset_id=404, user=MagicMock(), asset_service=asset_service, db=MagicMock()
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_bulk_cohort_counts_groups_by_owner_and_skips_missing(monkeypatch) -> None:
    by_id = {1: _asset(1, 42), 2: _asset(2, 42), 3: _asset(3, 99)}

    async def _get(asset_id, user):
        if asset_id not in by_id:
            raise ResourceNotFoundError("Asset", asset_id)
        return by_id[asset_id]

    asset_service = MagicMock()
    asset_service.get_asset_for_user = AsyncMock(side_effect=_get)

    seen: list = []

    class _Svc:
        def __init__(self, db):
            pass

        async def counts_map(self, assets, owner_user_id, broken_score_cutoff=None):
            seen.append((owner_user_id, tuple(a.id for a in assets), broken_score_cutoff))
            return {a.id: {"p": owner_user_id} for a in assets}

    monkeypatch.setattr(assets_api, "AssetSiblingCountService", _Svc)

    request = assets_api.BulkCohortCountsRequest(asset_ids=[1, 2, 3, 404], broken_score_cutoff=5)
    result = await assets_api.bulk_get_cohort_counts(
        request=request, user=MagicMock(), asset_service=asset_service, db=MagicMock()
    )

    # Missing id 404 is skipped; counts grouped within each owner's library.
    assert result == {1: {"p": 42}, 2: {"p": 42}, 3: {"p": 99}}
    # The cutoff from the request body is threaded into each owner's count call.
    assert (42, (1, 2), 5) in seen
    assert (99, (3,), 5) in seen


@pytest.mark.asyncio
async def test_bulk_cohort_counts_empty_when_nothing_resolves(monkeypatch) -> None:
    asset_service = MagicMock()
    asset_service.get_asset_for_user = AsyncMock(
        side_effect=ResourceNotFoundError("Asset", 0)
    )

    # Service must not even be constructed when no assets resolve.
    def _boom(db):
        raise AssertionError("counts service should not run for an empty resolve")

    monkeypatch.setattr(assets_api, "AssetSiblingCountService", _boom)

    request = assets_api.BulkCohortCountsRequest(asset_ids=[1, 2])
    result = await assets_api.bulk_get_cohort_counts(
        request=request, user=MagicMock(), asset_service=asset_service, db=MagicMock()
    )
    assert result == {}
