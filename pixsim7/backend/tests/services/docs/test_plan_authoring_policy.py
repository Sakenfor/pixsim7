"""Unit tests for plan authoring policy validation engine."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

from pixsim7.backend.main.services.docs import plan_authoring_policy as policy

TEST_SUITE = {
    "id": "plan-authoring-policy",
    "label": "Plan Authoring Policy Engine",
    "kind": "unit",
    "category": "backend/services",
    "subcategory": "plan-policy",
    "covers": [
        "pixsim7/backend/main/services/docs/plan_authoring_policy.py",
    ],
    "order": 40.0,
}


def test_constraint_registry_exposes_known_validators() -> None:
    assert "array_min_items" in policy.CONSTRAINT_VALIDATORS
    assert "array_items_required_keys" in policy.CONSTRAINT_VALIDATORS
    assert "evidence_test_suite_refs_exist" in policy.CONSTRAINT_VALIDATORS
    assert "advisory" in policy.CONSTRAINT_VALIDATORS
    assert "required_field" in policy.CONSTRAINT_VALIDATORS
    assert "string_min_length" in policy.CONSTRAINT_VALIDATORS
    assert "enum_values" in policy.CONSTRAINT_VALIDATORS


def test_validate_policy_create_enforces_required_rule_for_agent() -> None:
    payload = SimpleNamespace(checkpoints=[])
    principal = SimpleNamespace(principal_type="agent", source="agent:test")

    violations, warnings = policy.validate_policy("plans.create", payload, principal)

    assert len(violations) == 1
    assert "checkpoints is required for automated plan creation" in violations[0]
    assert warnings


def test_validate_plan_create_policy_wrapper_uses_generic_engine() -> None:
    payload = SimpleNamespace(checkpoints=[])
    principal = SimpleNamespace(principal_type="service", source="service:bridge")

    assert policy.validate_plan_create_policy(payload, principal) == policy.validate_policy(
        "plans.create",
        payload,
        principal,
    )[0]


def test_validate_policy_progress_enforces_test_suite_refs() -> None:
    payload = SimpleNamespace(append_evidence=[{"kind": "test_suite", "ref": "suite-alpha"}])
    principal = SimpleNamespace(principal_type="agent", source="agent:test")

    violations, warnings = policy.validate_policy(
        "plans.progress",
        payload,
        principal,
        constraint_context={
            "known_test_suite_ids": {"suite-beta"},
        },
    )

    assert len(violations) == 1
    assert "Missing suite ids: ['suite-alpha']" in violations[0]
    assert warnings == []


def test_validate_plan_progress_policy_wrapper_passes_context() -> None:
    payload = SimpleNamespace(append_evidence=[])
    principal = SimpleNamespace(principal_type="agent", source="agent:test")

    violations = policy.validate_plan_progress_policy(
        payload,
        principal,
        referenced_test_suite_ids=["suite-alpha"],
        known_test_suite_ids={"suite-beta"},
    )

    assert len(violations) == 1
    assert "Missing suite ids: ['suite-alpha']" in violations[0]


def test_principal_type_fallback_logs_warning_for_unknown_sources(monkeypatch) -> None:
    warning = MagicMock()
    monkeypatch.setattr(policy, "logger", SimpleNamespace(warning=warning))

    principal = SimpleNamespace(source="web")
    resolved = policy._principal_type(principal)

    assert resolved == "user"
    warning.assert_called_once()


def test_rules_include_severity_and_lifecycle_metadata() -> None:
    rules = policy.get_plan_authoring_rules()
    assert rules
    for rule in rules:
        assert "severity" in rule
        assert "since_version" in rule
        assert "deprecated_at" in rule


def test_validate_policy_surfaces_suggested_warnings() -> None:
    payload = SimpleNamespace(
        checkpoints=[{"id": "cp-1", "label": "Checkpoint 1"}],
        summary="",
        companions=[],
        code_paths=[],
    )
    principal = SimpleNamespace(principal_type="user", source="user:1")

    violations, warnings = policy.validate_policy("plans.create", payload, principal)

    assert violations == []
    assert any("at least 20" in warning for warning in warnings)


def test_update_policy_enforces_non_empty_checkpoints_for_automation() -> None:
    payload = {"checkpoints": []}
    principal = SimpleNamespace(principal_type="agent", source="agent:test")

    violations, warnings = policy.evaluate_plan_update_policy(payload, principal)

    assert any("checkpoints cannot be empty for automated updates" in msg for msg in violations)
    assert warnings == []


def test_update_policy_skips_checkpoint_rule_when_field_not_present() -> None:
    payload = {"summary": "Safe update payload"}
    principal = SimpleNamespace(principal_type="agent", source="agent:test")

    violations, _warnings = policy.evaluate_plan_update_policy(payload, principal)

    assert not any("checkpoints cannot be empty" in msg for msg in violations)


def test_update_policy_enforces_enum_values_for_automation_status() -> None:
    payload = {"status": "in-flight"}
    principal = SimpleNamespace(principal_type="agent", source="agent:test")

    violations, _warnings = policy.evaluate_plan_update_policy(payload, principal)

    assert any("status must be one of" in msg for msg in violations)
