from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from sqlalchemy import literal, select

from pixsim7.backend.main.services.asset.core import AssetCoreService
from pixsim7.backend.main.services.asset._filters import AssetSearchFilters


class _RowsResult:
    def scalars(self):
        return self

    def all(self):
        return []


def _make_service():
    service = AssetCoreService(db=MagicMock(), user_service=MagicMock())
    service.db.execute = AsyncMock(return_value=_RowsResult())
    # Capture the kwargs the query-builder receives; return a trivial valid Select.
    service._build_asset_search_query = MagicMock(return_value=select(literal(1)))
    return service


def _user():
    user = MagicMock()
    user.id = 42
    user.is_admin.return_value = False
    return user


@pytest.mark.asyncio
async def test_semantic_prompt_filter_resolves_cohort_into_query() -> None:
    """similar_prompt_version_id → find_similar neighbors → in_() cohort passed
    to the query-builder."""
    service = _make_service()
    source_id = uuid4()
    neighbor_a, neighbor_b = uuid4(), uuid4()

    find_similar = AsyncMock(
        return_value=[
            {"version_id": str(neighbor_a)},
            {"version_id": str(neighbor_b)},
        ]
    )
    with patch(
        "pixsim7.backend.main.services.embedding.prompt_service."
        "PromptEmbeddingService.find_similar",
        new=find_similar,
    ):
        sf = AssetSearchFilters(
            similar_prompt_version_id=source_id,
            prompt_similarity_threshold=0.6,
        )
        await service.list_assets(user=_user(), sf=sf, limit=5)

    # find_similar called with the source version + similarity threshold
    assert find_similar.await_count == 1
    _, kwargs = find_similar.await_args
    assert find_similar.await_args.args[0] == source_id
    assert kwargs["min_similarity"] == 0.6

    # The resolved neighbor IDs were threaded into the query-builder
    builder_kwargs = service._build_asset_search_query.call_args.kwargs
    assert builder_kwargs["similar_prompt_version_ids"] == [neighbor_a, neighbor_b]


@pytest.mark.asyncio
async def test_unembedded_source_yields_empty_cohort() -> None:
    """A source version with no embedding → empty cohort (no rows), not a 500."""
    from pixsim7.backend.main.services.embedding.prompt_service import (
        PromptVersionNotEmbeddedError,
    )

    service = _make_service()
    with patch(
        "pixsim7.backend.main.services.embedding.prompt_service."
        "PromptEmbeddingService.find_similar",
        new=AsyncMock(side_effect=PromptVersionNotEmbeddedError("nope")),
    ):
        sf = AssetSearchFilters(similar_prompt_version_id=uuid4())
        await service.list_assets(user=_user(), sf=sf, limit=5)

    builder_kwargs = service._build_asset_search_query.call_args.kwargs
    # Empty list (not None) → query-builder applies a false predicate → no rows.
    assert builder_kwargs["similar_prompt_version_ids"] == []


@pytest.mark.asyncio
async def test_no_prompt_filter_passes_none() -> None:
    """Without the filter, the cohort param is None (filter inert)."""
    service = _make_service()
    sf = AssetSearchFilters()
    await service.list_assets(user=_user(), sf=sf, limit=5)
    builder_kwargs = service._build_asset_search_query.call_args.kwargs
    assert builder_kwargs["similar_prompt_version_ids"] is None


def test_query_builder_applies_in_clause() -> None:
    """The query-builder turns a non-empty cohort into an IN filter, and an
    empty cohort into a false predicate."""
    service = AssetCoreService(db=MagicMock(), user_service=MagicMock())
    user = _user()
    sf = AssetSearchFilters()

    ids = [uuid4(), uuid4()]
    sql_in = str(
        service._build_asset_search_query(
            user=user, sf=sf, similar_prompt_version_ids=ids
        )
    )
    assert "assets.prompt_version_id IN" in sql_in

    sql_empty = str(
        service._build_asset_search_query(
            user=user, sf=sf, similar_prompt_version_ids=[]
        )
    ).lower()
    assert "false" in sql_empty
