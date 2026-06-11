"""Tests for GET /api/v1/prompts/meta/vocabularies.

The endpoint surfaces the unified VocabRegistry to the prompt editor so
variable facets (ACTOR1_HIP, ...) can be recognised + autocompleted against
real vocab members. These assert the generic enumeration (all_of + the
per-type keywords attr) produces the expected shape, the `types` filter works,
and unknown types are dropped rather than erroring.

Calls the route coroutine directly via asyncio.run so the test is independent
of pytest-asyncio configuration.
"""
from __future__ import annotations

import asyncio

from pixsim7.backend.main.api.v1.prompts.meta import (
    VocabulariesResponse,
    get_prompt_vocabularies,
)

TEST_SUITE = {
    "id": "prompt-vocabularies-endpoint",
    "label": "Prompt Vocabularies Endpoint",
    "kind": "contract",
    "category": "backend/prompt-block",
    "subcategory": "vocabularies",
    "covers": [
        "pixsim7/backend/main/api/v1/prompts/meta.py",
    ],
    "order": 26.4,
}


def _call(types: str | None = None) -> VocabulariesResponse:
    return asyncio.run(get_prompt_vocabularies(types=types))


def test_types_filter_returns_only_requested() -> None:
    resp = _call("parts,poses")
    assert isinstance(resp, VocabulariesResponse)
    assert {v.type for v in resp.vocabularies} == {"parts", "poses"}


def test_items_carry_id_label_and_keywords() -> None:
    resp = _call("parts")
    parts = next(v for v in resp.vocabularies if v.type == "parts")
    assert parts.items, "parts vocab should be non-empty"
    for item in parts.items:
        assert item.id and item.label
    # parts declare keywords_attr='keywords' — at least some items expose them.
    assert any(item.keywords for item in parts.items)


def test_unknown_types_are_dropped_not_errored() -> None:
    resp = _call("parts,definitely_not_a_vocab")
    assert {v.type for v in resp.vocabularies} == {"parts"}


def test_no_filter_returns_all_known_facet_types() -> None:
    resp = _call()
    types = {v.type for v in resp.vocabularies}
    # The vocab types the default facet axes reference must all be present.
    assert {"parts", "poses", "locations", "camera"} <= types
