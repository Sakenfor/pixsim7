"""Template control presets - reusable control definitions for template authoring.

Control presets work analogously to SLOT_PRESETS in template_slots.py:
a control entry ``{"preset": "name"}`` in template_metadata.controls is expanded
into the full control definition(s) at content-pack load time.

Presets are expanded by expand_control_presets() which is called from
parse_templates() in content_pack_loader.py before the template is stored.
"""
from __future__ import annotations

import copy
from typing import Any, Dict, List


# Shared "allure core" progression. This stays domain-agnostic: it defines step
# thresholds and semantic tiers, while adapters (wardrobe, pose, lighting)
# translate tiers into slot-specific tags/effects.
ALLURE_CORE_TIER_PROFILES: List[Dict[str, Any]] = [
    {
        "enabledAt": 0,
        "tierKey": "preserve",
        "label": "Preserve",
        "description": "Preserve existing fit/presentation bias.",
    },
    {
        "enabledAt": 4,
        "tierKey": "subtle",
        "label": "Subtle",
        "description": "Subtle confidence / fitted tailoring.",
    },
    {
        "enabledAt": 6,
        "tierKey": "medium",
        "label": "Medium",
        "description": "Body-conforming emphasis.",
    },
    {
        "enabledAt": 8,
        "tierKey": "high",
        "label": "High",
        "description": "Form-fitting / daring emphasis.",
    },
]


_WARDROBE_ALLURE_EFFECTS_BY_TIER: Dict[str, Dict[str, Any]] = {
    "preserve": {
        "boostTags": {
            "allure_level": "preserve",
            "modesty_level": "balanced",
        },
        "avoidTags": {"allure_level": ["high"]},
    },
    "subtle": {
        "boostTags": {
            "allure_level": "subtle",
            "modesty_level": "balanced",
            "tightness": "fitted",
        },
        "avoidTags": {"allure_level": ["preserve"]},
    },
    "medium": {
        "boostTags": {
            "allure_level": "medium",
            "modesty_level": "balanced",
            "tightness": "tight",
        },
        "avoidTags": {"allure_level": ["preserve"]},
    },
    "high": {
        "boostTags": {
            "allure_level": "high",
            "modesty_level": "daring",
            "tightness": "skin_tight",
        },
        "avoidTags": {"allure_level": ["preserve"]},
    },
}


def _build_allure_wardrobe_modifier_controls() -> List[Dict[str, Any]]:
    """Build the wardrobe adapter control from the shared allure core tiers."""
    effects: List[Dict[str, Any]] = []
    for tier in ALLURE_CORE_TIER_PROFILES:
        tier_key = tier["tierKey"]
        mapping = _WARDROBE_ALLURE_EFFECTS_BY_TIER[tier_key]
        effect: Dict[str, Any] = {
            "kind": "slot_tag_boost",
            "slotLabel": "Wardrobe modifier",
            "enabledAt": tier["enabledAt"],
            "boostTags": copy.deepcopy(mapping["boostTags"]),
        }
        if "avoidTags" in mapping:
            effect["avoidTags"] = copy.deepcopy(mapping["avoidTags"])
        effects.append(effect)

    return [
        {
            "id": "allure",
            "type": "slider",
            "label": "Allure",
            "min": 0,
            "max": 10,
            "step": 1,
            "defaultValue": 2,
            "effects": effects,
        }
    ]


CONTROL_PRESETS: Dict[str, List[Dict[str, Any]]] = {
    # Wardrobe adapter over the shared allure core tiers.
    "allure_wardrobe_modifier": _build_allure_wardrobe_modifier_controls(),
}


_TAG_SELECT_REQUIRED_BASE: frozenset[str] = frozenset({"id", "label", "target_tag"})


def _validate_tag_select_control(ctrl: Dict[str, Any]) -> None:
    """Raise ``ValueError`` if a ``tag_select`` control is missing required fields."""
    missing = _TAG_SELECT_REQUIRED_BASE - set(ctrl.keys())
    if missing:
        raise ValueError(
            f"tag_select control missing required fields: {sorted(missing)}"
        )
    for field in _TAG_SELECT_REQUIRED_BASE:
        v = ctrl.get(field)
        if not isinstance(v, str) or not v.strip():
            raise ValueError(
                f"tag_select control field {field!r} must be a non-empty string"
            )
    target_slot = ctrl.get("target_slot")
    target_slot_key = ctrl.get("target_slot_key")
    has_label = isinstance(target_slot, str) and bool(target_slot.strip())
    has_key = isinstance(target_slot_key, str) and bool(target_slot_key.strip())
    if not (has_label or has_key):
        raise ValueError(
            "tag_select control must include non-empty 'target_slot' or 'target_slot_key'"
        )
    if target_slot is not None and not has_label:
        raise ValueError(
            "tag_select control field 'target_slot' must be a non-empty string"
        )
    if target_slot_key is not None and not has_key:
        raise ValueError(
            "tag_select control field 'target_slot_key' must be a non-empty string"
        )


def expand_control_presets(raw_controls: List[Any]) -> List[Any]:
    """Replace ``{"preset": "name"}`` entries with deep-copied preset controls.

    Non-preset entries are passed through unchanged, with light structural
    validation for known lazy control types (e.g. ``tag_select``).

    Raises ``ValueError`` on unknown preset names or structurally invalid lazy
    controls so callers can wrap with precise path context.
    """
    expanded: List[Any] = []
    for ctrl in raw_controls:
        if isinstance(ctrl, dict) and list(ctrl) == ["preset"]:
            preset_name = ctrl["preset"]
            if preset_name not in CONTROL_PRESETS:
                known = ", ".join(sorted(CONTROL_PRESETS.keys()))
                raise ValueError(
                    f"unknown control preset: {preset_name!r}"
                    + (f" (known: {known})" if known else "")
                )
            expanded.extend(copy.deepcopy(CONTROL_PRESETS[preset_name]))
        else:
            if isinstance(ctrl, dict) and ctrl.get("type") == "tag_select":
                _validate_tag_select_control(ctrl)
            expanded.append(ctrl)
    return expanded
