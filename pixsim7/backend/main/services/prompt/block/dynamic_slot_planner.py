"""Dynamic slot planner contract for runtime block composition.

This module defines a first pass at the "composer input -> slot plan" contract.
It does not execute block selection itself. It only emits normalized template
slots that can be compiled/resolved by the existing compiler/resolver pipeline.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from pydantic import BaseModel, Field

from pixsim7.backend.main.services.prompt.block.template_slots import (
    normalize_template_slots,
)

if TYPE_CHECKING:
    from pixsim7.backend.main.domain.narrative.action_blocks.types_unified import (
        ActionSelectionContext,
    )
    from pixsim7.backend.main.domain.narrative.context import NarrativeContext


def _with_prefix(value: Optional[str], prefix: str) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if ":" in text:
        return text
    return f"{prefix}:{text}"


def _strip_prefix(value: Optional[str], prefix: str) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    expected = f"{prefix}:"
    if text.startswith(expected):
        return text[len(expected) :].strip() or None
    if ":" in text:
        return text.split(":", 1)[1].strip() or None
    return text


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", value).strip("_").lower()
    return slug


def _parse_tag_terms(terms: List[str]) -> Dict[str, Any]:
    parsed: Dict[str, Any] = {}
    for raw in terms:
        text = str(raw or "").strip()
        if not text or ":" not in text:
            continue
        key, value = text.split(":", 1)
        key = key.strip()
        value = value.strip()
        if not key or not value:
            continue
        existing = parsed.get(key)
        if existing is None:
            parsed[key] = value
            continue
        if isinstance(existing, list):
            if value not in existing:
                existing.append(value)
            continue
        if existing != value:
            parsed[key] = [existing, value]
    return parsed


class ComposerContextInput(BaseModel):
    """Runtime context fields relevant to slot planning."""

    location_tag: Optional[str] = None
    mood: Optional[str] = None
    intimacy_level: Optional[str] = None
    pose: Optional[str] = None
    required_tags: List[str] = Field(default_factory=list)
    exclude_tags: List[str] = Field(default_factory=list)
    lead_npc_id: Optional[int] = None
    partner_npc_id: Optional[int] = None

    @classmethod
    def from_action_selection_context(
        cls,
        context: "ActionSelectionContext",
    ) -> "ComposerContextInput":
        return cls(
            location_tag=context.locationTag,
            mood=context.mood,
            intimacy_level=context.intimacy_level,
            pose=context.pose,
            required_tags=list(context.requiredTags or []),
            exclude_tags=list(context.excludeTags or []),
            lead_npc_id=context.leadNpcId,
            partner_npc_id=context.partnerNpcId,
        )

    @classmethod
    def from_narrative_context(
        cls,
        context: "NarrativeContext",
    ) -> "ComposerContextInput":
        location_tag: Optional[str] = None
        if context.location is not None:
            if isinstance(context.location.meta, dict):
                raw = (
                    context.location.meta.get("locationTag")
                    or context.location.meta.get("location_tag")
                    or context.location.meta.get("tag")
                )
                if raw:
                    location_tag = _with_prefix(str(raw), "location")
            if location_tag is None and context.location.name:
                slug = _slugify(context.location.name)
                if slug:
                    location_tag = f"location:{slug}"

        mood_raw: Optional[str] = None
        if isinstance(context.relationship.flags, dict):
            mood_raw = context.relationship.flags.get("mood")
        if mood_raw is None and isinstance(context.session.flags, dict):
            mood_raw = context.session.flags.get("mood")
        if mood_raw is None and context.scene and isinstance(context.scene.node_meta, dict):
            mood_raw = context.scene.node_meta.get("mood")

        pose_raw: Optional[str] = None
        if context.scene and isinstance(context.scene.node_meta, dict):
            pose_raw = context.scene.node_meta.get("pose")

        return cls(
            location_tag=location_tag,
            mood=_with_prefix(str(mood_raw), "mood") if mood_raw is not None else None,
            intimacy_level=_with_prefix(context.relationship.intimacy_level, "intimacy"),
            pose=_with_prefix(str(pose_raw), "pose") if pose_raw is not None else None,
            lead_npc_id=context.npc.id,
        )


class ComposerPlanRequest(BaseModel):
    """Composer planning contract input."""

    context: ComposerContextInput = Field(default_factory=ComposerContextInput)
    block_source: str = Field(default="primitives")
    package_name: Optional[str] = None
    prefer_granular: bool = True
    include_categories: List[str] = Field(default_factory=list)
    exclude_categories: List[str] = Field(default_factory=list)

    @classmethod
    def from_action_selection_context(
        cls,
        context: "ActionSelectionContext",
        **kwargs: Any,
    ) -> "ComposerPlanRequest":
        return cls(context=ComposerContextInput.from_action_selection_context(context), **kwargs)

    @classmethod
    def from_narrative_context(
        cls,
        context: "NarrativeContext",
        **kwargs: Any,
    ) -> "ComposerPlanRequest":
        return cls(context=ComposerContextInput.from_narrative_context(context), **kwargs)


class ComposerSlotDecision(BaseModel):
    key: str
    category: str
    optional: bool
    reason: str


class ComposerSlotPlan(BaseModel):
    """Planner output contract."""

    planner_id: str
    slots: List[Dict[str, Any]] = Field(default_factory=list)
    decisions: List[ComposerSlotDecision] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    context: ComposerContextInput = Field(default_factory=ComposerContextInput)


class DynamicSlotPlanner:
    """Heuristic runtime slot planner (v1)."""

    planner_id = "dynamic_slot_planner_v1"

    _ROLE_BY_CATEGORY: Dict[str, str] = {
        "environment": "environment",
        "light": "lighting",
        "camera": "camera",
        "rendering_technique": "style",
        "form_language": "style",
        "aesthetic_preset": "style",
        "character_pose": "character",
        "location": "placement",
        "character_desc": "character",
        "mood": "mood",
        "wardrobe": "style",
    }

    _LABEL_BY_CATEGORY: Dict[str, str] = {
        "environment": "Scene environment",
        "light": "Lighting",
        "camera": "Camera framing",
        "rendering_technique": "Rendering technique",
        "form_language": "Form language",
        "aesthetic_preset": "Aesthetic preset",
        "character_pose": "Character pose",
        "location": "Spatial placement",
        "character_desc": "Character prose",
        "mood": "Mood modifier",
        "wardrobe": "Wardrobe modifier",
    }

    _ENV_SETTING_TAG_VALUES = {"urban", "rural", "studio"}
    _ENV_MOOD_TAG_VALUES = {"gritty", "serene", "neutral"}
    _POSE_STANCE_VALUES = {"standing", "seated"}
    _INTIMATE_LEVELS = {"romantic", "mature_implied", "restricted"}

    def plan(self, request: ComposerPlanRequest) -> ComposerSlotPlan:
        context = request.context
        warnings: List[str] = []

        location_value = _strip_prefix(context.location_tag, "location")
        mood_value = _strip_prefix(context.mood, "mood")
        intimacy_value = _strip_prefix(context.intimacy_level, "intimacy")
        pose_value = _strip_prefix(context.pose, "pose")

        categories: List[str] = [
            "environment",
            "light",
            "camera",
            "rendering_technique",
            "form_language",
        ]
        if request.prefer_granular:
            categories.extend(["character_pose", "location"])
        else:
            categories.append("character_desc")
        if mood_value:
            categories.append("mood")
        if request.prefer_granular and intimacy_value in self._INTIMATE_LEVELS:
            categories.append("wardrobe")

        for extra in request.include_categories:
            cat = str(extra or "").strip().lower()
            if cat and cat not in categories:
                categories.append(cat)

        excluded = {str(cat or "").strip().lower() for cat in request.exclude_categories if str(cat or "").strip()}
        categories = [cat for cat in categories if cat not in excluded]

        required_map = _parse_tag_terms(context.required_tags)
        exclude_map = _parse_tag_terms(context.exclude_tags)

        raw_slots: List[Dict[str, Any]] = []
        decisions: List[ComposerSlotDecision] = []

        for index, category in enumerate(categories):
            key = f"runtime_{category}_{index}"
            role = self._ROLE_BY_CATEGORY.get(category)
            label = self._LABEL_BY_CATEGORY.get(category, category.replace("_", " ").title())
            optional = category not in {"environment", "character_desc"}

            tags_all: Dict[str, Any] = {}
            preferences: Dict[str, Any] = {}
            reason_parts: List[str] = ["runtime default"]

            if category == "environment":
                if location_value:
                    if location_value in self._ENV_SETTING_TAG_VALUES:
                        tags_all["setting"] = location_value
                        reason_parts.append("setting hard filter from location")
                    else:
                        preferences.setdefault("boost_tags", {})["setting"] = location_value
                        reason_parts.append("setting preference from location")
                if mood_value:
                    if mood_value in self._ENV_MOOD_TAG_VALUES:
                        tags_all["mood"] = mood_value
                        reason_parts.append("mood hard filter from context")
                    else:
                        preferences.setdefault("boost_tags", {})["mood"] = mood_value
                        reason_parts.append("mood preference from context")

            if category == "character_pose" and pose_value:
                if pose_value in self._POSE_STANCE_VALUES:
                    tags_all["stance"] = pose_value
                    reason_parts.append("pose hard filter from context")
                else:
                    preferences.setdefault("boost_tags", {})["stance"] = pose_value
                    reason_parts.append("pose preference from context")

            if category == "mood" and mood_value:
                tags_all["mood"] = mood_value
                reason_parts.append("mood modifier requested")

            if category == "wardrobe" and intimacy_value:
                preferences.setdefault("boost_tags", {})["intimacy_level"] = intimacy_value
                reason_parts.append("intimacy-driven wardrobe slot")

            if required_map:
                preferences.setdefault("boost_tags", {}).update(required_map)
            if exclude_map:
                preferences.setdefault("avoid_tags", {}).update(exclude_map)

            slot: Dict[str, Any] = {
                "key": key,
                "label": label,
                "category": category,
                "optional": optional,
                "selection_strategy": "weighted_tags" if preferences else "uniform",
                "block_source": request.block_source,
            }
            if role:
                slot["role"] = role
            if request.package_name:
                slot["package_name"] = request.package_name
            if tags_all:
                slot["tags"] = {"all": tags_all}
            if preferences:
                slot["preferences"] = preferences

            raw_slots.append(slot)
            decisions.append(
                ComposerSlotDecision(
                    key=key,
                    category=category,
                    optional=optional,
                    reason="; ".join(reason_parts),
                )
            )

        if not raw_slots:
            warnings.append("No slots produced after include/exclude filters")

        normalized_slots = normalize_template_slots(raw_slots)
        return ComposerSlotPlan(
            planner_id=self.planner_id,
            slots=normalized_slots,
            decisions=decisions,
            warnings=warnings,
            context=context,
        )


def build_dynamic_slot_plan(request: ComposerPlanRequest) -> ComposerSlotPlan:
    """Convenience helper for one-shot planning."""
    return DynamicSlotPlanner().plan(request)
