"""Canonical plan authoring policy for required and suggested fields.

This module is the single source of truth for agent/service plan authoring
rules so requirements are not duplicated across endpoint handlers, prompts,
and MCP contract metadata.
"""

from __future__ import annotations

import copy
from typing import Any, Callable, Dict, List, Optional, Set

from pixsim_logging import get_logger

PLAN_AUTHORING_CONTRACT_VERSION = "2026-06-22.1"
PLAN_AUTHORING_CONTRACT_ENDPOINT = "/api/v1/dev/plans/meta/authoring-contract"
PLAN_SUMMARY_MAX_LENGTH = 280
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
            "Make progress accounting explicit on each checkpoint. Two ways:\n"
            "  • Preferred (decomposed work): write `steps[]` with concrete "
            "sub-tasks; the system auto-derives points_total = len(steps) and "
            "points_done = count(step.done). Steps win over explicit point "
            "fields when both are present, so don't write both — keep one "
            "source of truth.\n"
            "  • Acceptable (early-stage / not yet decomposed): bare "
            "`points_total` (and optionally `points_done`) as a rough size "
            "estimate. Use a small scale (~1–8 per checkpoint); split "
            "anything bigger into sub-checkpoints or a sub-plan rather than "
            "raising the number.\n"
            "Either way, downstream tools (plans.todo_summary, progress "
            "dashboards) need a points signal — checkpoint `status` rarely "
            "leaves 'pending' in practice and is not a reliable completion "
            "signal."
        ),
        "constraint": {"type": "advisory"},
        "message": (
            "Add points_total on checkpoints to improve progress visibility "
            "(or write steps[] for auto-derived points)."
        ),
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
        "id": "plans.create.summary.max_length",
        "endpoint_id": "plans.create",
        "field": "summary",
        "level": "required",
        "applies_to_principal_types": ["agent", "service", "user"],
        "description": (
            f"Plan summary must be at most {PLAN_SUMMARY_MAX_LENGTH} characters. "
            "Long-form content (audit findings, decisions, scope notes) belongs in "
            "the markdown body, not in summary. Summary is shown in list cards "
            "and graph tooltips and must stay scannable."
        ),
        "constraint": {"type": "string_max_length", "max": PLAN_SUMMARY_MAX_LENGTH},
        "message": (
            f"summary must be at most {PLAN_SUMMARY_MAX_LENGTH} characters. "
            "Move overflow into the markdown body."
        ),
    },
    {
        "id": "plans.update.summary.max_length",
        "endpoint_id": "plans.update",
        "field": "summary",
        "level": "required",
        "applies_to_principal_types": ["agent", "service", "user"],
        "description": (
            f"Plan summary must be at most {PLAN_SUMMARY_MAX_LENGTH} characters. "
            "Only enforced when summary is included in the PATCH payload."
        ),
        "constraint": {"type": "string_max_length", "max": PLAN_SUMMARY_MAX_LENGTH},
        "message": (
            f"summary must be at most {PLAN_SUMMARY_MAX_LENGTH} characters. "
            "Move overflow into the markdown body."
        ),
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
        "id": "plans.create.checkpoints.status_points_consistent",
        "endpoint_id": "plans.create",
        "field": "checkpoints",
        "level": "required",
        "applies_to_principal_types": ["agent", "service", "user"],
        "description": (
            "A checkpoint with status='done' must also have points_done >= "
            "points_total. The points field is the operational source of truth "
            "used by plans.todo_summary and the openSummary block on plans.detail "
            "— a status/points mismatch is a data lie where the checkpoint "
            "appears done in the UI but keeps surfacing as open work. Enforced "
            "as a hard rejection on full-array writes (create/update): fix the "
            "points or the status before saving. (The incremental plans.progress "
            "path auto-completes instead — an explicit status='done' there is a "
            "completion gesture.)"
        ),
        "constraint": {"type": "checkpoint_status_points_consistent"},
        "message": "Checkpoint status/points mismatch — see errors for specifics.",
    },
    {
        "id": "plans.update.checkpoints.status_points_consistent",
        "endpoint_id": "plans.update",
        "field": "checkpoints",
        "level": "required",
        "applies_to_principal_types": ["agent", "service", "user"],
        "description": (
            "Same rule as plans.create — applies only when the PATCH payload "
            "includes a checkpoints array. Skipped silently for partial updates "
            "that don't touch checkpoints. Hard rejection on the full-array write."
        ),
        "constraint": {"type": "checkpoint_status_points_consistent"},
        "message": "Checkpoint status/points mismatch — see errors for specifics.",
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
    {
        "id": "plans.work_summary.next_advisory",
        "endpoint_id": "plans.work_summary",
        "field": "metadata.next",
        "level": "suggested",
        "applies_to_principal_types": ["agent", "service"],
        "description": (
            "When logging a work_summary scoped to an active plan, populate "
            "metadata.next with concrete next-up guidance. The value surfaces "
            "in the Plans panel header and is auto-injected as context when "
            "the next agent session opens a chat on the plan, so writing it "
            "well shortens hand-off time."
        ),
        "constraint": {"type": "work_summary_next_when_active"},
        "message": (
            "Include metadata.next when logging a work_summary on an active plan "
            "— it seeds the next session's context."
        ),
    },
    {
        "id": "plans.claim.self_assign_on_start",
        "endpoint_id": "plans.claim",
        "field": "plan_id",
        "level": "suggested",
        "applies_to_principal_types": ["agent", "service"],
        "description": (
            "When starting work on an assigned plan, call "
            "POST /dev/plans/{plan_id}/claim (optionally with the checkpoint "
            "you are taking) to explicitly register presence. This makes the "
            "cross-plan active-agent roster accurate and surfaces conflicts "
            "when two agents target the same checkpoint. The claim is soft "
            "(never rejected), heartbeats while you work, and auto-releases "
            "when the run ends — but logging progress alone already records "
            "you implicitly, so an explicit claim is recommended, not required."
        ),
        "constraint": {"type": "advisory"},
        "message": (
            "Consider POST /dev/plans/{plan_id}/claim at session start for "
            "live multi-agent visibility (soft, auto-released on run end)."
        ),
        "since_version": "2026-05-17.2",
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


def _constraint_string_max_length(
    value: Any,
    field_name: str,
    rule: Dict[str, Any],
    constraint: Dict[str, Any],
    payload: Any,
    context: Dict[str, Any],
) -> List[str]:
    del payload, context
    if value is None:
        return []
    if not isinstance(value, str):
        return []
    try:
        max_length = int(constraint.get("max", 0))
    except (TypeError, ValueError):
        return []
    if max_length <= 0 or len(value) <= max_length:
        return []
    rule_message = _normalize_rule_message(rule, field_name)
    return [f"{rule_message} (got {len(value)} chars)"]


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


def _derive_points_for_consistency_check(cp: Dict[str, Any]) -> tuple[Optional[int], Optional[int]]:
    """Local copy of the points-derivation logic used by the consistency check.

    Inlined (rather than importing helpers._derive_checkpoint_points) to avoid
    a circular import between this module and the plans API layer. Behaviour
    must stay aligned: steps-derived points win when steps are present.
    """
    steps = cp.get("steps")
    if isinstance(steps, list) and steps:
        total = len(steps)
        done = sum(
            1 for s in steps
            if isinstance(s, dict) and bool(s.get("done"))
        )
        return done, total

    pd_raw = cp.get("points_done")
    pt_raw = cp.get("points_total")

    def _coerce(v: Any) -> Optional[int]:
        if v is None:
            return None
        try:
            return int(v)
        except (TypeError, ValueError):
            return None

    return _coerce(pd_raw), _coerce(pt_raw)


def check_checkpoint_status_points_consistent(cp: Dict[str, Any]) -> Optional[str]:
    """Return a warning string when a checkpoint claims status='done' while
    points_done < points_total, else None.

    The trap this catches: ``status`` on a checkpoint is rarely flipped from
    its initial value, and there are real cases (Phase 1c on
    automation-package-extraction, 6/8 marked done) where a checkpoint is
    declared done while still underwater on points. The points field is the
    operational source of truth — see ``plans.todo_summary`` and the
    ``open_summary`` block on plans.detail — so the divergence is a write-
    time data lie that hides open work from every read-side surfacing.
    """
    status = str(cp.get("status") or "").strip().lower()
    if status != "done":
        return None
    done, total = _derive_points_for_consistency_check(cp)
    if done is None or total is None or total <= 0:
        return None
    if done >= total:
        return None
    cp_id = str(cp.get("id") or "?")
    return (
        f"Checkpoint '{cp_id}': status='done' but points_done ({done}) < "
        f"points_total ({total}). Either bump points_done to {total} or "
        f"change status — the points field is the operational truth and "
        f"this checkpoint will keep showing as open in plans.todo_summary "
        f"and the openSummary block on plans.detail."
    )


def check_checkpoint_silent_done(cp: Dict[str, Any]) -> Optional[str]:
    """Return a message when a checkpoint is complete by points/steps but its
    status was never flipped to 'done' (the inverse of the done-rule), else
    None.

    The trap this catches: a checkpoint whose points reach points_total (or
    all of whose steps are done) but whose ``status`` still reads 'pending' /
    'active'. The points field is the operational truth, so the work is done —
    but every status-driven surface still renders it as open, and the plan
    never closes. The fix is to make the status agree (auto-promoted on write
    by ``promote_silent_done``).
    """
    status = str(cp.get("status") or "").strip().lower()
    if status == "done":
        return None
    done, total = _derive_points_for_consistency_check(cp)
    if done is None or total is None or total <= 0:
        return None
    if done < total:
        return None
    cp_id = str(cp.get("id") or "?")
    return (
        f"Checkpoint '{cp_id}': points_done ({done}) >= points_total ({total}) "
        f"but status is '{status or 'pending'}', not 'done'. The work is "
        f"complete by points/steps yet the checkpoint keeps showing as open."
    )


def promote_silent_done(cp: Dict[str, Any]) -> Optional[str]:
    """Canonicalize a SILENT-DONE checkpoint in place: flip status -> 'done'.

    Returns a human-readable change note when a change was made, else None.
    Points/steps are the operational truth; when they say fully-complete we
    make the status agree rather than persisting a status/points lie. No-op
    for any checkpoint that isn't silent-done.
    """
    if check_checkpoint_silent_done(cp) is None:
        return None
    prev = str(cp.get("status") or "pending")
    cp["status"] = "done"
    cp_id = str(cp.get("id") or "?")
    return (
        f"Checkpoint '{cp_id}': auto-promoted status {prev!r} -> 'done' "
        f"(points/steps already complete)."
    )


def complete_underwater_done(cp: Dict[str, Any]) -> Optional[str]:
    """Canonicalize a FALSE-DONE checkpoint in place: the caller asserted
    status='done', so complete the underlying progress to match.

    - Stepped checkpoint: mark every remaining step done (steps are the
      points source, so the points can't be raised any other way).
    - Pointed checkpoint: raise points_done (and points_total) to the budget.

    Returns a change note when a change was made, else None. This is the
    incremental ``plans.progress`` resolution where an explicit status='done'
    is a completion gesture — full-array create/update writes hard-reject the
    same condition instead.
    """
    if check_checkpoint_status_points_consistent(cp) is None:
        return None
    cp_id = str(cp.get("id") or "?")
    steps = cp.get("steps")
    if isinstance(steps, list) and steps:
        remaining = 0
        for step in steps:
            if isinstance(step, dict) and not bool(step.get("done")):
                step["done"] = True
                remaining += 1
        return (
            f"Checkpoint '{cp_id}': status='done' — auto-completed "
            f"{remaining} remaining step(s) so points agree."
        )
    _done, total = _derive_points_for_consistency_check(cp)
    if total is None:
        return None
    cp["points_done"] = total
    cp["points_total"] = total
    return (
        f"Checkpoint '{cp_id}': status='done' — auto-completed points to "
        f"{total}/{total}."
    )


def _constraint_checkpoint_status_points_consistent(
    value: Any,
    field_name: str,
    rule: Dict[str, Any],
    constraint: Dict[str, Any],
    payload: Any,
    context: Dict[str, Any],
) -> List[str]:
    """Array-payload check (plans.create / plans.update): scan each checkpoint
    and warn on every status='done' with underwater points.

    Skipped silently when ``value`` is not a list — partial updates that don't
    touch the checkpoints array shouldn't trigger this rule.
    """
    del field_name, rule, constraint, payload, context
    if not isinstance(value, list):
        return []

    warnings: List[str] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        msg = check_checkpoint_status_points_consistent(item)
        if msg:
            warnings.append(msg)
    return warnings


def _constraint_work_summary_next_when_active(
    value: Any,
    field_name: str,
    rule: Dict[str, Any],
    constraint: Dict[str, Any],
    payload: Any,
    context: Dict[str, Any],
) -> List[str]:
    """Fire when an agent's work_summary on an active plan omits metadata.next.

    Skips silently if there is no plan_id (non-plan-scoped work) or if the
    plan's status is not active (parked/done/blocked plans don't need a hand-off).
    """
    del value, constraint
    plan_id = _get_payload_field(payload, "plan_id")
    if not isinstance(plan_id, str) or not plan_id.strip():
        return []
    plan_status = context.get("plan_status")
    if isinstance(plan_status, str) and plan_status.strip().lower() != "active":
        return []
    metadata = _get_payload_field(payload, "metadata")
    next_value = metadata.get("next") if isinstance(metadata, dict) else None
    if isinstance(next_value, str) and next_value.strip():
        return []
    return [_normalize_rule_message(rule, field_name)]


CONSTRAINT_VALIDATORS: Dict[str, ConstraintValidator] = {
    "array_min_items": _constraint_array_min_items,
    "array_items_required_keys": _constraint_array_items_required_keys,
    "checkpoint_status_points_consistent": _constraint_checkpoint_status_points_consistent,
    "evidence_test_suite_refs_exist": _constraint_evidence_test_suite_refs_exist,
    "string_required_non_empty": _constraint_string_required_non_empty,
    "string_max_length": _constraint_string_max_length,
    "advisory": _constraint_advisory,
    "work_summary_next_when_active": _constraint_work_summary_next_when_active,
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


def evaluate_work_summary_policy(
    payload: Any,
    principal: Any,
    *,
    plan_status: Optional[str] = None,
) -> tuple[List[str], List[str]]:
    """Return policy violations and warnings for plans.work_summary.

    Pass ``plan_status`` so the rules can skip non-active plans where a
    hand-off note isn't expected.
    """
    return validate_policy(
        "plans.work_summary",
        payload,
        principal,
        constraint_context={"plan_status": plan_status},
    )
