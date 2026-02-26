"""Tests for template control presets (template_controls.py)."""
from __future__ import annotations

import shutil
from pathlib import Path
from uuid import uuid4

import pytest
import yaml

from pixsim7.backend.main.services.prompt.block.content_pack_loader import (
    ContentPackValidationError,
    parse_templates,
)
from pixsim7.backend.main.services.prompt.block.template_controls import (
    CONTROL_PRESETS,
    expand_control_presets,
)


# ── Unit tests: expand_control_presets ───────────────────────────────────────

def test_expand_unknown_preset_raises() -> None:
    with pytest.raises(ValueError, match="unknown control preset"):
        expand_control_presets([{"preset": "nonexistent_xyz"}])


def test_expand_known_preset_returns_correct_structure() -> None:
    result = expand_control_presets([{"preset": "allure_wardrobe_modifier"}])
    assert len(result) == 1
    ctrl = result[0]
    assert ctrl["id"] == "allure"
    assert ctrl["type"] == "slider"
    assert ctrl["min"] == 0
    assert ctrl["max"] == 10
    assert ctrl["step"] == 1
    assert ctrl["defaultValue"] == 2


def test_expand_allure_preset_has_four_effects() -> None:
    [ctrl] = expand_control_presets([{"preset": "allure_wardrobe_modifier"}])
    effects = ctrl["effects"]
    assert len(effects) == 4
    assert [e["enabledAt"] for e in effects] == [0, 4, 6, 8]


def test_expand_allure_preset_effect_tags() -> None:
    [ctrl] = expand_control_presets([{"preset": "allure_wardrobe_modifier"}])
    effects = ctrl["effects"]
    # Step 0: preserve — no tightness boost
    assert effects[0]["boostTags"]["allure_level"] == "preserve"
    assert effects[0]["boostTags"]["modesty_level"] == "balanced"
    assert "tightness" not in effects[0]["boostTags"]
    # Step 4: fitted
    assert effects[1]["boostTags"]["tightness"] == "fitted"
    # Step 6: tight
    assert effects[2]["boostTags"]["tightness"] == "tight"
    # Step 8: high / daring / skin_tight
    assert effects[3]["boostTags"]["allure_level"] == "high"
    assert effects[3]["boostTags"]["modesty_level"] == "daring"
    assert effects[3]["boostTags"]["tightness"] == "skin_tight"
    # All effects target the Wardrobe modifier slot
    assert all(e["slotLabel"] == "Wardrobe modifier" for e in effects)


def test_expand_returns_deep_copy() -> None:
    """Mutating the result must not affect the preset definition."""
    result = expand_control_presets([{"preset": "allure_wardrobe_modifier"}])
    result[0]["label"] = "MUTATED"
    result[0]["effects"][0]["boostTags"]["allure_level"] = "MUTATED"

    fresh = expand_control_presets([{"preset": "allure_wardrobe_modifier"}])
    assert fresh[0]["label"] == "Allure"
    assert fresh[0]["effects"][0]["boostTags"]["allure_level"] == "preserve"


def test_expand_empty_list() -> None:
    assert expand_control_presets([]) == []


def test_expand_inline_control_passes_through() -> None:
    inline = {"id": "my_ctrl", "type": "slider", "label": "X", "min": 0, "max": 5}
    result = expand_control_presets([inline])
    assert result == [inline]


def test_expand_mixed_inline_and_preset() -> None:
    inline = {"id": "pose_lock", "type": "slider", "label": "Pose Lock", "min": 0, "max": 10}
    result = expand_control_presets([inline, {"preset": "allure_wardrobe_modifier"}])
    assert len(result) == 2
    assert result[0]["id"] == "pose_lock"
    assert result[1]["id"] == "allure"


def test_preset_dict_with_extra_keys_is_not_expanded() -> None:
    """Only a dict with exactly one key 'preset' is treated as a preset reference."""
    not_a_preset = {"preset": "allure_wardrobe_modifier", "extra": "value"}
    result = expand_control_presets([not_a_preset])
    # Passed through as-is — not expanded
    assert result == [not_a_preset]


