"""Prompt domain policy registration for cross-domain policy indexing."""

from __future__ import annotations

from typing import Any, Dict, List

from pixsim7.backend.main.services.docs.policy_engine import (
    DOMAIN_POLICY_REGISTRY,
    ConstraintValidator,
    PolicyEngine,
)

PROMPT_POLICY_CONTRACT_VERSION = "2026-04-02.1"
PROMPT_POLICY_SCHEMA_VERSION = "1.0"
PROMPT_POLICY_DOMAIN = "prompts"
PROMPT_POLICY_CONTRACT_ENDPOINT = "/api/v1/prompts/meta/authoring-contract"

PROMPT_POLICY_RULES: list[Dict[str, Any]] = [
    {
        "id": "prompts.create_family.title_required_for_automation",
        "endpoint_id": "prompts.create_family",
        "field": "title",
        "level": "required",
        "applies_to": {"principal_types": ["agent", "service"]},
        "description": "Automated family creation requires an explicit title.",
        "constraint": {"type": "non_empty_string"},
        "message": "title is required for automated prompt family creation.",
    },
    {
        "id": "prompts.create_version.prompt_text_required_for_automation",
        "endpoint_id": "prompts.create_version",
        "field": "prompt_text",
        "level": "required",
        "applies_to": {"principal_types": ["agent", "service"]},
        "description": "Automated prompt version creation requires canonical prompt_text.",
        "constraint": {"type": "non_empty_string"},
        "message": "prompt_text is required for automated prompt version creation.",
    },
    {
        "id": "prompts.create_version.tags_suggested",
        "endpoint_id": "prompts.create_version",
        "field": "tags",
        "level": "suggested",
        "applies_to": {"principal_types": ["agent", "service", "user"]},
        "description": "Tags are recommended for downstream discovery and filtering.",
        "constraint": {"type": "array_min_items", "min_items": 1},
        "message": "Add at least one tag when creating prompt versions.",
    },
    {
        "id": "prompts.apply_edit.instruction_suggested",
        "endpoint_id": "prompts.apply_edit",
        "field": "instruction",
        "level": "suggested",
        "applies_to": {"principal_types": ["agent", "service", "user"]},
        "description": "Edit instructions make version intent auditable.",
        "constraint": {"type": "non_empty_string"},
        "message": "Include a non-empty instruction when applying prompt edits.",
    },
]


def _normalize_rule_message(rule: Dict[str, Any], field_name: str) -> str:
    return str(rule.get("message") or f"{field_name} violated policy")


def _constraint_non_empty_string(
    value: Any,
    field_name: str,
    rule: Dict[str, Any],
    constraint: Dict[str, Any],
    payload: Any,
    context: Dict[str, Any],
) -> List[str]:
    del constraint, payload, context
    if isinstance(value, str) and value.strip():
        return []
    return [_normalize_rule_message(rule, field_name)]


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
    if isinstance(value, list) and len(value) >= min_items:
        return []
    return [_normalize_rule_message(rule, field_name)]


PROMPT_POLICY_CONSTRAINT_VALIDATORS: Dict[str, ConstraintValidator] = {
    "non_empty_string": _constraint_non_empty_string,
    "array_min_items": _constraint_array_min_items,
}

PROMPT_POLICY_ENGINE = PolicyEngine(
    contract_version=PROMPT_POLICY_CONTRACT_VERSION,
    schema_version=PROMPT_POLICY_SCHEMA_VERSION,
    domain=PROMPT_POLICY_DOMAIN,
    contract_endpoint=PROMPT_POLICY_CONTRACT_ENDPOINT,
    summary=(
        "Prompt authoring policy surface for cross-domain policy discovery and "
        "authoring quality checks."
    ),
    rules=PROMPT_POLICY_RULES,
    constraint_validators=PROMPT_POLICY_CONSTRAINT_VALIDATORS,
)
DOMAIN_POLICY_REGISTRY.register(PROMPT_POLICY_DOMAIN, PROMPT_POLICY_ENGINE)


def get_prompt_policy_contract() -> Dict[str, Any]:
    return PROMPT_POLICY_ENGINE.get_contract()
