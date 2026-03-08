from __future__ import annotations

from pixsim7.backend.main.shared.entity_refs import (
    parse_entity_ref,
    entity_ref_to_string,
    extract_entity_id,
)


def test_parse_entity_ref_supports_string_and_default_type() -> None:
    ref = parse_entity_ref("asset:42")
    assert ref is not None
    assert ref.type == "asset"
    assert ref.id == 42

    ref_from_int = parse_entity_ref(7, default_type="asset")
    assert ref_from_int is not None
    assert ref_from_int.type == "asset"
    assert ref_from_int.id == 7


def test_parse_entity_ref_supports_scene_subtype() -> None:
    ref = parse_entity_ref("scene:game:12")
    assert ref is not None
    assert ref.type == "scene"
    assert ref.id == 12
    assert ref.meta == {"scene_type": "game"}


def test_entity_ref_to_string_and_extract_entity_id() -> None:
    assert entity_ref_to_string({"type": "asset", "id": 99}) == "asset:99"
    assert extract_entity_id({"type": "asset", "id": 99}, entity_type="asset") == 99
    assert extract_entity_id({"type": "scene", "id": 5}, entity_type="asset") is None
    assert extract_entity_id("bad-ref", entity_type="asset") is None