def test_all_presets_in_registry_expand_without_error() -> None:
    """Sanity: every preset name in CONTROL_PRESETS must expand cleanly."""
    for name in CONTROL_PRESETS:
        result = expand_control_presets([{"preset": name}])
        assert isinstance(result, list)
        assert len(result) >= 1


# ── Integration: parse_templates expands control presets ─────────────────────

def _write_yaml(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


def test_parse_templates_expands_allure_control_preset() -> None:
    """parse_templates must expand the allure_wardrobe_modifier control preset."""
    root = Path(f"test_artifacts_ctrl_{uuid4().hex}")
    try:
        _write_yaml(
            root / "templates" / "test.yaml",
            {
                "templates": [
                    {
                        "slug": "test-allure",
                        "name": "Test Allure Template",
                        "composition_strategy": "sequential",
                        "slots": [],
                        "template_metadata": {
                            "controls": [{"preset": "allure_wardrobe_modifier"}]
                        },
                    }
                ]
            },
        )
        templates = parse_templates(root)
        assert len(templates) == 1
        controls = templates[0]["template_metadata"]["controls"]
        assert len(controls) == 1
        assert controls[0]["id"] == "allure"
        assert controls[0]["type"] == "slider"
        assert len(controls[0]["effects"]) == 4
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_templates_unknown_control_preset_raises() -> None:
    root = Path(f"test_artifacts_ctrl_{uuid4().hex}")
    try:
        _write_yaml(
            root / "templates" / "test.yaml",
            {
                "templates": [
                    {
                        "slug": "test-bad",
                        "name": "Bad",
                        "slots": [],
                        "template_metadata": {
                            "controls": [{"preset": "nonexistent_preset_xyz"}]
                        },
                    }
                ]
            },
        )
        with pytest.raises(ContentPackValidationError, match="unknown control preset"):
            parse_templates(root)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_templates_inline_controls_unchanged() -> None:
    """Inline control dicts (no preset key) must pass through untouched."""
    root = Path(f"test_artifacts_ctrl_{uuid4().hex}")
    try:
        _write_yaml(
            root / "templates" / "test.yaml",
            {
                "templates": [
                    {
                        "slug": "test-inline",
                        "name": "Inline",
                        "slots": [],
                        "template_metadata": {
                            "controls": [
                                {
                                    "id": "custom_ctrl",
                                    "type": "slider",
                                    "label": "Custom",
                                    "min": 0,
                                    "max": 5,
                                }
                            ]
                        },
                    }
                ]
            },
        )
        templates = parse_templates(root)
        controls = templates[0]["template_metadata"]["controls"]
        assert len(controls) == 1
        assert controls[0]["id"] == "custom_ctrl"
    finally:
        shutil.rmtree(root, ignore_errors=True)


# ── Integration: wardrobe_allure_modifier slot preset ────────────────────────

def test_parse_templates_wardrobe_allure_modifier_slot_preset() -> None:
    """The wardrobe_allure_modifier slot preset must expand to the correct slot."""
    root = Path(f"test_artifacts_ctrl_{uuid4().hex}")
    try:
        _write_yaml(
            root / "templates" / "test.yaml",
            {
                "templates": [
                    {
                        "slug": "test-slot-preset",
                        "name": "Test Slot Preset",
                        "slots": [{"preset": "wardrobe_allure_modifier"}],
                        "template_metadata": {},
                    }
                ]
            },
        )
        templates = parse_templates(root)
        slots = templates[0]["slots"]
        assert len(slots) == 1
        slot = slots[0]
        assert slot["label"] == "Wardrobe modifier"
        assert slot["role"] == "style"
        assert slot["category"] == "wardrobe_modifier"
        assert slot["package_name"] == "theme_modifiers"
        assert slot["selection_strategy"] == "weighted_tags"
        # tag_constraints should have been migrated to tags.all
        tags = slot.get("tags") or {}
        all_tags = tags.get("all") or {}
        assert all_tags.get("modifier_family") == "allure"
        assert all_tags.get("modifier_target") == "wardrobe"
    finally:
        shutil.rmtree(root, ignore_errors=True)
