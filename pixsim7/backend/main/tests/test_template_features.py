from __future__ import annotations

from pixsim7.backend.main.services.prompt.block.template_features import (
    expand_template_feature_presets,
)


def test_expand_wardrobe_allure_bundle_injects_controls_and_slot_after_target() -> None:
    slots = [
        {"label": "Identity lock", "role": "subject"},
        {"key": "uniform_aesthetic", "label": "Uniform aesthetic", "role": "style", "category": "aesthetic"},
        {"label": "Break room scene", "role": "environment"},
    ]
    metadata = {
        "controls": [{"id": "pose_lock", "type": "slider", "label": "Pose Lock", "min": 0, "max": 10, "step": 1, "defaultValue": 5, "effects": []}],
        "features": [
            {
                "preset": "wardrobe_allure_bundle",
                "target_slot_key": "uniform_aesthetic",
                "target_slot": "Uniform aesthetic",
                "include_variant_select": True,
                "include_matrix_preset": True,
                "variant_control_id": "uniform_variant",
                "variant_control_label": "Uniform Variant",
                "variant_default_value": "duty",
                "matrix_preset_id": "police-allure-coverage",
                "matrix_preset_label": "Police Precinct: Allure Coverage",
            }
        ],
    }

    next_slots, next_metadata = expand_template_feature_presets(
        raw_slots=slots,
        template_metadata=metadata,
    )

    assert next_slots[2] == {"preset": "wardrobe_allure_modifier"}
    controls = next_metadata["controls"]
    assert any(isinstance(c, dict) and c.get("preset") == "allure_wardrobe_modifier" for c in controls)
    variant = next(c for c in controls if isinstance(c, dict) and c.get("id") == "uniform_variant")
    assert variant["type"] == "tag_select"
    assert variant["target_slot_key"] == "uniform_aesthetic"
    assert variant["target_slot"] == "Uniform aesthetic"
    matrix_presets = next_metadata["matrix_presets"]
    matrix = next(m for m in matrix_presets if isinstance(m, dict) and m.get("id") == "police-allure-coverage")
    assert matrix["query"]["row_key"] == "tag:allure_level"
    assert matrix["query"]["col_key"] == "tag:tightness"
    assert matrix["query"]["package_name"] == "theme_modifiers"


def test_expand_wardrobe_allure_bundle_requires_target_slot_or_key() -> None:
    slots = [{"label": "Uniform aesthetic"}]
    metadata = {"features": [{"preset": "wardrobe_allure_bundle"}]}
    try:
        expand_template_feature_presets(raw_slots=slots, template_metadata=metadata)
    except ValueError as exc:
        assert "target_slot" in str(exc)
    else:
        raise AssertionError("Expected ValueError")
