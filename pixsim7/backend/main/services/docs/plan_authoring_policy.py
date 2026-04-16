"""Canonical plan authoring policy for required and suggested fields.

This module is the single source of truth for agent/service plan authoring
rules so requirements are not duplicated across endpoint handlers, prompts,
and MCP contract metadata.
"""

from __future__ import annotations

import copy
from typing import Any, Callable, Dict, List, Optional, Set

from pixsim_logging import get_logger

PLAN_AUTHORING_CONTRACT_VERSION = "2026-04-16.1"
PLAN_AUTHORING_CONTRACT_ENDPOINT = "/api/v1/dev/plans/meta/authoring-contract"
logger = get_logger()

PLAN_AUTHORING_RULES: List[Dict[str, Any]] = [
    {
        "id": "plans.create.id.required",
        "endpoint_id": "plans.create",
        "field": "id",
        "level": "required",
        "applies_to_principal_types": ["agent", "service", "user"],
        "description": (
            "A stable kebab-case identifier (1-120 chars) must be supplied by the "
            "caller. The server does not auto-generate plan IDs."
        ),
        "constraint": {"type": "string_required_non_empty"},
        "message": (
            "id is required — supply a stable kebab-case identifier "
            "(e.g., 'my-feature-plan')."
        ),
    },
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
    {
        "id": "plans.create.code_paths_for_coverage",
        "endpoint_id": "plans.create",
        "field": "code_paths",
        "level": "suggested",
        "applies_to_principal_types": ["agent", "service"],
        "description": (
            "Populate code_paths with the file/directory paths this plan touches. "
            "The coverage system (GET /dev/plans/coverage/{plan_id}) auto-discovers "
            "test suites whose 'covers' paths overlap these code_paths. Checkpoints "
            "can also link tests explicitly via evidence entries with "
            "kind='test_suite' and ref=<suite_id>."
        ),
        "constraint": {"type": "advisory"},
        "message": (
            "Add code_paths to enable automatic test coverage discovery. "
            "Link specific tests via checkpoint evidence: "
            "{\"kind\": \"test_suite\", \"ref\": \"<suite_id>\"}."
        ),
    },
    {
        "id": "plans.progress.evidence.test_suite_refs_registered_for_automation",
        "endpoint_id": "plans.progress",
        "field": "append_evidence",
        "level": "required",
        "applies_to_principal_types": ["agent", "service"],
        "description": (
            "When appending test_suite evidence from automated principals, each "
            "ref must exist in the test suite registry."
        ),
        "constraint": {"type": "evidence_test_suite_refs_exist"},
        "message": (
            "append_evidence test_suite refs must exist in the test registry. "
            "Run /api/v1/dev/testing/sync first if suites are missing."
        ),
    },
]


def _rule_with_defaults(rule: Dict[str, Any]) -> Dict[str, Any]:
    normalized = copy.deepcopy(rule)
    level = str(normalized.get("level") or "suggested").strip().lower()
    normalized.setdefault("severity", "error" if level == "required" else "warning")
    normalized.setdefault("since_version", PLAN_AUTHORING_CONTRACT_VERSION)
    normalized.setdefault("deprecated_at", None)
    return normalized


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
    logger.warning(
        "plan_authoring_policy_principal_type_fallback",
        principal_type_attr=ptype,
        source=source,
    )
    return "user"


def get_plan_authoring_rules() -> List[Dict[str, Any]]:
    return [_rule_with_defaults(rule) for rule in PLAN_AUTHORING_RULES]


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


def _get_payload_field(payload: Any, field_name: str) -> Any:
    if isinstance(payload, dict):
        return payload.get(field_name)
    return getattr(payload, field_name, None)


def _normalize_rule_message(rule: Dict[str, Any], field_name: str) -> str:
    return str(rule.get("message") or f"{field_name} violated required policy")


ConstraintValidator = Callable[
    [Any, str, Dict[str, Any], Dict[str, Any], Any, Dict[str, Any]],
    List[str],
]


def _constraint_array_min_items(
    value: Any,
    field_name: str,
    rule: Dict[str, Any],
    constraint: Dict[str, Any],
    payload: Any,
    context: Dict[str, Any],
) -> List[str]:
    del payload, context
    try:
        min_items = int(constraint.get("min_items", 0))
    except (TypeError, ValueError):
        min_items = 0
    if not isinstance(value, list) or len(value) < min_items:
        return [_normalize_rule_message(rule, field_name)]
    return []


def _constraint_array_items_required_keys(
    value: Any,
    field_name: str,
    rule: Dict[str, Any],
    constraint: Dict[str, Any],
    payload: Any,
    context: Dict[str, Any],
) -> List[str]:
    del payload, context
    required_keys = [
        str(key).strip()
        for key in (constraint.get("required_keys") or [])
        if isinstance(key, str) and key.strip()
    ]
    if not required_keys:
        return []
    if not isinstance(value, list):
        return [_normalize_rule_message(rule, field_name)]

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
        rule_message = _normalize_rule_message(rule, field_name)
        return [f"{rule_message} Invalid checkpoint indexes: {bad_indexes}"]
    return []


def _constraint_evidence_test_suite_refs_exist(
    value: Any,
    field_name: str,
    rule: Dict[str, Any],
    constraint: Dict[str, Any],
    payload: Any,
    context: Dict[str, Any],
) -> List[str]:
    del constraint, payload
    suite_ids = context.get("referenced_test_suite_ids")
    if suite_ids is None:
        suite_ids = _extract_test_suite_refs_from_evidence(value)
    else:
        suite_ids = list(suite_ids)

    known_test_suite_ids = context.get("known_test_suite_ids")
    if not suite_ids or known_test_suite_ids is None:
        return []

    missing = [sid for sid in suite_ids if sid not in known_test_suite_ids]
    if missing:
        rule_message = _normalize_rule_message(rule, field_name)
        return [f"{rule_message} Missing suite ids: {missing}"]
    return []


