"""Infer ImageCompositionRole leaf from block metadata (role, category, tags).

Supports both legacy PromptBlock (role + category) and BlockPrimitive
(category only) via the category-only fallback table.

Pure function — no DB, no async, no side-effects.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Mapping

InferenceConfidence = Literal["exact", "heuristic", "ambiguous", "unknown"]


@dataclass(frozen=True)
class CompositionRoleInference:
    role_id: str | None
    confidence: InferenceConfidence
    reason: str
    candidates: tuple[str, ...] = ()


# ── Tag-based exact mappings ────────────────────────────────────────────────
# Mirror the frontend SLUG_TO_COMPOSITION_ROLE / NAMESPACE_TO_COMPOSITION_ROLE.
# Keys are tag *keys* (not values) that appear in slot tag_constraints / tags.

_TAG_KEY_EXACT: dict[str, str] = {
    # lock-type tags → entities:subject
    "pose": "entities:subject",
    "lock": "entities:subject",
    "identity_lock": "entities:subject",
    "framing_lock": "entities:subject",
    "clothing_lock": "entities:subject",
}

_TAG_VALUE_EXACT: dict[tuple[str, str], str] = {
    # camera tag values → camera:angle
    ("camera", "drift_behind"): "camera:angle",
    ("camera", "drift_left"): "camera:angle",
    ("camera", "drift_right"): "camera:angle",
    ("camera", "drift_up"): "camera:angle",
    ("camera", "sway"): "camera:angle",
    ("camera", "angle"): "camera:angle",
    ("camera", "closeup"): "camera:angle",
    ("camera", "detail"): "camera:angle",
    ("camera", "fov"): "camera:fov",
    ("camera", "camera_lock"): "camera:composition",
    ("camera", "camera_stability"): "camera:composition",
    ("camera", "framing"): "camera:composition",
    ("camera", "depth"): "camera:composition",
}

# ── (role, category) pair table ─────────────────────────────────────────────

_ROLE_CATEGORY_TABLE: dict[tuple[str, str], str] = {
    # subject / lock categories
    ("subject", "pose_lock"): "entities:subject",
    ("subject", "identity_lock"): "entities:subject",
    ("subject", "framing_lock"): "entities:subject",
    ("subject", "clothing_lock"): "entities:subject",
    # character categories
    ("character", "creature"): "entities:companion",
    ("character", "human"): "entities:main_character",
    ("character", "character_desc"): "entities:main_character",
    ("character", "reaction"): "entities:main_character",
    # action categories
    ("action", "entrance"): "animation:action",
    ("action", "approach"): "animation:action",
    ("action", "mount"): "animation:action",
    ("action", "main_action"): "animation:action",
    ("action", "interaction_beat"): "animation:action",
    ("action", "motion_beat"): "animation:action",
    ("action", "sway"): "animation:action",
    ("action", "desk_activity"): "animation:action",
    ("action", "interruption_entry"): "animation:action",
    ("action", "scene_build"): "animation:action",
    ("action", "hold_attitude"): "animation:pose",
    # camera categories
    ("camera", "drift"): "camera:angle",
    ("camera", "angle"): "camera:angle",
    ("camera", "closeup"): "camera:angle",
    ("camera", "sway_camera"): "camera:angle",
    ("camera", "detail"): "camera:angle",
    ("camera", "fov"): "camera:fov",
    ("camera", "camera_lock"): "camera:composition",
    ("camera", "camera_stability"): "camera:composition",
    ("camera", "framing"): "camera:composition",
    ("camera", "depth"): "camera:composition",
    # lighting categories
    ("lighting", "key"): "lighting:key",
    ("lighting", "fill"): "lighting:fill",
    # style categories
    ("style", "rendering"): "materials:rendering",
    ("style", "atmosphere"): "materials:atmosphere",
    ("style", "wardrobe"): "materials:wardrobe",
    # composition
    ("composition", "layer_order"): "camera:composition",
}

# Wildcard role mappings: any category under this role maps to the target.
_ROLE_WILDCARD: dict[str, str] = {
    "placement": "entities:placed",
    "environment": "world:environment",
    "setting": "world:environment",
    "mood": "materials:atmosphere",
    "romance": "materials:romance",
}

# ── Category-only fallback (primitives — no role field) ────────────────────

_CATEGORY_FALLBACK: dict[str, str] = {
    "light": "lighting:key",
    "color": "materials:atmosphere",
    "camera": "camera:angle",
    "environment": "world:environment",
    "location": "world:environment",
    "character_pose": "entities:subject",
    "pose": "entities:subject",
}

# ── Role-only fallback ──────────────────────────────────────────────────────

_ROLE_FALLBACK: dict[str, str] = {
    "subject": "entities:subject",
    "character": "entities:main_character",
    "action": "animation:action",
    "camera": "camera:angle",
    "lighting": "lighting:key",
    "style": "materials:rendering",
    "environment": "world:environment",
    "setting": "world:environment",
    "placement": "entities:placed",
    "composition": "camera:composition",
    "mood": "materials:atmosphere",
    "romance": "materials:romance",
}


def infer_composition_role(
    *,
    role: str | None,
    category: str | None,
    tags: Mapping[str, Any] | None = None,
) -> CompositionRoleInference:
    """Infer a composition role leaf from block metadata.

    Priority chain (strict precedence):
    1. Tag-based exact match   → confidence "exact"
    2. (role, category) pair   → confidence "heuristic"
    3. Role-only fallback      → confidence "heuristic" (weaker reason)
    4. Category-only fallback  → confidence "heuristic" (primitives)
    5. Unknown                 → confidence "unknown", role_id=None
    """
    norm_role = role.strip().lower() if role else None
    norm_cat = category.strip().lower() if category else None
    norm_tags: dict[str, Any] = {}
    if tags:
        norm_tags = {k.strip().lower(): v for k, v in tags.items()}

    # ── 1. Tag-based exact match ────────────────────────────────────────
    if norm_tags:
        tag_hits: set[str] = set()

        # Check tag key exact matches
        for tag_key in norm_tags:
            if tag_key in _TAG_KEY_EXACT:
                tag_hits.add(_TAG_KEY_EXACT[tag_key])

        # Check (tag_key, tag_value) exact matches
        for tag_key, tag_value in norm_tags.items():
            if isinstance(tag_value, str):
                pair = (tag_key, tag_value.strip().lower())
                if pair in _TAG_VALUE_EXACT:
                    tag_hits.add(_TAG_VALUE_EXACT[pair])

        if len(tag_hits) == 1:
            hit = next(iter(tag_hits))
            return CompositionRoleInference(
                role_id=hit,
                confidence="exact",
                reason=f"tag match → {hit}",
            )
        if len(tag_hits) > 1:
            sorted_hits = tuple(sorted(tag_hits))
            return CompositionRoleInference(
                role_id=None,
                confidence="ambiguous",
                reason=f"tags matched multiple roles: {', '.join(sorted_hits)}",
                candidates=sorted_hits,
            )

    # ── 2. (role, category) pair ────────────────────────────────────────
    if norm_role and norm_cat:
        pair_key = (norm_role, norm_cat)
        if pair_key in _ROLE_CATEGORY_TABLE:
            hit = _ROLE_CATEGORY_TABLE[pair_key]
            return CompositionRoleInference(
                role_id=hit,
                confidence="heuristic",
                reason=f"({norm_role}, {norm_cat}) → {hit}",
            )
        # Check wildcard roles
        if norm_role in _ROLE_WILDCARD:
            hit = _ROLE_WILDCARD[norm_role]
            return CompositionRoleInference(
                role_id=hit,
                confidence="heuristic",
                reason=f"({norm_role}, *) → {hit}",
            )

    # ── 3. Role-only fallback ───────────────────────────────────────────
    if norm_role and norm_role in _ROLE_FALLBACK:
        hit = _ROLE_FALLBACK[norm_role]
        return CompositionRoleInference(
            role_id=hit,
            confidence="heuristic",
            reason=f"role-only: {norm_role} → {hit}",
        )

    # ── 4. Category-only fallback (primitives) ─────────────────────────
    if norm_cat and norm_cat in _CATEGORY_FALLBACK:
        hit = _CATEGORY_FALLBACK[norm_cat]
        return CompositionRoleInference(
            role_id=hit,
            confidence="heuristic",
            reason=f"category-only: {norm_cat} → {hit}",
        )

    # ── 5. Unknown ──────────────────────────────────────────────────────
    parts = []
    if norm_role:
        parts.append(f"role={norm_role}")
    if norm_cat:
        parts.append(f"category={norm_cat}")
    if norm_tags:
        parts.append(f"tags={list(norm_tags.keys())}")
    provided = ", ".join(parts) if parts else "nothing"
    return CompositionRoleInference(
        role_id=None,
        confidence="unknown",
        reason=f"no mapping for {provided}",
    )
