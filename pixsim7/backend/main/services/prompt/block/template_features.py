"""Template feature presets — higher-level reusable template wiring bundles.

Feature presets operate at *template* scope (unlike slot/control presets).
They can inject multiple related pieces across:
- template slots (including slot presets)
- template_metadata.controls (including control presets)
- future: template_metadata.matrix_presets / diagnostics metadata

This helps templates "subscribe" to shared behaviors (e.g. wardrobe allure
modifier controls) without manually wiring every repeated piece.
"""
from __future__ import annotations

import copy
from typing import Any, Dict, List, Tuple


def _as_non_empty_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"feature field {field!r} must be a non-empty string")
    return value.strip()


def _find_slot_index(raw_slots: List[Any], *, target_slot: str | None, target_slot_key: str | None) -> int:
    for i, raw in enumerate(raw_slots):
        if not isinstance(raw, dict):
            continue
        if target_slot_key:
            key = raw.get("key")
            if isinstance(key, str) and key.strip() == target_slot_key:
                return i
        if target_slot:
            label = raw.get("label")
            if isinstance(label, str) and label.strip() == target_slot:
                return i
    target_desc = f"slot key '{target_slot_key}'" if target_slot_key else f"slot label '{target_slot}'"
    raise ValueError(f"could not find target {target_desc} for feature insertion")


def _expand_wardrobe_allure_bundle(
    feature: Dict[str, Any],
    *,
    raw_slots: List[Any],
    metadata: Dict[str, Any],
) -> Tuple[List[Any], Dict[str, Any]]:
    target_slot = str(feature.get("target_slot") or "").strip() or None
    target_slot_key = str(feature.get("target_slot_key") or "").strip() or None
    if not (target_slot or target_slot_key):
        raise ValueError("wardrobe_allure_bundle requires 'target_slot' or 'target_slot_key'")

    insert_index = _find_slot_index(raw_slots, target_slot=target_slot, target_slot_key=target_slot_key)

    next_slots = copy.deepcopy(raw_slots)
    next_metadata = copy.deepcopy(metadata)
    controls = next_metadata.get("controls")
    if controls is None:
        controls = []
    if not isinstance(controls, list):
        raise ValueError("template_metadata.controls must be a list when using feature presets")
    next_controls: List[Any] = list(copy.deepcopy(controls))
    matrix_presets = next_metadata.get("matrix_presets")
    if matrix_presets is None:
        matrix_presets = []
    if not isinstance(matrix_presets, list):
        raise ValueError("template_metadata.matrix_presets must be a list when using feature presets")
    next_matrix_presets: List[Any] = list(copy.deepcopy(matrix_presets))

    # Shared allure slider preset
    next_controls.append({"preset": "allure_wardrobe_modifier"})

    # Optional base aesthetic variant selector (tag_select -> resolved select at runtime).
    include_variant_select = feature.get("include_variant_select", False)
    if include_variant_select:
        variant_control_id = _as_non_empty_string(
            feature.get("variant_control_id", "variant"),
            "variant_control_id",
        )
        variant_control_label = _as_non_empty_string(
            feature.get("variant_control_label", "Variant"),
            "variant_control_label",
        )
        variant_target_tag = _as_non_empty_string(
            feature.get("variant_target_tag", "variant"),
            "variant_target_tag",
        )
        variant_default = str(feature.get("variant_default_value") or "").strip() or None
        variant_control: Dict[str, Any] = {
            "id": variant_control_id,
            "type": "tag_select",
            "label": variant_control_label,
            "target_tag": variant_target_tag,
        }
        if variant_default:
            variant_control["defaultValue"] = variant_default
        if target_slot:
            variant_control["target_slot"] = target_slot
        if target_slot_key:
            variant_control["target_slot_key"] = target_slot_key
        description = feature.get("variant_control_description")
        if isinstance(description, str) and description.strip():
            variant_control["description"] = description.strip()
        next_controls.append(variant_control)

    # Insert wardrobe modifier slot right after the base slot.
    next_slots.insert(insert_index + 1, {"preset": "wardrobe_allure_modifier"})

    next_metadata["controls"] = next_controls
    include_matrix_preset = feature.get("include_matrix_preset", False)
    if include_matrix_preset:
        matrix_id = _as_non_empty_string(
            feature.get("matrix_preset_id", "allure-coverage"),
            "matrix_preset_id",
        )
        matrix_label = _as_non_empty_string(
            feature.get("matrix_preset_label", "Allure Coverage"),
            "matrix_preset_label",
        )
        matrix_preset: Dict[str, Any] = {
            "id": matrix_id,
            "label": matrix_label,
            "query": {
                "row_key": "tag:allure_level",
                "col_key": "tag:tightness",
                "role": "style",
                "category": "wardrobe_modifier",
                "package_name": "theme_modifiers",
                "tags": "modifier_family:allure",
                "include_empty": True,
            },
        }
        matrix_description = feature.get("matrix_preset_description")
        if isinstance(matrix_description, str) and matrix_description.strip():
            matrix_preset["description"] = matrix_description.strip()
        next_matrix_presets.append(matrix_preset)
    next_metadata["matrix_presets"] = next_matrix_presets
    return next_slots, next_metadata


def expand_template_feature_presets(
    *,
    raw_slots: List[Any],
    template_metadata: Dict[str, Any],
) -> Tuple[List[Any], Dict[str, Any]]:
    """Expand template-level feature presets declared in ``template_metadata.features``.

    Unknown presets or invalid parameters raise ``ValueError``.
    """
    features = template_metadata.get("features")
    if features is None:
        return raw_slots, template_metadata
    if not isinstance(features, list):
        raise ValueError("template_metadata.features must be a list")

    next_slots = copy.deepcopy(raw_slots)
    next_metadata = copy.deepcopy(template_metadata)

    for index, raw_feature in enumerate(features):
        if not isinstance(raw_feature, dict):
            raise ValueError(f"template_metadata.features[{index}] must be an object")
        preset_name = raw_feature.get("preset")
        if not isinstance(preset_name, str) or not preset_name.strip():
            raise ValueError(f"template_metadata.features[{index}].preset must be a non-empty string")
        preset_name = preset_name.strip()

        if preset_name == "wardrobe_allure_bundle":
            next_slots, next_metadata = _expand_wardrobe_allure_bundle(
                raw_feature,
                raw_slots=next_slots,
                metadata=next_metadata,
            )
            continue

        raise ValueError(f"unknown template feature preset: {preset_name!r}")

    return next_slots, next_metadata
