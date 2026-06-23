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
    assert "checkpoint_steps_points_no_conflict" in policy.CONSTRAINT_VALIDATORS


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
    # The claim rule shipped at 2026-05-17.2 and is pinned there even as the
    # global contract version advances.
    assert policy.PLAN_AUTHORING_CONTRACT_VERSION == "2026-06-22.1"
    assert rule["since_version"] == "2026-05-17.2"


# ──────────────────────────────────────────────────────────────────────
# Status/points consistency — enforcement (was warning, now hard reject)
# ──────────────────────────────────────────────────────────────────────

def test_create_rejects_false_done_checkpoint() -> None:
    """status='done' while underwater is now a hard violation on the
    full-array create write, not just a warning."""
    payload = SimpleNamespace(
        id="lie-plan",
        checkpoints=[
            {"id": "cp1", "label": "C1", "status": "done",
             "points_done": 6, "points_total": 8},
        ],
        summary="ok", companions=[], code_paths=["src/"],
    )
    principal = SimpleNamespace(principal_type="user", source="user:1")

    violations, _warnings = policy.validate_policy("plans.create", payload, principal)

    assert any("cp1" in v and "points_done" in v for v in violations), violations


def test_update_rejects_false_done_checkpoint_when_array_present() -> None:
    payload = {
        "checkpoints": [
            {"id": "cp1", "label": "C1", "status": "done",
             "points_done": 1, "points_total": 5},
        ],
    }
    principal = SimpleNamespace(principal_type="agent", source="agent:test")

    violations = policy.validate_plan_update_policy(payload, principal)

    assert any("cp1" in v for v in violations), violations


def test_update_skips_consistency_rule_when_checkpoints_absent() -> None:
    """Partial PATCH that doesn't touch checkpoints must not fire the rule."""
    payload = {"status": "active"}
    principal = SimpleNamespace(principal_type="agent", source="agent:test")

    violations = policy.validate_plan_update_policy(payload, principal)

    assert not any("status/points" in v.lower() or "points_done" in v for v in violations)


def test_honest_done_checkpoint_passes_create() -> None:
    payload = SimpleNamespace(
        id="honest-plan",
        checkpoints=[
            {"id": "cp1", "label": "C1", "status": "done",
             "points_done": 5, "points_total": 5},
        ],
        summary="ok", companions=[], code_paths=["src/"],
    )
    principal = SimpleNamespace(principal_type="user", source="user:1")

    violations, _warnings = policy.validate_policy("plans.create", payload, principal)

    assert not any("points_done" in v for v in violations)


# ──────────────────────────────────────────────────────────────────────
# Inverse rule (SILENT-DONE) + canonicalizers
# ──────────────────────────────────────────────────────────────────────

def test_check_silent_done_detects_complete_but_not_done() -> None:
    msg = policy.check_checkpoint_silent_done({
        "id": "cp1", "status": "active", "points_done": 5, "points_total": 5,
    })
    assert msg is not None
    assert "cp1" in msg


def test_check_silent_done_silent_when_already_done() -> None:
    assert policy.check_checkpoint_silent_done({
        "id": "cp1", "status": "done", "points_done": 5, "points_total": 5,
    }) is None


def test_check_silent_done_silent_when_underwater() -> None:
    assert policy.check_checkpoint_silent_done({
        "id": "cp1", "status": "active", "points_done": 2, "points_total": 5,
    }) is None


def test_check_silent_done_uses_steps_tally() -> None:
    msg = policy.check_checkpoint_silent_done({
        "id": "cp1", "status": "pending",
        "steps": [{"id": "s1", "done": True}, {"id": "s2", "done": True}],
    })
    assert msg is not None


def test_promote_silent_done_flips_status_in_place() -> None:
    cp = {"id": "cp1", "status": "active", "points_done": 5, "points_total": 5}
    note = policy.promote_silent_done(cp)
    assert note is not None
    assert cp["status"] == "done"


def test_promote_silent_done_noop_when_consistent() -> None:
    cp = {"id": "cp1", "status": "active", "points_done": 2, "points_total": 5}
    assert policy.promote_silent_done(cp) is None
    assert cp["status"] == "active"


def test_complete_underwater_done_bumps_points_in_place() -> None:
    cp = {"id": "cp1", "status": "done", "points_done": 6, "points_total": 8}
    note = policy.complete_underwater_done(cp)
    assert note is not None
    assert cp["points_done"] == 8
    assert cp["points_total"] == 8


def test_complete_underwater_done_marks_steps_in_place() -> None:
    cp = {
        "id": "cp1", "status": "done",
        "steps": [
            {"id": "s1", "done": True},
            {"id": "s2", "done": False},
            {"id": "s3", "done": False},
        ],
    }
    note = policy.complete_underwater_done(cp)
    assert note is not None
    assert all(s["done"] for s in cp["steps"])
    # Re-deriving now reports a consistent, complete checkpoint.
    assert policy.check_checkpoint_status_points_consistent(cp) is None