def _constraint_string_required_non_empty(
    value: Any,
    field_name: str,
    rule: Dict[str, Any],
    constraint: Dict[str, Any],
    payload: Any,
    context: Dict[str, Any],
) -> List[str]:
    del constraint, payload, context
    if not isinstance(value, str) or not value.strip():
        return [_normalize_rule_message(rule, field_name)]
    return []


def _constraint_advisory(
    value: Any,
    field_name: str,
    rule: Dict[str, Any],
    constraint: Dict[str, Any],
    payload: Any,
    context: Dict[str, Any],
) -> List[str]:
    del constraint, payload, context
    if value is None:
        return [_normalize_rule_message(rule, field_name)]
    if isinstance(value, str) and not value.strip():
        return [_normalize_rule_message(rule, field_name)]
    if isinstance(value, (list, tuple, set, dict)) and not value:
        return [_normalize_rule_message(rule, field_name)]
    return []


CONSTRAINT_VALIDATORS: Dict[str, ConstraintValidator] = {
    "array_min_items": _constraint_array_min_items,
    "array_items_required_keys": _constraint_array_items_required_keys,
    "evidence_test_suite_refs_exist": _constraint_evidence_test_suite_refs_exist,
    "string_required_non_empty": _constraint_string_required_non_empty,
    "advisory": _constraint_advisory,
}


def validate_policy(
    endpoint_id: str,
    payload: Any,
    principal: Any,
    *,
    levels: Optional[Set[str]] = None,
    constraint_context: Optional[Dict[str, Any]] = None,
    partial: bool = False,
) -> tuple[List[str], List[str]]:
    """Return policy violations and warnings for a specific endpoint/principal."""
    endpoint_key = str(endpoint_id or "").strip()
    if not endpoint_key:
        return [], []

    principal_type = _principal_type(principal)
    violations: List[str] = []
    warnings: List[str] = []
    active_levels = {str(level).strip().lower() for level in (levels or {"required", "suggested"})}
    context = dict(constraint_context or {})

    for rule in get_plan_authoring_rules():
        if str(rule.get("endpoint_id") or "").strip() != endpoint_key:
            continue

        level = str(rule.get("level") or "").strip().lower()
        if level not in active_levels:
            continue

        applies_to = [
            str(item).strip().lower()
            for item in (rule.get("applies_to_principal_types") or [])
            if isinstance(item, str) and item.strip()
        ]
        if principal_type not in applies_to:
            continue

        field_name = str(rule.get("field") or "").strip()
        if not field_name:
            continue

        if partial and isinstance(payload, dict) and field_name not in payload:
            continue
        value = _get_payload_field(payload, field_name)
        constraint = rule.get("constraint") or {}
        constraint_type = str(constraint.get("type") or "").strip()
        validator = CONSTRAINT_VALIDATORS.get(constraint_type)
        if validator is None:
            continue

        messages = validator(
            value,
            field_name,
            rule,
            constraint,
            payload,
            context,
        )
        if not messages:
            continue

        severity = str(rule.get("severity") or "").strip().lower()
        if severity == "warning" or level == "suggested":
            warnings.extend(messages)
        else:
            violations.extend(messages)

    return violations, warnings


def evaluate_plan_create_policy(payload: Any, principal: Any) -> tuple[List[str], List[str]]:
    """Return policy violations and warnings for plans.create."""
    return validate_policy("plans.create", payload, principal)


def validate_plan_create_policy(payload: Any, principal: Any) -> List[str]:
    """Backward-compatible wrapper: returns only violations for plans.create."""
    violations, _warnings = evaluate_plan_create_policy(payload, principal)
    return violations


def _extract_test_suite_refs_from_evidence(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []

    out: List[str] = []
    seen: Set[str] = set()
    for item in value:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("kind") or "").strip()
        ref = str(item.get("ref") or "").strip()
        if kind != "test_suite" or not ref or ref in seen:
            continue
        seen.add(ref)
        out.append(ref)
    return out


def evaluate_plan_update_policy(
    payload: Any,
    principal: Any,
) -> tuple[List[str], List[str]]:
    """Return policy violations and warnings for plans.update."""
    return validate_policy(
        "plans.update",
        payload,
        principal,
        partial=True,
    )


def validate_plan_update_policy(payload: Any, principal: Any) -> List[str]:
    """Backward-compatible wrapper: returns only violations for plans.update."""
    violations, _warnings = evaluate_plan_update_policy(payload, principal)
    return violations


def evaluate_plan_progress_policy(
    payload: Any,
    principal: Any,
    *,
    referenced_test_suite_ids: Optional[List[str]] = None,
    known_test_suite_ids: Optional[Set[str]] = None,
) -> tuple[List[str], List[str]]:
    """Return policy violations and warnings for plans.progress."""
    return validate_policy(
        "plans.progress",
        payload,
        principal,
        constraint_context={
            "referenced_test_suite_ids": referenced_test_suite_ids,
            "known_test_suite_ids": known_test_suite_ids,
        },
    )


def validate_plan_progress_policy(
    payload: Any,
    principal: Any,
    *,
    referenced_test_suite_ids: Optional[List[str]] = None,
    known_test_suite_ids: Optional[Set[str]] = None,
) -> List[str]:
    """Backward-compatible wrapper: returns only violations for plans.progress."""
    violations, _warnings = evaluate_plan_progress_policy(
        payload,
        principal,
        referenced_test_suite_ids=referenced_test_suite_ids,
        known_test_suite_ids=known_test_suite_ids,
    )
    return violations
