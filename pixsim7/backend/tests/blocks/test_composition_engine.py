"""Tests for composition_engine.derive_analysis_from_blocks."""

from __future__ import annotations

from pixsim7.backend.main.services.prompt.block.composition_engine import (
    derive_analysis_from_blocks,
    _derive_tags_from_composition_blocks,
    _extract_block_ontology_ids,
)


def _block(*, text: str = "", tags: dict | None = None, role: str | None = None, category: str | None = None) -> dict:
    block: dict = {"text": text}
    if tags is not None:
        block["tags"] = tags
    metadata: dict = {}
    if role is not None:
        metadata["role"] = role
    if category is not None:
        metadata["category"] = category
    if metadata:
        block["block_metadata"] = metadata
    return block


def test_bare_bool_tags_are_skipped() -> None:
    """Bare True flags (legacy role-category leakage) must not become tags."""
    blocks = [
        _block(
            text="something",
            tags={"character": True, "subject": True, "primary": True},
            role="entities:main_character",
        )
    ]
    out = _derive_tags_from_composition_blocks(blocks)
    assert "character" not in out
    assert "subject" not in out
    assert "primary" not in out
    assert "has:entities:main_character" in out


def test_string_valued_tags_become_namespaced() -> None:
    blocks = [_block(tags={"mood": "playful", "stance": "standing"}, role="materials:atmosphere")]
    out = _derive_tags_from_composition_blocks(blocks)
    assert "mood:playful" in out
    assert "stance:standing" in out


def test_ontology_ids_emitted_verbatim() -> None:
    blocks = [
        _block(
            tags={"ontology_ids": ["pose:walking_neutral", "mood:tender"]},
            role="entities:main_character",
        )
    ]
    out = _derive_tags_from_composition_blocks(blocks)
    assert "pose:walking_neutral" in out
    assert "mood:tender" in out


def test_ontology_ids_lifted_into_candidate_metadata() -> None:
    blocks = [
        _block(
            text="a tender moment",
            tags={"ontology_ids": ["mood:tender", "pose:walking_neutral"]},
            role="materials:romance",
        )
    ]
    result = derive_analysis_from_blocks(blocks, "a tender moment")
    candidate = result["candidates"][0]
    assert candidate["metadata"]["ontology_ids"] == [
        "mood:tender",
        "pose:walking_neutral",
    ]


def test_extract_block_ontology_ids_dedupes_and_filters_junk() -> None:
    block = {
        "tags": {
            "ontology_ids": [
                "pose:walking_neutral",
                "pose:walking_neutral",  # duplicate
                "",  # empty
                123,  # non-string
                "mood:tender",
            ]
        }
    }
    assert _extract_block_ontology_ids(block) == ["pose:walking_neutral", "mood:tender"]


def test_other_role_does_not_emit_has_tag() -> None:
    blocks = [_block(text="x", tags={"mood": "soft"}, role="other")]
    out = _derive_tags_from_composition_blocks(blocks)
    assert not any(t.startswith("has:") for t in out)
    assert "mood:soft" in out