def test_complete_underwater_done_noop_when_consistent() -> None:
    cp = {"id": "cp1", "status": "active", "points_done": 2, "points_total": 5}
    assert policy.complete_underwater_done(cp) is None
    assert cp["points_done"] == 2


# ──────────────────────────────────────────────────────────────────────
# steps-XOR-points: conflict detection + canonicalization
# ──────────────────────────────────────────────────────────────────────

def test_steps_points_conflict_detects_total_mismatch() -> None:
    msg = policy.check_checkpoint_steps_points_conflict({
        "id": "cp1",
        "points_total": 8,  # steps say 2
        "steps": [{"id": "s1", "done": True}, {"id": "s2", "done": False}],
    })
    assert msg is not None
    assert "points_total=8" in msg and "steps_total=2" in msg


def test_steps_points_conflict_detects_done_mismatch() -> None:
    msg = policy.check_checkpoint_steps_points_conflict({
        "id": "cp1",
        "points_done": 5,  # steps say 1 done
        "steps": [{"id": "s1", "done": True}, {"id": "s2", "done": False}],
    })
    assert msg is not None
    assert "points_done=5" in msg


def test_steps_points_conflict_silent_when_consistent() -> None:
    assert policy.check_checkpoint_steps_points_conflict({
        "id": "cp1",
        "points_done": 1, "points_total": 2,  # matches the steps tally
        "steps": [{"id": "s1", "done": True}, {"id": "s2", "done": False}],
    }) is None


def test_steps_points_conflict_silent_without_steps() -> None:
    assert policy.check_checkpoint_steps_points_conflict({
        "id": "cp1", "points_done": 1, "points_total": 5,
    }) is None


def test_steps_points_conflict_silent_without_explicit_points() -> None:
    assert policy.check_checkpoint_steps_points_conflict({
        "id": "cp1",
        "steps": [{"id": "s1", "done": True}, {"id": "s2", "done": False}],
    }) is None


def test_strip_stepped_points_removes_keys_in_place() -> None:
    cp = {
        "id": "cp1", "points_done": 1, "points_total": 5,
        "steps": [{"id": "s1", "done": True}],
    }
    assert policy.strip_stepped_points(cp) is True
    assert "points_done" not in cp and "points_total" not in cp
    assert cp["steps"]  # steps untouched


def test_strip_stepped_points_noop_without_steps() -> None:
    cp = {"id": "cp1", "points_done": 1, "points_total": 5}
    assert policy.strip_stepped_points(cp) is False
    assert cp["points_done"] == 1


def test_create_rejects_steps_points_conflict() -> None:
    payload = SimpleNamespace(
        id="conflict-plan",
        checkpoints=[
            {"id": "cp1", "label": "C1",
             "points_total": 8,
             "steps": [{"id": "s1", "done": True}, {"id": "s2", "done": False}]},
        ],
        summary="ok", companions=[], code_paths=["src/"],
    )
    principal = SimpleNamespace(principal_type="user", source="user:1")

    violations, _warnings = policy.validate_policy("plans.create", payload, principal)

    assert any("cp1" in v and "single source of truth" in v for v in violations), violations


def test_update_rejects_steps_points_conflict_when_array_present() -> None:
    payload = {
        "checkpoints": [
            {"id": "cp1", "label": "C1",
             "points_done": 5,
             "steps": [{"id": "s1", "done": True}, {"id": "s2", "done": False}]},
        ],
    }
    principal = SimpleNamespace(principal_type="agent", source="agent:test")

    violations = policy.validate_plan_update_policy(payload, principal)

    assert any("cp1" in v for v in violations), violations


def test_update_skips_steps_points_conflict_when_checkpoints_absent() -> None:
    payload = {"status": "active"}
    principal = SimpleNamespace(principal_type="agent", source="agent:test")

    violations = policy.validate_plan_update_policy(payload, principal)

    assert not any("source of truth" in v for v in violations)


def test_consistent_stepped_checkpoint_passes_create() -> None:
    payload = SimpleNamespace(
        id="ok-stepped-plan",
        checkpoints=[
            {"id": "cp1", "label": "C1",
             "steps": [{"id": "s1", "done": True}, {"id": "s2", "done": False}]},
        ],
        summary="ok", companions=[], code_paths=["src/"],
    )
    principal = SimpleNamespace(principal_type="user", source="user:1")

    violations, _warnings = policy.validate_policy("plans.create", payload, principal)

    assert not any("source of truth" in v for v in violations)
