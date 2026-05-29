"""Tests for composition_engine.derive_analysis_from_blocks."""

from __future__ import annotations

from pixsim7.backend.main.services.prompt.block.composition_engine import (
    derive_analysis_from_blocks,
    _collect_candidate_ontology_ids,
    _extract_block_ontology_ids,
    _semantic_tag_ontology_ids,
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


def test_bare_bool_tags_are_not_lifted() -> None:
    """Bare True flags (legacy role-category leakage) must not become tags."""
    out = _semantic_tag_ontology_ids({"character": True, "subject": True, "primary": True})
    assert out == []


def test_string_valued_tags_become_namespaced() -> None:
    out = _semantic_tag_ontology_ids({"mood": "playful", "stance": "standing"})
    assert "mood:playful" in out
    assert "stance:standing" in out


def test_bookkeeping_tags_are_dropped() -> None:
    """Provenance/scope keys are noise and must not become asset tags."""
    out = _semantic_tag_ontology_ids(
        {
            "tone": "slapstick",
            "arc": "comedy",
            "source_pack": "genre_tone_primitives",
            "scope": "global",
            "world": "bananza_boat",
            "duration_sec": "6.0",
        }
    )
    assert "tone:slapstick" in out
    assert "arc:comedy" in out
    assert not any(t.startswith(("source_pack:", "scope:", "world:", "duration_sec:")) for t in out)


def test_authored_tone_arc_lifted_into_candidate_metadata() -> None:
    """Authored tone:/arc:/mood: annotations survive into the candidate path."""
    blocks = [
        _block(
            text="a slapstick beat",
            tags={"mood": "playful", "arc": "comedy", "tone": "slapstick", "source_pack": "x"},
            role="materials:atmosphere",
        )
    ]
    result = derive_analysis_from_blocks(blocks, "a slapstick beat")
    ontology_ids = result["candidates"][0]["metadata"]["ontology_ids"]
    assert "mood:playful" in ontology_ids
    assert "arc:comedy" in ontology_ids
    assert "tone:slapstick" in ontology_ids
    assert "source_pack:x" not in ontology_ids


def test_explicit_ontology_ids_merged_first() -> None:
    blocks = [
        _block(
            text="a tender moment",
            tags={"ontology_ids": ["mood:tender", "pose:walking_neutral"], "tone": "soft"},
            role="materials:romance",
        )
    ]
    result = derive_analysis_from_blocks(blocks, "a tender moment")
    ontology_ids = result["candidates"][0]["metadata"]["ontology_ids"]
    # Explicit ontology_ids keep their order and lead; semantic tags follow.
    assert ontology_ids[:2] == ["mood:tender", "pose:walking_neutral"]
    assert "tone:soft" in ontology_ids


def test_collect_candidate_ontology_ids_dedupes() -> None:
    block = _block(tags={"ontology_ids": ["mood:tender"], "mood": "tender"})
    # mood:tender appears via both the explicit list and the synthesized tag.
    assert _collect_candidate_ontology_ids(block) == ["mood:tender"]


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
