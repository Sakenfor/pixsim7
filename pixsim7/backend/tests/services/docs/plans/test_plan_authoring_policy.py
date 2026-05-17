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
    assert "string_required_non_empty" in policy.CONSTRAINT_VALIDATORS
    assert "string_max_length" in policy.CONSTRAINT_VALIDATORS
    assert "advisory" in policy.CONSTRAINT_VALIDATORS
    assert "work_summary_next_when_active" in policy.CONSTRAINT_VALIDATORS


def test_validate_policy_create_enforces_required_rule_for_agent() -> None:
    payload = SimpleNamespace(id="valid-plan", checkpoints=[])
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


def test_contract_includes_id_required_rule() -> None:
    rules = policy.get_plan_authoring_rules()
    id_rules = [r for r in rules if r["id"] == "plans.create.id.required"]
    assert len(id_rules) == 1
    rule = id_rules[0]
    assert rule["field"] == "id"
    assert rule["level"] == "required"
    assert "agent" in rule["applies_to_principal_types"]
    assert "user" in rule["applies_to_principal_types"]


def test_validate_policy_create_rejects_missing_id_for_agent() -> None:
    payload = SimpleNamespace(
        id="",
        checkpoints=[{"id": "cp-1", "label": "Step 1"}],
    )
    principal = SimpleNamespace(principal_type="agent", source="agent:test")

    violations, _warnings = policy.validate_policy("plans.create", payload, principal)

    assert any("id is required" in v for v in violations)


def test_validate_policy_create_accepts_valid_id() -> None:
    payload = SimpleNamespace(
        id="my-plan",
        checkpoints=[{"id": "cp-1", "label": "Step 1"}],
        summary="A good plan",
        companions=[],
        code_paths=["src/"],
    )
    principal = SimpleNamespace(principal_type="agent", source="agent:test")

    violations, _warnings = policy.validate_policy("plans.create", payload, principal)

    assert not any("id is required" in v for v in violations)


def test_validate_policy_surfaces_suggested_warnings() -> None:
    payload = SimpleNamespace(
        id="valid-plan",
        checkpoints=[{"id": "cp-1", "label": "Checkpoint 1"}],
        summary="",
        companions=[],
        code_paths=[],
    )
    principal = SimpleNamespace(principal_type="user", source="user:1")

    violations, warnings = policy.validate_policy("plans.create", payload, principal)

    assert violations == []
    assert any("Provide summary and code_paths" in warning for warning in warnings)


def test_create_rejects_summary_over_max_length() -> None:
    payload = SimpleNamespace(
        id="long-summary-plan",
        checkpoints=[{"id": "cp-1", "label": "Step 1"}],
        summary="x" * (policy.PLAN_SUMMARY_MAX_LENGTH + 1),
        companions=[],
        code_paths=["src/"],
    )
    principal = SimpleNamespace(principal_type="user", source="user:1")

    violations, _warnings = policy.validate_policy("plans.create", payload, principal)

    assert any("summary must be at most" in v for v in violations)
    assert any(f"got {policy.PLAN_SUMMARY_MAX_LENGTH + 1} chars" in v for v in violations)


def test_create_accepts_summary_at_max_length() -> None:
    payload = SimpleNamespace(
        id="ok-summary-plan",
        checkpoints=[{"id": "cp-1", "label": "Step 1"}],
        summary="x" * policy.PLAN_SUMMARY_MAX_LENGTH,
        companions=[],
        code_paths=["src/"],
    )
    principal = SimpleNamespace(principal_type="user", source="user:1")

    violations, _warnings = policy.validate_policy("plans.create", payload, principal)

    assert not any("summary must be at most" in v for v in violations)


def test_update_rejects_summary_over_max_length_when_present() -> None:
    payload = {"summary": "x" * (policy.PLAN_SUMMARY_MAX_LENGTH + 50)}
    principal = SimpleNamespace(principal_type="user", source="user:1")

    violations = policy.validate_plan_update_policy(payload, principal)

    assert any("summary must be at most" in v for v in violations)


def test_update_skips_summary_rule_when_summary_not_in_payload() -> None:
    payload = {"status": "active"}
    principal = SimpleNamespace(principal_type="user", source="user:1")

    violations = policy.validate_plan_update_policy(payload, principal)

    assert not any("summary must be at most" in v for v in violations)


def test_update_accepts_short_summary() -> None:
    payload = {"summary": "A short, scannable summary."}
    principal = SimpleNamespace(principal_type="user", source="user:1")

    violations = policy.validate_plan_update_policy(payload, principal)

    assert not any("summary must be at most" in v for v in violations)


def test_work_summary_warns_when_next_missing_on_active_plan() -> None:
    payload = SimpleNamespace(
        action="work_summary",
        plan_id="some-plan",
        metadata={"decisions": ["chose A over B"]},
    )
    principal = SimpleNamespace(principal_type="agent", source="agent:test")

    violations, warnings = policy.evaluate_work_summary_policy(
        payload, principal, plan_status="active",
    )

    assert violations == []
    assert any("metadata.next" in w for w in warnings)


def test_work_summary_silent_when_next_present() -> None:
    payload = SimpleNamespace(
        action="work_summary",
        plan_id="some-plan",
        metadata={"next": "Pick up Phase 2 by adding the migration"},
    )
    principal = SimpleNamespace(principal_type="agent", source="agent:test")

    _, warnings = policy.evaluate_work_summary_policy(
        payload, principal, plan_status="active",
    )

    assert not any("metadata.next" in w for w in warnings)


def test_work_summary_silent_for_done_plan() -> None:
    payload = SimpleNamespace(
        action="work_summary",
        plan_id="finished-plan",
        metadata={},
    )
    principal = SimpleNamespace(principal_type="agent", source="agent:test")

    _, warnings = policy.evaluate_work_summary_policy(
        payload, principal, plan_status="done",
    )

    assert not any("metadata.next" in w for w in warnings)


def test_work_summary_silent_when_no_plan_id() -> None:
    payload = SimpleNamespace(
        action="work_summary",
        plan_id=None,
        metadata={},
    )
    principal = SimpleNamespace(principal_type="agent", source="agent:test")

    _, warnings = policy.evaluate_work_summary_policy(
        payload, principal, plan_status=None,
    )

    assert not any("metadata.next" in w for w in warnings)


def test_work_summary_does_not_apply_to_user_principal() -> None:
    payload = SimpleNamespace(
        action="work_summary",
        plan_id="some-plan",
        metadata={},
    )
    principal = SimpleNamespace(principal_type="user", source="user:1")

    _, warnings = policy.evaluate_work_summary_policy(
        payload, principal, plan_status="active",
    )

    assert not any("metadata.next" in w for w in warnings)


def test_self_assign_on_start_rule_present_and_advisory() -> None:
    rules = {r["id"]: r for r in policy.get_plan_authoring_rules()}
    rule = rules.get("plans.claim.self_assign_on_start")

    assert rule is not None
    assert rule["endpoint_id"] == "plans.claim"
    assert rule["level"] == "suggested"
    assert rule["severity"] == "warning"  # derived from level
    assert rule["constraint"] == {"type": "advisory"}
    assert "agent" in rule["applies_to_principal_types"]
    # New rule ships at the bumped contract version.
    assert policy.PLAN_AUTHORING_CONTRACT_VERSION == "2026-05-17.2"
    assert rule["since_version"] == "2026-05-17.2"
