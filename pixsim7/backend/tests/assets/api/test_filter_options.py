from types import SimpleNamespace

import pytest

from pixsim7.backend.main.api.v1.assets_search import FilterOptionsRequest, get_filter_options
from pixsim7.backend.main.services.asset.filter_registry import asset_filter_registry


@pytest.mark.asyncio
async def test_filter_definitions_ungated_but_options_gated_by_context():
    """Definitions are listed ungated (context=None) so context-dependent filters
    (e.g. the Folder filter) still render their chip up front, while options stay
    gated on the live context so the heavy per-source option queries don't run on
    the initial gallery load."""
    list_filters_contexts = []
    build_options_contexts = []

    def list_filters(*, include=None, context=None):
        list_filters_contexts.append(context)
        return [
            SimpleNamespace(
                key="media_type",
                type="enum",
                label="Media Type",
                description=None,
                depends_on=None,
                multi=True,
                match_modes=None,
            )
        ]

    async def build_options(db, **kwargs):
        build_options_contexts.append(kwargs["context"])
        return {}

    from unittest.mock import patch

    with patch.object(asset_filter_registry, "list_filters", list_filters), patch.object(
        asset_filter_registry, "build_options", build_options
    ):
        response = await get_filter_options(
            user=SimpleNamespace(id=1),
            db=SimpleNamespace(),
            request=FilterOptionsRequest(),
        )

    assert [definition.key for definition in response.filters] == ["media_type"]
    # Definitions ungated -> None; options gated on the (empty) live context -> {}.
    assert list_filters_contexts == [None]
    assert build_options_contexts == [{}]
