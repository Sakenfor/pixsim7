"""Template slot schema and normalization helpers."""

from __future__ import annotations

import copy
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationError


TEMPLATE_SLOT_SCHEMA_VERSION = 1

SLOT_PRESETS: Dict[str, List[Dict[str, Any]]] = {
    "subject_preservation": [
        {"label": "Pose lock", "role": "subject", "category": "pose_lock", "optional": False},
        {"label": "Identity lock", "role": "subject", "category": "identity_lock", "optional": False},
        {"label": "Framing lock", "role": "subject", "category": "framing_lock", "optional": False},
    ],
    "three_layer_composition": [
        {
            "label": "Layer order",
            "role": "composition",
            "category": "layer_order",
            "tag_constraints": {"depth_layers": 3},
            "optional": False,
        },
    ],
    "two_layer_composition": [
        {
            "label": "Layer order",
            "role": "composition",
            "category": "layer_order",
            "tag_constraints": {"depth_layers": 2},
            "optional": False,
        },
    ],
}


def _expand_presets(raw_slots: List[Any]) -> List[Any]:
    """Replace ``{"preset": "name"}`` entries with deep-copied preset slots."""
    expanded: List[Any] = []
    for slot in raw_slots:
        if isinstance(slot, dict) and "preset" in slot and len(slot) == 1:
            preset_name = slot["preset"]
            if preset_name not in SLOT_PRESETS:
                raise ValueError(f"unknown slot preset: {preset_name!r}")
            expanded.extend(copy.deepcopy(SLOT_PRESETS[preset_name]))
        else:
            expanded.append(slot)
    return expanded


class TemplateSlotSpec(BaseModel):
    """Typed schema for template slots persisted in BlockTemplate.slots."""

    model_config = ConfigDict(extra="forbid")

    slot_index: int = Field(default=0, ge=0)
    label: str = Field(default="")
    role: Optional[str] = None
    category: Optional[str] = None
    kind: Optional[str] = None
    intent: Optional[str] = None
    complexity_min: Optional[str] = None
    complexity_max: Optional[str] = None
    package_name: Optional[str] = None
    tag_constraints: Optional[Dict[str, Any]] = None
    min_rating: Optional[float] = None
    selection_strategy: Literal["uniform", "weighted_rating"] = "uniform"
    weight: float = 1.0
    optional: bool = False
    fallback_text: Optional[str] = None
    reinforcement_text: Optional[str] = None
    intensity: Optional[int] = Field(default=None, ge=1, le=10)
    inherit_intensity: bool = False
    exclude_block_ids: Optional[List[UUID]] = None


def normalize_template_slot(raw: Any, *, fallback_index: int = 0) -> Dict[str, Any]:
    """Normalize one slot dict to schema-compliant shape."""
    if not isinstance(raw, dict):
        raise ValueError("template slot must be an object")

    try:
        slot = TemplateSlotSpec.model_validate(raw)
    except ValidationError as exc:
        raise ValueError(str(exc)) from exc

    result = slot.model_dump(mode="python")
    if not isinstance(result.get("label"), str):
        result["label"] = ""
    else:
        result["label"] = result["label"].strip()
    return result


def normalize_template_slots(raw_slots: Any) -> List[Dict[str, Any]]:
    """Normalize and canonicalize slot arrays (sorted and re-indexed)."""
    if raw_slots is None:
        return []
    if not isinstance(raw_slots, list):
        raise ValueError("template slots must be a list")

    raw_slots = _expand_presets(raw_slots)

    normalized: List[Dict[str, Any]] = []
    for index, slot in enumerate(raw_slots):
        try:
            normalized_slot = normalize_template_slot(slot, fallback_index=index)
        except ValueError as exc:
            raise ValueError(f"slot[{index}] invalid: {exc}") from exc
        normalized.append(normalized_slot)

    normalized.sort(key=lambda slot: int(slot.get("slot_index", 0)))
    for index, slot in enumerate(normalized):
        slot["slot_index"] = index
    return normalized
