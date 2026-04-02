"""Canonical plan authoring policy for required and suggested fields.

This module is the single source of truth for agent/service plan authoring
rules so requirements are not duplicated across endpoint handlers, prompts,
and MCP contract metadata.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional, Set

from pixsim_logging import get_logger
from pixsim7.backend.main.services.docs.policy_engine import (
    DOMAIN_POLICY_REGISTRY,
    PolicyEngine,
)

PLAN_AUTHORING_CONTRACT_VERSION = "2026-03-24.1"
PLAN_AUTHORING_SCHEMA_VERSION = "2.0"
PLAN_AUTHORING_DOMAIN = "plans"
PLAN_AUTHORING_CONTRACT_ENDPOINT = "/api/v1/dev/plans/meta/authoring-contract"
logger = get_logger()
PLAN_POLICY_ENGINE: Optional[PolicyEngine] = None

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
        "id": "plans.create.summary_min_length_suggested",
        "endpoint_id": "plans.create",
        "field": "summary",
        "level": "suggested",
        "applies_to_principal_types": ["agent", "service", "user"],
        "description": (
            "Include a concise summary so assignment context is clear from the "
            "first fetch."
        ),
        "constraint": {"type": "string_min_length", "min_length": 20},
        "message": "Provide a summary with at least 20 non-whitespace characters.",
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
        "constraint": {"type": "required_field"},
        "message": (
            "Add code_paths to enable automatic test coverage discovery. "
            "Link specific tests via checkpoint evidence: "
            "{\"kind\": \"test_suite\", \"ref\": \"<suite_id>\"}."
        ),
    },
    {
        "id": "plans.update.checkpoints.cannot_empty_for_automation",
        "endpoint_id": "plans.update",
        "field": "checkpoints",
        "level": "required",
        "applies_to_principal_types": ["agent", "service"],
        "applies_to": {
            "principal_types": ["agent", "service"],
            "conditions": [{"type": "field_present", "field": "checkpoints"}],
        },
        "description": (
            "Automated updates must not clear checkpoints. Progress logging and "
            "review workflows rely on checkpoint continuity."
        ),
        "constraint": {"type": "array_min_items", "min_items": 1},
        "message": (
            "checkpoints cannot be empty for automated updates. "
            "Provide at least one checkpoint when setting checkpoints."
        ),
    },
    {
        "id": "plans.update.status.enum_for_automation",
        "endpoint_id": "plans.update",
        "field": "status",
        "level": "required",
        "applies_to_principal_types": ["agent", "service"],
        "applies_to": {
            "principal_types": ["agent", "service"],
            "conditions": [{"type": "field_present", "field": "status"}],
        },
        "description": (
            "When automation updates plan status, it must use canonical values."
        ),
        "constraint": {
            "type": "enum_values",
            "allowed": ["active", "parked", "done", "blocked", "archived", "removed"],
        },
        "message": "status must be one of: active, parked, done, blocked, archived, removed.",
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


def _policy_engine() -> PolicyEngine:
    if PLAN_POLICY_ENGINE is None:
        raise RuntimeError("Plan policy engine is not initialized.")
    return PLAN_POLICY_ENGINE


def get_plan_authoring_rules() -> List[Dict[str, Any]]:
    return _policy_engine().get_rules()


def get_plan_authoring_contract() -> Dict[str, Any]:
    return _policy_engine().get_contract()


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


def _constraint_required_field(
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


def _constraint_string_min_length(
    value: Any,
    field_name: str,
    rule: Dict[str, Any],
    constraint: Dict[str, Any],
    payload: Any,
    context: Dict[str, Any],
) -> List[str]:
    del payload, context
    try:
        min_length = int(constraint.get("min_length", 0))
    except (TypeError, ValueError):
        min_length = 0
    text = str(value or "").strip()
    if len(text) < min_length:
        return [_normalize_rule_message(rule, field_name)]
    return []


def _constraint_enum_values(
    value: Any,
    field_name: str,
    rule: Dict[str, Any],
    constraint: Dict[str, Any],
    payload: Any,
    context: Dict[str, Any],
) -> List[str]:
    del payload, context
    allowed = [str(item) for item in (constraint.get("allowed") or [])]
    if not allowed:
        return []
    if str(value) not in allowed:
        return [_normalize_rule_message(rule, field_name)]
    return []


CONSTRAINT_VALIDATORS: Dict[str, ConstraintValidator] = {
    "array_min_items": _constraint_array_min_items,
    "array_items_required_keys": _constraint_array_items_required_keys,
    "evidence_test_suite_refs_exist": _constraint_evidence_test_suite_refs_exist,
    "advisory": _constraint_advisory,
    "required_field": _constraint_required_field,
    "string_min_length": _constraint_string_min_length,
    "enum_values": _constraint_enum_values,
}


PLAN_POLICY_ENGINE = PolicyEngine(
    contract_version=PLAN_AUTHORING_CONTRACT_VERSION,
    schema_version=PLAN_AUTHORING_SCHEMA_VERSION,
    domain=PLAN_AUTHORING_DOMAIN,
    contract_endpoint=PLAN_AUTHORING_CONTRACT_ENDPOINT,
    summary=(
        "Canonical plan authoring policy for required and suggested fields, "
        "including actor-specific requirements for automated writers."
    ),
    rules=PLAN_AUTHORING_RULES,
    constraint_validators=CONSTRAINT_VALIDATORS,
    principal_type_resolver=_principal_type,
    logger=logger,
)
DOMAIN_POLICY_REGISTRY.register(PLAN_AUTHORING_DOMAIN, PLAN_POLICY_ENGINE)


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
    return _policy_engine().validate(
        endpoint_id,
        payload,
        principal,
        levels=levels,
        constraint_context=constraint_context,
        partial=partial,
    )


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
