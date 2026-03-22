"""Canonical plan authoring policy for required and suggested fields.

This module is the single source of truth for agent/service plan authoring
rules so requirements are not duplicated across endpoint handlers, prompts,
and MCP contract metadata.
"""

from __future__ import annotations

import copy
from typing import Any, Dict, List

PLAN_AUTHORING_CONTRACT_VERSION = "2026-03-21.1"
PLAN_AUTHORING_CONTRACT_ENDPOINT = "/api/v1/dev/plans/meta/authoring-contract"

PLAN_AUTHORING_RULES: List[Dict[str, Any]] = [
    {
        "id": "plans.create.checkpoints.non_empty_for_automation",
        "endpoint_id": "plans.create",
        "field": "checkpoints",
        "level": "required",
        "applies_to_principal_types": ["agent", "service"],
        "description": (
            "Automated plan creation must seed checkpoints so progress logging "
            "works immediately."
        ),
        "constraint": {"type": "array_min_items", "min_items": 1},
        "message": (
            "checkpoints is required for automated plan creation "
            "(principal_type=agent|service)."
        ),
    },
    {
        "id": "plans.create.checkpoints.id_label_for_automation",
        "endpoint_id": "plans.create",
        "field": "checkpoints",
        "level": "required",
        "applies_to_principal_types": ["agent", "service"],
        "description": "Each automated checkpoint must have stable id and label fields.",
        "constraint": {
            "type": "array_items_required_keys",
            "required_keys": ["id", "label"],
        },
        "message": "Each checkpoint must include non-empty 'id' and 'label'.",
    },
    {
        "id": "plans.create.checkpoints.points_total_suggested",
        "endpoint_id": "plans.create",
        "field": "checkpoints",
        "level": "suggested",
        "applies_to_principal_types": ["agent", "service", "user"],
        "description": (
            "Include points_total (and optionally points_done) for each checkpoint "
            "to make progress accounting explicit."
        ),
        "constraint": {"type": "advisory"},
        "message": "Add points_total on checkpoints to improve progress visibility.",
    },
    {
        "id": "plans.create.summary_codepaths_suggested",
        "endpoint_id": "plans.create",
        "field": "summary",
        "level": "suggested",
        "applies_to_principal_types": ["agent", "service", "user"],
        "description": (
            "Include summary and code_paths when known so assignment context is "
            "clear from the first fetch."
        ),
        "constraint": {"type": "advisory"},
        "message": "Provide summary and code_paths for stronger assignment context.",
    },
    {
        "id": "plans.create.companions_as_documents_suggested",
        "endpoint_id": "plans.create",
        "field": "companions",
        "level": "suggested",
        "applies_to_principal_types": ["agent", "service", "user"],
        "description": (
            "Companion references should be document IDs from the docs API "
            "(POST /api/v1/dev/plans) rather than raw file paths. This makes "
            "companions searchable, versionable, and viewable without filesystem access."
        ),
        "constraint": {"type": "advisory"},
        "message": "Prefer document IDs over file paths for companions.",
    },
]


def _principal_type(principal: Any) -> str:
    ptype = getattr(principal, "principal_type", None)
    if isinstance(ptype, str) and ptype.strip():
        return ptype.strip().lower()

    source = getattr(principal, "source", None)
    if isinstance(source, str):
        if source.startswith("agent:"):
            return "agent"
        if source.startswith("service:"):
            return "service"
    return "user"


def get_plan_authoring_rules() -> List[Dict[str, Any]]:
    return copy.deepcopy(PLAN_AUTHORING_RULES)


def get_plan_authoring_contract() -> Dict[str, Any]:
    return {
        "version": PLAN_AUTHORING_CONTRACT_VERSION,
        "endpoint": PLAN_AUTHORING_CONTRACT_ENDPOINT,
        "summary": (
            "Canonical plan authoring policy for required and suggested fields, "
            "including actor-specific requirements for automated writers."
        ),
        "rules": get_plan_authoring_rules(),
    }


def validate_plan_create_policy(payload: Any, principal: Any) -> List[str]:
    """Return policy violations for plans.create under the current principal."""
    principal_type = _principal_type(principal)
    violations: List[str] = []

    for rule in PLAN_AUTHORING_RULES:
        if rule.get("endpoint_id") != "plans.create":
            continue
        if rule.get("level") != "required":
            continue

        applies_to = rule.get("applies_to_principal_types") or []
        if principal_type not in applies_to:
            continue

        field_name = str(rule.get("field") or "").strip()
        if not field_name:
            continue
        value = getattr(payload, field_name, None)
        constraint = rule.get("constraint") or {}
        constraint_type = str(constraint.get("type") or "").strip()

        if constraint_type == "array_min_items":
            min_items = int(constraint.get("min_items", 0))
            if not isinstance(value, list) or len(value) < min_items:
                violations.append(str(rule.get("message") or f"{field_name} violated required policy"))
            continue

        if constraint_type == "array_items_required_keys":
            required_keys = [
                str(key).strip()
                for key in (constraint.get("required_keys") or [])
                if isinstance(key, str) and key.strip()
            ]
            if not required_keys:
                continue
            if not isinstance(value, list):
                violations.append(str(rule.get("message") or f"{field_name} violated required policy"))
                continue

            bad_indexes: List[int] = []
            for idx, item in enumerate(value):
                if not isinstance(item, dict):
                    bad_indexes.append(idx)
                    continue
                missing = [
                    key for key in required_keys
                    if not isinstance(item.get(key), str) or not item.get(key, "").strip()
                ]
                if missing:
                    bad_indexes.append(idx)
            if bad_indexes:
                rule_message = str(rule.get("message") or f"{field_name} violated required policy")
                violations.append(f"{rule_message} Invalid checkpoint indexes: {bad_indexes}")
            continue

    return violations

