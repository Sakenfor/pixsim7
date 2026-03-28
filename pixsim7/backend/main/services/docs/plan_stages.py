"""Canonical plan taxonomy: stages, types, and normalization helpers."""

from __future__ import annotations

import re
from typing import Dict, List

CANONICAL_PLAN_TYPES: tuple[str, ...] = (
    "proposal",
    "feature",
    "bugfix",
    "refactor",
    "exploration",
    "task",
    "strategy",
    "reference",
)

CANONICAL_PLAN_STAGES: tuple[str, ...] = (
    "backlog",
    "proposed",
    "discovery",
    "design",
    "implementation",
    "validation",
    "rollout",
    "completed",
)

DEFAULT_PLAN_STAGE = "proposed"
LEGACY_FALLBACK_STAGE = "implementation"

_STAGE_METADATA: Dict[str, Dict[str, str]] = {
    "backlog": {
        "label": "Backlog",
        "description": "Known work not yet actively proposed.",
    },
    "proposed": {
        "label": "Proposed",
        "description": "Idea has scope, but implementation has not started.",
    },
    "discovery": {
        "label": "Discovery",
        "description": "Research, analysis, and requirement clarification.",
    },
    "design": {
        "label": "Design",
        "description": "Architecture/contract/design decisions are being finalized.",
    },
    "implementation": {
        "label": "Implementation",
        "description": "Code/content changes are actively being built.",
    },
    "validation": {
        "label": "Validation",
        "description": "Testing, verification, and stabilization before release.",
    },
    "rollout": {
        "label": "Rollout",
        "description": "Deployment, migration, and staged release execution.",
    },
    "completed": {
        "label": "Completed",
        "description": "Work is fully delivered and closed out.",
    },
}

_STAGE_ALIAS_TO_CANONICAL: Dict[str, str] = {
    "unknown": "proposed",
    "todo": "backlog",
    "draft": "proposed",
    "research": "discovery",
    "investigation": "discovery",
    "design_reviewed": "design",
    "design_approved": "design",
    "execution": "implementation",
    "in_progress": "implementation",
    "implementation_ready": "implementation",
    "foundation_complete": "implementation",
    "authoring_api": "implementation",
    "multi_iteration": "implementation",
    "rolling": "rollout",
    "v1_live": "completed",
    "done": "completed",
    "phase_0_baseline": "discovery",
    "phase_1_done": "implementation",
    "phase_2_tooling": "implementation",
    "phase_3_complete_phase_4_pending": "implementation",
    "phase_4_complete_phase_5_pending": "validation",
    "phase_6_complete_rollout_pending": "rollout",
    "packet_a_complete": "implementation",
}


def _normalize_key(value: str) -> str:
    text = re.sub(r"[\s\-]+", "_", value.strip().lower())
    text = re.sub(r"[^a-z0-9_]", "", text)
    return re.sub(r"_+", "_", text).strip("_")


def _heuristic_map(key: str) -> str | None:
    if not key:
        return None

    if key in _STAGE_ALIAS_TO_CANONICAL:
        return _STAGE_ALIAS_TO_CANONICAL[key]
    if key in CANONICAL_PLAN_STAGES:
        return key

    if "backlog" in key:
        return "backlog"
    if any(token in key for token in ("proposed", "proposal", "draft", "idea")):
        return "proposed"
    if any(token in key for token in ("discover", "investig", "research", "baseline")):
        return "discovery"
    if "design" in key:
        return "design"
    if "rollout" in key or "rolling" in key or "release" in key:
        return "rollout"
    if any(token in key for token in ("complete", "completed", "done", "live", "shipped")):
        return "completed"
    if any(token in key for token in ("validat", "qa", "test", "stabil")):
        return "validation"
    if key.startswith("phase_") or key.startswith("packet_"):
        return "implementation"
    if any(token in key for token in ("implement", "execution", "authoring", "tooling", "iteration")):
        return "implementation"

    return None


def normalize_plan_stage(value: str, *, strict: bool = False) -> str:
    """Normalize a stage string to the canonical stage taxonomy.

    When ``strict=True`` unknown values raise ``ValueError``.
    When ``strict=False`` unknown values collapse to ``LEGACY_FALLBACK_STAGE``.
    """
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Invalid 'stage': expected non-empty string.")

    key = _normalize_key(value)
    mapped = _heuristic_map(key)
    if mapped:
        return mapped

    if strict:
        allowed = ", ".join(CANONICAL_PLAN_STAGES)
        raise ValueError(
            f"Invalid stage '{value}'. Canonical stages: {allowed}."
        )
    return LEGACY_FALLBACK_STAGE


def validate_plan_stage(value: str) -> str:
    return normalize_plan_stage(value, strict=True)


def plan_stage_options() -> List[Dict[str, object]]:
    """Return canonical stage options for API/UI dropdowns."""
    aliases_by_stage: Dict[str, List[str]] = {stage: [] for stage in CANONICAL_PLAN_STAGES}
    for alias, stage in sorted(_STAGE_ALIAS_TO_CANONICAL.items()):
        aliases_by_stage.setdefault(stage, []).append(alias)

    options: List[Dict[str, object]] = []
    for stage in CANONICAL_PLAN_STAGES:
        meta = _STAGE_METADATA[stage]
        options.append(
            {
                "value": stage,
                "label": meta["label"],
                "description": meta["description"],
                "aliases": aliases_by_stage.get(stage, []),
            }
        )
    return options

