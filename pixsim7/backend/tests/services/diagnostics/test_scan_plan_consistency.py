"""Unit tests for the scan-plan-consistency diagnostic's pure helpers.

The DB-touching ``run`` is exercised end-to-end by the corpus-invariant test
in ``tests/api/test_dev_plans_status_points_consistency.py``; here we test the
DB-free scan + canonicalize logic that decides what counts as a lie and how it
is repaired.
"""
from __future__ import annotations

import json

from pixsim7.backend.main.services.diagnostics.scan_plan_consistency import (
    LIE_FALSE_DONE,
    LIE_SILENT_DONE,
    LIE_STEPS_POINTS_CONFLICT,
    canonicalize_checkpoint,
    coerce_checkpoints,
    scan_checkpoint,
    scan_plans,
)

TEST_SUITE = {
    "id": "diagnostics-scan-plan-consistency",
    "label": "Scan-plan-consistency diagnostic",
    "kind": "unit",
    "category": "backend/services",
    "subcategory": "diagnostics",
    "covers": [
        "pixsim7/backend/main/services/diagnostics/scan_plan_consistency.py",
    ],
    "order": 26,
}


# ── coerce_checkpoints ───────────────────────────────────────────────────

def test_coerce_checkpoints_handles_list_str_none() -> None:
    cps = [{"id": "cp1"}]
    assert coerce_checkpoints(cps) == cps
    assert coerce_checkpoints(json.dumps(cps)) == cps
    assert coerce_checkpoints(None) == []
    assert coerce_checkpoints("not json") == []
    assert coerce_checkpoints(42) == []


# ── scan_checkpoint ──────────────────────────────────────────────────────

def test_scan_checkpoint_detects_false_done() -> None:
    kinds = {f["kind"] for f in scan_checkpoint(
        {"id": "cp1", "status": "done", "points_done": 1, "points_total": 5}
    )}
    assert kinds == {LIE_FALSE_DONE}


def test_scan_checkpoint_detects_silent_done() -> None:
    kinds = {f["kind"] for f in scan_checkpoint(
        {"id": "cp1", "status": "active", "points_done": 5, "points_total": 5}
    )}
    assert kinds == {LIE_SILENT_DONE}


def test_scan_checkpoint_detects_steps_points_conflict() -> None:
    kinds = {f["kind"] for f in scan_checkpoint(
        {"id": "cp1", "status": "active", "points_total": 9,
         "steps": [{"id": "s1", "done": True}, {"id": "s2", "done": False}]}
    )}
    assert LIE_STEPS_POINTS_CONFLICT in kinds


def test_scan_checkpoint_clean_is_empty() -> None:
    assert scan_checkpoint(
        {"id": "cp1", "status": "active", "points_done": 2, "points_total": 5}
    ) == []
    assert scan_checkpoint(
        {"id": "cp1", "status": "done", "points_done": 5, "points_total": 5}
    ) == []


# ── scan_plans ───────────────────────────────────────────────────────────

def test_scan_plans_aggregates_and_labels() -> None:
    findings = scan_plans([
        {"id": "p1", "checkpoints": [
            {"id": "cp1", "status": "done", "points_done": 1, "points_total": 5},
            {"id": "cp2", "status": "active", "points_done": 2, "points_total": 5},  # clean
        ]},
        # checkpoints stored as a JSON string (as the DB column hands back).
        {"id": "p2", "checkpoints": json.dumps([
            {"id": "cpA", "status": "active", "points_done": 3, "points_total": 3},
        ])},
    ])
    by_plan = {(f["plan_id"], f["checkpoint_id"]): f["kind"] for f in findings}
    assert by_plan == {
        ("p1", "cp1"): LIE_FALSE_DONE,
        ("p2", "cpA"): LIE_SILENT_DONE,
    }


def test_scan_plans_skips_non_dict_checkpoints() -> None:
    findings = scan_plans([
        {"id": "p1", "checkpoints": ["garbage", 7,
                                     {"id": "cp1", "status": "done",
                                      "points_done": 1, "points_total": 2}]},
    ])
    assert len(findings) == 1
    assert findings[0]["checkpoint_id"] == "cp1"


# ── canonicalize_checkpoint ──────────────────────────────────────────────

def test_canonicalize_completes_false_done() -> None:
    cp = {"id": "cp1", "status": "done", "points_done": 1, "points_total": 5}
    notes = canonicalize_checkpoint(cp)
    assert notes
    assert cp["points_done"] == 5 and cp["points_total"] == 5
    assert scan_checkpoint(cp) == []  # clean afterward


def test_canonicalize_promotes_silent_done() -> None:
    cp = {"id": "cp1", "status": "active", "points_done": 5, "points_total": 5}
    assert canonicalize_checkpoint(cp)
    assert cp["status"] == "done"
    assert scan_checkpoint(cp) == []


def test_canonicalize_strips_conflicting_stepped_points() -> None:
    cp = {"id": "cp1", "status": "active", "points_total": 9,
          "steps": [{"id": "s1", "done": True}, {"id": "s2", "done": False}]}
    assert canonicalize_checkpoint(cp)
    assert "points_total" not in cp and "points_done" not in cp
    assert scan_checkpoint(cp) == []


def test_canonicalize_clean_checkpoint_is_noop_and_idempotent() -> None:
    cp = {"id": "cp1", "status": "active", "points_done": 2, "points_total": 5}
    assert canonicalize_checkpoint(cp) == []
    # Running canonicalize on an already-fixed lie yields nothing the 2nd time.
    dirty = {"id": "cp2", "status": "done", "points_done": 1, "points_total": 3}
    canonicalize_checkpoint(dirty)
    assert canonicalize_checkpoint(dirty) == []
