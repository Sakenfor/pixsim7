"""
Advanced tests for runtime_kind and template_kind normalization.

Checkpoint: verification (gameobject-runtime-refactor-v1)
Tests normalize_runtime_kind / normalize_template_kind edge cases
and extraction helpers in game_objects.py.
"""
from __future__ import annotations

import pytest

try:
    from pixsim7.backend.main.services.links.template_resolver import (
        normalize_runtime_kind,
        normalize_template_kind,
    )
    from pixsim7.backend.main.api.v1.game_objects import (
        _extract_capabilities,
        _extract_components,
        _extract_tags,
        _extract_template_binding,
        GAME_OBJECT_META_KEY,
    )

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestNormalizeRuntimeKind:
    """Parametric tests for normalize_runtime_kind()."""

    @pytest.mark.parametrize(
        "input_kind,expected",
        [
            ("npc", "npc"),
            ("item", "item"),
            ("prop", "prop"),
            ("location", "location"),
            # Alias forms
            ("gameNpc", "npc"),
            ("GAMENPC", "npc"),
            ("game-npc", "npc"),
            ("game_npc", "npc"),
            ("character_instance", "npc"),
            ("game_item", "item"),
            ("game-item", "item"),
            ("game_prop", "prop"),
            ("game-prop", "prop"),
            ("game_location", "location"),
            ("game-location", "location"),
            ("npc_instance", "npc"),
            ("npc-instance", "npc"),
            ("character", "npc"),
            ("characterinstance", "npc"),
            ("gameItem", "item"),
            ("item_instance", "item"),
            ("item-instance", "item"),
            ("gameProp", "prop"),
            ("prop_instance", "prop"),
            ("prop-instance", "prop"),
            ("gameLocation", "location"),
            ("location_instance", "location"),
            ("location-instance", "location"),
            # Whitespace handling
            ("  npc  ", "npc"),
            ("  gameNpc  ", "npc"),
            # Pass-through for unknown kinds
            ("custom_kind", "custom_kind"),
            ("trigger", "trigger"),
            ("player", "player"),
            # Empty / whitespace-only
            ("", ""),
            ("   ", ""),
        ],
    )
    def test_normalize_runtime_kind(self, input_kind, expected):
        assert normalize_runtime_kind(input_kind) == expected

    @pytest.mark.parametrize(
        "input_kind,expected",
        [
            ("characterInstance", "characterInstance"),
            ("characterinstance", "characterInstance"),
            ("character_instance", "characterInstance"),
            ("npcTemplate", "characterInstance"),
            ("npc_template", "characterInstance"),
            ("npc-template", "characterInstance"),
            ("itemTemplate", "itemTemplate"),
            ("item_template", "itemTemplate"),
            ("item-template", "itemTemplate"),
            ("propTemplate", "propTemplate"),
            ("prop_template", "propTemplate"),
            ("locationTemplate", "locationTemplate"),
            ("location_template", "locationTemplate"),
            # Whitespace
            ("  npc_template  ", "characterInstance"),
            # Pass-through
            ("customTemplate", "customTemplate"),
            ("", ""),
        ],
    )
    def test_normalize_template_kind(self, input_kind, expected):
        assert normalize_template_kind(input_kind) == expected


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestExtractCapabilities:
    """Edge cases for _extract_capabilities() from meta envelope."""

    def test_empty_meta(self):
        assert _extract_capabilities(None) == []
        assert _extract_capabilities({}) == []

    def test_non_list_capabilities(self):
        meta = {GAME_OBJECT_META_KEY: {"capabilities": "not_a_list"}}
        assert _extract_capabilities(meta) == []

    def test_filters_entries_without_id(self):
        meta = {
            GAME_OBJECT_META_KEY: {
                "capabilities": [
                    {"id": "interactable", "enabled": True},
                    {"enabled": True},
                    {"id": "", "enabled": True},
                    {"id": "locked", "enabled": False, "config": {"key": "skeleton"}},
                ]
            }
        }
        result = _extract_capabilities(meta)
        assert len(result) == 2
        assert result[0].id == "interactable"
        assert result[0].enabled is True
        assert result[1].id == "locked"
        assert result[1].enabled is False
        assert result[1].config == {"key": "skeleton"}

    def test_non_dict_config_defaults_to_empty(self):
        meta = {
            GAME_OBJECT_META_KEY: {
                "capabilities": [
                    {"id": "test", "config": "not_dict"},
                ]
            }
        }
        result = _extract_capabilities(meta)
        assert result[0].config == {}

    def test_null_entries_skipped(self):
        meta = {
            GAME_OBJECT_META_KEY: {
                "capabilities": [None, 42, "string", {"id": "valid"}]
            }
        }
        result = _extract_capabilities(meta)
        assert len(result) == 1
        assert result[0].id == "valid"


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestExtractComponents:
    """Edge cases for _extract_components() from meta envelope."""

    def test_empty_meta(self):
        assert _extract_components(None) == []
        assert _extract_components({}) == []

    def test_filters_entries_without_type(self):
        meta = {
            GAME_OBJECT_META_KEY: {
                "components": [
                    {"type": "physics", "data": {"mass": 5}},
                    {"data": {"x": 1}},
                    {"type": "", "data": {}},
                    {"type": "ai_brain", "enabled": False},
                ]
            }
        }
        result = _extract_components(meta)
        assert len(result) == 2
        assert result[0].type == "physics"
        assert result[0].data == {"mass": 5}
        assert result[1].type == "ai_brain"
        assert result[1].enabled is False

    def test_non_dict_data_defaults_to_empty(self):
        meta = {
            GAME_OBJECT_META_KEY: {
                "components": [{"type": "test", "data": [1, 2, 3]}]
            }
        }
        result = _extract_components(meta)
        assert result[0].data == {}


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestExtractTags:
    """Edge cases for _extract_tags() from meta envelope."""

    def test_empty_meta(self):
        assert _extract_tags(None) == []
        assert _extract_tags({}) == []

    def test_filters_falsy_values(self):
        meta = {
            GAME_OBJECT_META_KEY: {
                "tags": ["valid", "", None, 0, "also_valid", False]
            }
        }
        result = _extract_tags(meta)
        assert result == ["valid", "also_valid"]

    def test_non_list_tags_returns_empty(self):
        meta = {GAME_OBJECT_META_KEY: {"tags": "not_a_list"}}
        assert _extract_tags(meta) == []


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestExtractTemplateBinding:
    """Edge cases for binding extraction with richer fields."""

    def test_camelCase_field_extraction(self):
        meta = {
            GAME_OBJECT_META_KEY: {
                "template_binding": {
                    "templateKind": "propTemplate",
                    "templateId": "door.wooden",
                    "runtimeKind": "prop",
                    "linkId": "link-1",
                    "mappingId": "map-1",
                }
            }
        }
        result = _extract_template_binding(meta)
        assert result is not None
        assert result.template_kind == "propTemplate"
        assert result.template_id == "door.wooden"
        assert result.runtime_kind == "prop"
        assert result.link_id == "link-1"
        assert result.mapping_id == "map-1"

    def test_snake_case_field_extraction(self):
        meta = {
            GAME_OBJECT_META_KEY: {
                "template_binding": {
                    "template_kind": "itemTemplate",
                    "template_id": "sword.iron",
                    "runtime_kind": "item",
                    "link_id": "link-2",
                    "mapping_id": "map-2",
                }
            }
        }
        result = _extract_template_binding(meta)
        assert result is not None
        assert result.runtime_kind == "item"
        assert result.mapping_id == "map-2"

    def test_empty_optional_fields_normalize_to_none(self):
        meta = {
            GAME_OBJECT_META_KEY: {
                "template_binding": {
                    "template_kind": "propTemplate",
                    "template_id": "box",
                    "runtime_kind": "",
                    "link_id": "  ",
                    "mapping_id": "",
                }
            }
        }
        result = _extract_template_binding(meta)
        assert result is not None
        assert result.runtime_kind is None
        assert result.link_id is None
        assert result.mapping_id is None

    def test_missing_required_fields_returns_none(self):
        meta = {
            GAME_OBJECT_META_KEY: {
                "template_binding": {
                    "template_kind": "",
                    "template_id": "something",
                }
            }
        }
        assert _extract_template_binding(meta) is None

    def test_non_dict_binding_returns_none(self):
        meta = {GAME_OBJECT_META_KEY: {"template_binding": "not_dict"}}
        assert _extract_template_binding(meta) is None
