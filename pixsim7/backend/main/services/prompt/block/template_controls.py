"""Template control presets — reusable control definitions for template authoring.

Control presets work analogously to SLOT_PRESETS in template_slots.py:
a control entry ``{"preset": "name"}`` in template_metadata.controls is expanded
into the full control definition(s) at content-pack load time.

Presets are expanded by expand_control_presets() which is called from
parse_templates() in content_pack_loader.py before the template is stored.
"""
from __future__ import annotations

import copy
from typing import Any, Dict, List


CONTROL_PRESETS: Dict[str, List[Dict[str, Any]]] = {
    # ── Allure wardrobe modifier slider ─────────────────────────────────────
    # Steers selection among the generic wardrobe_modifier blocks in the
    # theme_modifiers pack.  Pairs with the wardrobe_allure_modifier slot
    # preset defined in template_slots.py.
    #
    # Step mapping:
    #   0  → preserve existing fit
    #   4  → subtle confidence / fitted tailoring
    #   6  → medium allure / tight (body-conforming)
    #   8  → high allure / skin_tight (form-fitting, daring)
    "allure_wardrobe_modifier": [
        {
            "id": "allure",
            "type": "slider",
            "label": "Allure",
            "min": 0,
            "max": 10,
            "step": 1,
            "defaultValue": 2,
            "effects": [
                {
                    "kind": "slot_tag_boost",
                    "slotLabel": "Wardrobe modifier",
                    "enabledAt": 0,
                    "boostTags": {
                        "allure_level": "preserve",
                        "modesty_level": "balanced",
                    },
                    "avoidTags": {"allure_level": ["high"]},
                },
                {
                    "kind": "slot_tag_boost",
                    "slotLabel": "Wardrobe modifier",
                    "enabledAt": 4,
                    "boostTags": {
                        "allure_level": "subtle",
                        "modesty_level": "balanced",
                        "tightness": "fitted",
                    },
                    "avoidTags": {"allure_level": ["preserve"]},
                },
                {
                    "kind": "slot_tag_boost",
                    "slotLabel": "Wardrobe modifier",
                    "enabledAt": 6,
                    "boostTags": {
                        "allure_level": "medium",
                        "modesty_level": "balanced",
                        "tightness": "tight",
                    },
                    "avoidTags": {"allure_level": ["preserve"]},
                },
                {
                    "kind": "slot_tag_boost",
                    "slotLabel": "Wardrobe modifier",
                    "enabledAt": 8,
                    "boostTags": {
                        "allure_level": "high",
                        "modesty_level": "daring",
                        "tightness": "skin_tight",
                    },
                    "avoidTags": {"allure_level": ["preserve"]},
                },
            ],
        }
    ],
}


def expand_control_presets(raw_controls: List[Any]) -> List[Any]:
    """Replace ``{"preset": "name"}`` entries with deep-copied preset controls.

    Non-preset entries are passed through unchanged.  Raises ``ValueError``
    on unknown preset names so callers can wrap with precise path context.
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
            expanded.append(ctrl)
    return expanded
