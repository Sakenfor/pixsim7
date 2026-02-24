"""Canonical prompt-block tag dictionary + alias registry (Phase 1).

This is intentionally small and code-based to start. It can later move to a DB
or config-backed registry if needed.
"""

from __future__ import annotations

from typing import Any, Dict, List


# Minimal canonical registry focused on currently active matrix / template work.
# Keys here should represent the preferred vocabulary for authored/stored blocks.
CANONICAL_BLOCK_TAG_DICTIONARY: Dict[str, Dict[str, Any]] = {
    "sequence_family": {
        "description": "Named block family for progression/coverage grouping.",
        "data_type": "string",
        "allowed_values": ["pov_approach_response"],
        "aliases": [],
        "value_aliases": {},
        "applies_to": [],
        "status": "active",
    },
    "beat_axis": {
        "description": "Axis of variation inside a sequence family (view/proximity/contact/etc.).",
        "data_type": "string",
        "allowed_values": ["view", "presence", "continuity", "proximity", "contact", "response", "expression", "refine", "tone"],
        "aliases": [],
        "value_aliases": {},
        "applies_to": [],
        "status": "active",
    },
    "view_profile": {
        "description": "Camera/view relationship profile (observer, POV, OTS).",
        "data_type": "string",
        "allowed_values": ["observer", "pov_hand", "ots"],
        "aliases": ["view"],
        "value_aliases": {
            "pov": "pov_hand",
            "over_shoulder": "ots",
        },
        "applies_to": [{"role": "camera", "category": "composition"}, {"role": "composition", "category": "framing"}],
        "status": "active",
    },
    "proximity_stage": {
        "description": "Discrete spatial distance stage for progression beats.",
        "data_type": "string",
        "allowed_values": ["far", "near", "arm_reach", "close"],
        "aliases": ["distance"],
        "value_aliases": {"arms_reach": "arm_reach"},
        "applies_to": [{"role": "placement", "category": "depth"}],
        "status": "active",
    },
    "contact_stage": {
        "description": "Explicit contact state for interaction progression beats.",
        "data_type": "string",
        "allowed_values": ["none", "offered_hand", "brief_contact"],
        "aliases": [],
        "value_aliases": {},
        "applies_to": [{"role": "action", "category": "interaction_beat"}],
        "status": "active",
    },
    "response_mode": {
        "description": "Subject response posture/intent axis for interaction progression blocks.",
        "data_type": "string",
        "allowed_values": ["receptive", "neutral", "hesitant", "boundary"],
        "aliases": ["reaction_mode"],
        "value_aliases": {"reluctant": "hesitant"},
        "applies_to": [{"role": "action", "category": "interaction_beat"}, {"role": "subject", "category": "expression_behavior"}],
        "status": "active",
    },
    "rigidity": {
        "description": "Pose-lock strength tier used by pose lock blocks and slider coverage.",
        "data_type": "string",
        "allowed_values": ["minimal", "low", "medium", "high", "maximum"],
        "aliases": [],
        "value_aliases": {},
        "applies_to": [{"role": "subject", "category": "pose_lock"}],
        "status": "active",
    },
    "approach": {
        "description": "Pose-lock prompting approach variant (skeletal/contour/gravity/i2v).",
        "data_type": "string",
        "allowed_values": ["skeletal", "contour", "gravity", "i2v"],
        "aliases": [],
        "value_aliases": {},
        "applies_to": [{"role": "subject", "category": "pose_lock"}],
        "status": "active",
    },
    "scene_scope": {
        "description": "High-level scene semantics scope for generic image-edit fallback scene blocks.",
        "data_type": "string",
        "allowed_values": ["generic_real_world"],
        "aliases": [],
        "value_aliases": {},
        "applies_to": [{"role": "environment", "category": "scene_build"}],
        "status": "active",
    },
    "edit_mode": {
        "description": "Editing mode tag for generic image-edit scene semantics.",
        "data_type": "string",
        "allowed_values": ["image_edit"],
        "aliases": [],
        "value_aliases": {},
        "applies_to": [{"role": "environment", "category": "scene_build"}],
        "status": "active",
    },
}


def get_canonical_block_tag_dictionary() -> Dict[str, Dict[str, Any]]:
    """Return canonical prompt-block tag dictionary."""
    return CANONICAL_BLOCK_TAG_DICTIONARY


def get_block_tag_alias_key_map() -> Dict[str, str]:
    """Return alias key -> canonical key mapping."""
    alias_map: Dict[str, str] = {}
    for canonical_key, meta in CANONICAL_BLOCK_TAG_DICTIONARY.items():
        for alias in meta.get("aliases") or []:
            alias_map[str(alias)] = canonical_key
    return alias_map


def get_block_tag_value_alias_map() -> Dict[str, Dict[str, str]]:
    """Return canonical_key -> {alias_value: canonical_value} mapping."""
    result: Dict[str, Dict[str, str]] = {}
    for canonical_key, meta in CANONICAL_BLOCK_TAG_DICTIONARY.items():
        value_aliases = meta.get("value_aliases") or {}
        if isinstance(value_aliases, dict) and value_aliases:
            result[canonical_key] = {str(k): str(v) for k, v in value_aliases.items()}
    return result


def list_canonical_block_tag_keys() -> List[str]:
    return sorted(CANONICAL_BLOCK_TAG_DICTIONARY.keys())

