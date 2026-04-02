"""Unit tests for shared policy engine and registry."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Dict, List

from pixsim7.backend.main.services.docs.policy_engine import PolicyEngine, PolicyRegistry

TEST_SUITE = {
    "id": "policy-engine-core",
    "label": "Policy Engine Core Tests",
    "kind": "unit",
    "category": "backend/services",
    "subcategory": "policy-engine",
    "covers": [
        "pixsim7/backend/main/services/docs/policy_engine.py",
    ],
    "order": 40.1,
}


def _required_non_empty(
    value: Any,
    field_name: str,
    rule: Dict[str, Any],
    constraint: Dict[str, Any],
    payload: Any,
    context: Dict[str, Any],
) -> List[str]:
    del constraint, payload, context
    if value is None or (isinstance(value, str) and not value.strip()):
        return [str(rule.get("message") or f"{field_name} required")]
    return []


def _advisory_non_empty(
    value: Any,
    field_name: str,
    rule: Dict[str, Any],
    constraint: Dict[str, Any],
    payload: Any,
    context: Dict[str, Any],
) -> List[str]:
    del constraint, payload, context
    if value is None or (isinstance(value, str) and not value.strip()):
        return [str(rule.get("message") or f"{field_name} suggested")]
    return []


def _engine() -> PolicyEngine:
    rules = [
        {
            "id": "work.create.title.required",
            "endpoint_id": "work.create",
            "field": "title",
            "level": "required",
            "applies_to_principal_types": ["agent"],
            "constraint": {"type": "required_field"},
            "message": "title is required",
        },
        {
            "id": "work.create.summary.suggested",
            "endpoint_id": "work.create",
            "field": "summary",
            "level": "suggested",
            "constraint": {"type": "advisory"},
            "message": "summary is suggested",
        },
    ]
    validators = {
        "required_field": _required_non_empty,
        "advisory": _advisory_non_empty,
    }
    return PolicyEngine(
        contract_version="2026-04-02.1",
        schema_version="1.0",
        domain="work",
        contract_endpoint="/api/v1/dev/work/meta/authoring-contract",
        summary="Work policy.",
        rules=rules,
        constraint_validators=validators,
        principal_type_resolver=lambda _principal: "agent",
    )


def test_policy_engine_validates_required_and_suggested_rules() -> None:
    engine = _engine()
    payload = {"title": "", "summary": ""}
    principal = SimpleNamespace(principal_type="agent")

    violations, warnings = engine.validate("work.create", payload, principal)

    assert violations == ["title is required"]
    assert warnings == ["summary is suggested"]


def test_policy_engine_partial_update_skips_absent_fields() -> None:
    engine = _engine()
    payload = {"title": "Defined title"}
    principal = SimpleNamespace(principal_type="agent")

    violations, warnings = engine.validate(
        "work.create",
        payload,
        principal,
        partial=True,
    )

    assert violations == []
    assert warnings == []


def test_policy_registry_lists_registered_contracts() -> None:
    registry = PolicyRegistry()
    engine = _engine()

    registry.register("work", engine)

    assert registry.get("work") is engine
    assert registry.require("work") is engine
    assert registry.list_domains() == ["work"]
    contracts = registry.list_contracts()
    assert len(contracts) == 1
    assert contracts[0]["domain"] == "work"
    assert contracts[0]["endpoint"] == "/api/v1/dev/work/meta/authoring-contract"

