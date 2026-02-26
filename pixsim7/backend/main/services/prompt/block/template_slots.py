"""Template slot schema and normalization helpers."""

from __future__ import annotations

import copy
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationError


TEMPLATE_SLOT_SCHEMA_VERSION = 2
_TAG_QUERY_GROUP_ALIASES = {
    "all": "all",
    "all_of": "all",
    "any": "any",
    "any_of": "any",
    "not": "not",
    "none_of": "not",
}

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
    "pose_lock_graduated": [
        {
            "label": "Pose lock",
            "role": "subject",
            "category": "pose_lock",
            "selection_strategy": "weighted_tags",
            "tag_constraints": {"lock": "pose"},
            "preferences": {"boost_tags": {"rigidity": "medium"}},
            "optional": False,
        },
    ],
    "camera_stability": [
        {
            "label": "Camera stability",
            "role": "camera",
            "category": "camera_stability",
            "selection_strategy": "weighted_tags",
            "tag_constraints": {"lock": "camera"},
            "preferences": {"boost_tags": {"camera_rigidity": "medium"}},
            "optional": False,
        },
    ],
    # Pairs with the allure_wardrobe_modifier control preset in template_controls.py.
    # Uses the v2 ``tags`` format directly (not ``tag_constraints``) so that tag
    # constraints survive preset expansion, which happens after slot migration.
    "wardrobe_allure_modifier": [
        {
            "label": "Wardrobe modifier",
            "role": "style",
            "category": "wardrobe_modifier",
            "package_name": "theme_modifiers",
            "tags": {
                "all": {
                    "modifier_family": "allure",
                    "modifier_target": "wardrobe",
                }
            },
            "selection_strategy": "weighted_tags",
            "optional": False,
        },
    ],
}


SlotSelectionStrategy = Literal[
    "uniform",
    "weighted_rating",
    "weighted_tags",
    "diverse",
    "coherent_rerank",
    "llm_rerank",
]


class TemplateSlotPreferencesSpec(BaseModel):
    """Soft preferences used by non-uniform selectors (score/rerank only)."""

    model_config = ConfigDict(extra="forbid")

    boost_tags: Optional[Dict[str, Any]] = None
    avoid_tags: Optional[Dict[str, Any]] = None
    diversity_keys: Optional[List[str]] = None
    novelty_weight: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    coherence_weight: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class TemplateSlotSelectionWeightsSpec(BaseModel):
    """Weights used by heuristic and AI-assisted selection strategies."""

    model_config = ConfigDict(extra="forbid")

    hard_match_bonus: Optional[float] = Field(default=None, ge=0.0)
    boost_tags: Optional[float] = Field(default=None, ge=0.0)
    avoid_tags: Optional[float] = Field(default=None, ge=0.0)
    rating: Optional[float] = Field(default=None, ge=0.0)
    diversity: Optional[float] = Field(default=None, ge=0.0)
    coherence: Optional[float] = Field(default=None, ge=0.0)
    novelty: Optional[float] = Field(default=None, ge=0.0)


class TemplateSlotSelectionConfigSpec(BaseModel):
    """Typed config for pluggable slot selection strategies."""

    model_config = ConfigDict(extra="forbid")

    top_k: Optional[int] = Field(default=None, ge=1, le=1000)
    temperature: Optional[float] = Field(default=None, ge=0.0, le=5.0)
    fallback_strategy: Optional[SlotSelectionStrategy] = None
    timeout_ms: Optional[int] = Field(default=None, ge=50, le=30000)
    model: Optional[str] = Field(default=None, min_length=1, max_length=200)
    weights: Optional[TemplateSlotSelectionWeightsSpec] = None


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
    # Stable identifier for targeting control effects (avoids brittle label matching).
    # Optional for backwards compatibility with existing templates.
    key: Optional[str] = Field(default=None, min_length=1, max_length=120)
    label: str = Field(default="")
    role: Optional[str] = None
    category: Optional[str] = None
    kind: Optional[str] = None
    intent: Optional[str] = None
    complexity_min: Optional[str] = None
    complexity_max: Optional[str] = None
    package_name: Optional[str] = None
    tags: Optional[Dict[str, Any]] = None
    # Legacy field accepted at the API edge and migrated to ``tags``.
    tag_constraints: Optional[Dict[str, Any]] = None
    min_rating: Optional[float] = None
    preferences: Optional[TemplateSlotPreferencesSpec] = None
    selection_strategy: SlotSelectionStrategy = "uniform"
    selection_config: Optional[TemplateSlotSelectionConfigSpec] = None
    weight: float = 1.0
    optional: bool = False
    fallback_text: Optional[str] = None
    reinforcement_text: Optional[str] = None
    # Intensity 0 is valid in template controls/slot authoring (e.g. minimal pose lock).
    intensity: Optional[int] = Field(default=None, ge=0, le=10)
    inherit_intensity: bool = False
    exclude_block_ids: Optional[List[UUID]] = None


def _normalize_tag_group(group: Any) -> Dict[str, Any]:
    if group is None:
        return {}
    if not isinstance(group, dict):
        raise ValueError("tag group must be an object")
    normalized: Dict[str, Any] = {}
    for key, value in group.items():
        if value is None:
            continue
        key_str = str(key)
        if isinstance(value, list):
            values = [v for v in value if v is not None]
            if values:
                normalized[key_str] = values
        else:
            normalized[key_str] = value
    return normalized


def _normalize_string_list(raw: Any, *, field_name: str) -> Optional[List[str]]:
    if raw is None:
        return None
    if not isinstance(raw, list):
        raise ValueError(f"{field_name} must be a list")
    values: List[str] = []
    seen: set[str] = set()
    for value in raw:
        if value is None:
            continue
        text = str(value).strip()
        if not text or text in seen:
            continue
        seen.add(text)
        values.append(text)
    return values or None


def normalize_slot_preferences(raw: Any) -> Optional[Dict[str, Any]]:
    """Canonicalize optional slot preferences payload."""
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValueError("slot.preferences must be an object")

    normalized: Dict[str, Any] = {}
    boost_tags = _normalize_tag_group(raw.get("boost_tags"))
    avoid_tags = _normalize_tag_group(raw.get("avoid_tags"))
    diversity_keys = _normalize_string_list(raw.get("diversity_keys"), field_name="slot.preferences.diversity_keys")

    if boost_tags:
        normalized["boost_tags"] = boost_tags
    if avoid_tags:
        normalized["avoid_tags"] = avoid_tags
    if diversity_keys:
        normalized["diversity_keys"] = diversity_keys

    for scalar_key in ("novelty_weight", "coherence_weight"):
        value = raw.get(scalar_key)
        if value is not None:
            normalized[scalar_key] = value

    return normalized or None


def normalize_slot_selection_config(raw: Any) -> Optional[Dict[str, Any]]:
    """Canonicalize optional slot selection config payload."""
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValueError("slot.selection_config must be an object")

    normalized: Dict[str, Any] = {}
    for key in ("top_k", "temperature", "fallback_strategy", "timeout_ms", "model"):
        value = raw.get(key)
        if value is not None:
            normalized[key] = value

    weights = raw.get("weights")
    if weights is not None:
        if not isinstance(weights, dict):
            raise ValueError("slot.selection_config.weights must be an object")
        normalized_weights = {k: v for k, v in weights.items() if v is not None}
        if normalized_weights:
            normalized["weights"] = normalized_weights

    return normalized or None


def normalize_slot_tag_query(raw: Any) -> Optional[Dict[str, Dict[str, Any]]]:
    """Normalize slot tag filters to canonical namespaced groups.

    Canonical form:
    ``{"all": {...}, "any": {...}, "not": {...}}`` (empty groups omitted)
    """
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValueError("slot.tags must be an object")

    if any(k in raw for k in _TAG_QUERY_GROUP_ALIASES):
        groups_raw: Dict[str, Any] = {"all": None, "any": None, "not": None}
        for raw_key, canonical_key in _TAG_QUERY_GROUP_ALIASES.items():
            if raw_key not in raw:
                continue
            raw_group = raw.get(raw_key)
            if groups_raw[canonical_key] is None:
                groups_raw[canonical_key] = raw_group
                continue
            if not isinstance(groups_raw[canonical_key], dict) or not isinstance(raw_group, dict):
                raise ValueError(
                    f"slot.tags group '{canonical_key}' must be an object when combining aliases"
                )
            merged = dict(groups_raw[canonical_key])
            merged.update(raw_group)
            groups_raw[canonical_key] = merged

        groups = {
            "all": _normalize_tag_group(groups_raw["all"]),
            "any": _normalize_tag_group(groups_raw["any"]),
            "not": _normalize_tag_group(groups_raw["not"]),
        }
    else:
        # Treat non-namespaced maps as an ``all`` group for compatibility.
        groups = {"all": _normalize_tag_group(raw), "any": {}, "not": {}}

    compact = {k: v for k, v in groups.items() if v}
    return compact or None


def _migrate_slot_v1_to_v2(raw_slot: Dict[str, Any]) -> Dict[str, Any]:
    """Migrate legacy ``tag_constraints`` slots to canonical ``tags`` groups."""
    migrated = dict(raw_slot)
    legacy = migrated.pop("tag_constraints", None)
    if "tags" in migrated:
        migrated["tags"] = normalize_slot_tag_query(migrated.get("tags"))
        return migrated
    if legacy is not None:
        migrated["tags"] = normalize_slot_tag_query({"all": legacy})
    return migrated


def _coerce_schema_version(schema_version: Optional[int]) -> int:
    if schema_version is None:
        # Treat unspecified versions as legacy (v1) for deterministic migration.
        return 1
    try:
        version = int(schema_version)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"invalid slot schema version: {schema_version!r}") from exc
    if version < 1:
        return 1
    if version > TEMPLATE_SLOT_SCHEMA_VERSION:
        raise ValueError(
            f"unsupported slot schema version {version}; "
            f"max supported is {TEMPLATE_SLOT_SCHEMA_VERSION}"
        )
    return version


def migrate_template_slots(raw_slots: Any, *, schema_version: Optional[int] = None) -> List[Any]:
    """Apply explicit slot-schema migrations and return migrated raw slot objects."""
    if raw_slots is None:
        return []
    if not isinstance(raw_slots, list):
        raise ValueError("template slots must be a list")

    version = _coerce_schema_version(schema_version)
    migrated: List[Any] = copy.deepcopy(raw_slots)

    if version < 2:
        next_slots: List[Any] = []
        for slot in migrated:
            if isinstance(slot, dict):
                next_slots.append(_migrate_slot_v1_to_v2(slot))
            else:
                next_slots.append(slot)
        migrated = next_slots
        version = 2

    return migrated


def normalize_template_slot(
    raw: Any,
    *,
    fallback_index: int = 0,
    schema_version: Optional[int] = None,
) -> Dict[str, Any]:
    """Normalize one slot dict to schema-compliant shape."""
    if not isinstance(raw, dict):
        raise ValueError("template slot must be an object")
    migrated_raw = dict(raw)
    if schema_version is None:
        # Single-slot normalization is typically used for ad hoc preview/API input;
        # accept legacy shapes by running the latest migration.
        migrated_raw = _migrate_slot_v1_to_v2(migrated_raw)
    elif _coerce_schema_version(schema_version) < TEMPLATE_SLOT_SCHEMA_VERSION:
        if int(schema_version) < 2:
            migrated_raw = _migrate_slot_v1_to_v2(migrated_raw)
    has_explicit_slot_index = "slot_index" in migrated_raw and migrated_raw.get("slot_index") is not None

    try:
        slot = TemplateSlotSpec.model_validate(migrated_raw)
    except ValidationError as exc:
        raise ValueError(str(exc)) from exc

    result = slot.model_dump(mode="python")
    if not has_explicit_slot_index:
        result["slot_index"] = int(fallback_index)
    result["tags"] = normalize_slot_tag_query(result.get("tags"))
    result["preferences"] = normalize_slot_preferences(result.get("preferences"))
    result["selection_config"] = normalize_slot_selection_config(result.get("selection_config"))
    result.pop("tag_constraints", None)
    if not isinstance(result.get("label"), str):
        result["label"] = ""
    else:
        result["label"] = result["label"].strip()

    # Canonicalize slot key (do not auto-generate here; callers that persist templates
    # should generate stable keys once to avoid churn across reloads).
    if not isinstance(result.get("key"), str):
        result["key"] = None
    else:
        key = result["key"].strip()
        result["key"] = key or None
    return result


def normalize_template_slots(
    raw_slots: Any,
    *,
    schema_version: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Normalize and canonicalize slot arrays (sorted and re-indexed)."""
    raw_slots = migrate_template_slots(raw_slots, schema_version=schema_version)
    raw_slots = _expand_presets(raw_slots)

    normalized: List[Dict[str, Any]] = []
    for index, slot in enumerate(raw_slots):
        try:
            normalized_slot = normalize_template_slot(slot, fallback_index=index, schema_version=TEMPLATE_SLOT_SCHEMA_VERSION)
        except ValueError as exc:
            raise ValueError(f"slot[{index}] invalid: {exc}") from exc
        normalized.append(normalized_slot)

    normalized.sort(key=lambda slot: int(slot.get("slot_index", 0)))
    for index, slot in enumerate(normalized):
        slot["slot_index"] = index
    return normalized
