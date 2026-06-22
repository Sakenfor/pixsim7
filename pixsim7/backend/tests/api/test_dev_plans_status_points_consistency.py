"""Tests for the status/points consistency rule on checkpoints.

Why this matters: a checkpoint with ``status: "done"`` but
``points_done < points_total`` is a write-time data lie. The points field
is the operational source of truth (used by ``plans.todo_summary`` and the
``open_summary`` block on ``plans.detail``), so the divergence hides open
work from every read-side surfacing. The Phase 1c checkpoint on
``automation-package-extraction`` (6/8 marked done) is the live example
that motivated this rule.

This rule is now ENFORCED, not just warned (plan
``checkpoint-consistency-enforcement``):
- Full-array create/update writes hard-reject a status='done' checkpoint
  whose points are underwater (the array-scan rule is promoted to a policy
  violation).
- The incremental ``plans.progress`` path auto-canonicalizes instead — an
  explicit status='done' completes the points/steps, and completing the
  points auto-promotes the status to 'done' (the inverse SILENT-DONE rule).

Coverage:
- Unit tests of ``check_checkpoint_status_points_consistent`` (helper).
- Unit tests of the array-scanning constraint validator (create/update path).
- Integration tests on ``plans.progress`` POST — the unique path because
  the consistency check runs AFTER the request is merged with the existing
  checkpoint, not before like the array-scan rule.
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "dev-plans-status-points-consistency",
    "label": "Checkpoint status/points consistency rule",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "plan-progress",
    "covers": [
        "pixsim7/backend/main/services/docs/plan_authoring_policy.py",
        "pixsim7/backend/main/api/v1/dev_plans.py",
    ],
    "order": 48,
}

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

try:
    import httpx
    from fastapi import FastAPI, HTTPException
    from pixsim7.backend.main.api.dependencies import (
        get_current_principal,
        get_database,
    )
    from pixsim7.backend.main.api.v1.dev_plans import router
    from pixsim7.backend.main.services.docs.plan_authoring_policy import (
        check_checkpoint_status_points_consistent,
        check_checkpoint_silent_done,
        complete_underwater_done,
        promote_silent_done,
        _constraint_checkpoint_status_points_consistent,
    )
    from pixsim7.backend.main.shared.actor import RequestPrincipal

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


# ──────────────────────────────────────────────────────────────────────
# Unit tests — helper function
# ──────────────────────────────────────────────────────────────────────

@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestCheckpointConsistencyHelper:
    def test_warns_on_done_with_underwater_points(self):
        """The canonical bad case: status='done', points_done < points_total."""
        msg = check_checkpoint_status_points_consistent({
            "id": "phase-1c", "status": "done",
            "points_done": 6, "points_total": 8,
        })
        assert msg is not None
        assert "phase-1c" in msg
        assert "6" in msg and "8" in msg

    def test_silent_on_done_with_complete_points(self):
        """Honest done: points_done >= points_total. No warning."""
        msg = check_checkpoint_status_points_consistent({
            "id": "ok", "status": "done",
            "points_done": 5, "points_total": 5,
        })
        assert msg is None

    def test_silent_on_done_with_overflowing_points(self):
        """points_done > points_total isn't this rule's concern (some flows
        set points_total = points_done automatically)."""
        msg = check_checkpoint_status_points_consistent({
            "id": "ok", "status": "done",
            "points_done": 7, "points_total": 5,
        })
        assert msg is None

    def test_silent_on_non_done_status(self):
        """Underwater points on pending/active/blocked are FINE — that's
        what underwater points are FOR. The lie is specifically claiming
        done while still owing work."""
        for status in ("pending", "active", "blocked"):
            msg = check_checkpoint_status_points_consistent({
                "id": "ok", "status": status,
                "points_done": 0, "points_total": 5,
            })
            assert msg is None, f"Should not warn on status={status}"

    def test_silent_when_points_missing(self):
        """Without a points budget we can't determine consistency; stay quiet."""
        msg = check_checkpoint_status_points_consistent({
            "id": "no-points", "status": "done",
        })
        assert msg is None

    def test_silent_when_points_total_is_zero(self):
        """Zero-total checkpoints (rare but possible) can't be underwater."""
        msg = check_checkpoint_status_points_consistent({
            "id": "zero", "status": "done",
            "points_done": 0, "points_total": 0,
        })
        assert msg is None

    def test_steps_override_explicit_points(self):
        """When steps[] is present, points are derived from len(steps) +
        count(step.done). A status='done' with only 2/5 steps done warns
        even if explicit points_done=5 says otherwise."""
        msg = check_checkpoint_status_points_consistent({
            "id": "stepped", "status": "done",
            "points_done": 5,  # this would mislead — steps win
            "points_total": 5,
            "steps": [
                {"id": "s1", "done": True},
                {"id": "s2", "done": True},
                {"id": "s3", "done": False},
                {"id": "s4", "done": False},
                {"id": "s5", "done": False},
            ],
        })
        assert msg is not None
        # Derived counts (2/5) should be in the message, not the misleading
        # explicit numbers.
        assert "2" in msg and "5" in msg

    def test_status_case_insensitive(self):
        """Status comparison is case-insensitive — DONE / Done / done all
        trigger the rule."""
        for status in ("done", "DONE", "Done", "  done  "):
            msg = check_checkpoint_status_points_consistent({
                "id": "x", "status": status,
                "points_done": 1, "points_total": 5,
            })
            assert msg is not None, f"Should warn on status={status!r}"


# ──────────────────────────────────────────────────────────────────────
# Unit tests — array-scan constraint validator
# ──────────────────────────────────────────────────────────────────────

@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestConstraintValidator:
    def test_only_bad_checkpoints_emit_warnings(self):
        """Mixed array: 3 checkpoints, 1 bad → exactly 1 warning."""
        warnings = _constraint_checkpoint_status_points_consistent(
            value=[
                {"id": "ok1", "status": "done", "points_done": 3, "points_total": 3},
                {"id": "bad", "status": "done", "points_done": 1, "points_total": 5},
                {"id": "ok2", "status": "pending", "points_done": 0, "points_total": 5},
            ],
            field_name="checkpoints", rule={}, constraint={}, payload={}, context={},
        )
        assert len(warnings) == 1
        assert "bad" in warnings[0]

    def test_empty_array_is_clean(self):
        warnings = _constraint_checkpoint_status_points_consistent(
            value=[], field_name="checkpoints",
            rule={}, constraint={}, payload={}, context={},
        )
        assert warnings == []

    def test_non_list_value_skipped(self):
        """Partial updates that don't include checkpoints in the payload pass
        None as value — must not raise, just return no warnings."""
        warnings = _constraint_checkpoint_status_points_consistent(
            value=None, field_name="checkpoints",
            rule={}, constraint={}, payload={}, context={},
        )
        assert warnings == []

    def test_non_dict_items_skipped_silently(self):
        """Garbage entries (strings, numbers) in the array don't break the
        scan — just skipped."""
        warnings = _constraint_checkpoint_status_points_consistent(
            value=["not a dict", 42,
                   {"id": "real-bad", "status": "done", "points_done": 1, "points_total": 5}],
            field_name="checkpoints",
            rule={}, constraint={}, payload={}, context={},
        )
        assert len(warnings) == 1
        assert "real-bad" in warnings[0]


# ──────────────────────────────────────────────────────────────────────
# Integration test — plans.progress (post-merge check)
# ──────────────────────────────────────────────────────────────────────

def _fake_db():
    _empty_result = SimpleNamespace(
        scalars=lambda: SimpleNamespace(all=lambda: [], first=lambda: None),
        scalar_one_or_none=lambda: None,
        scalar=lambda: None,
        first=lambda: None,
        all=lambda: [],
    )
    ns = SimpleNamespace()
    ns.commit = AsyncMock()
    ns.flush = AsyncMock()
    ns.execute = AsyncMock(return_value=_empty_result)
    ns.add = lambda obj: None
    ns.scalar_one_or_none = AsyncMock(return_value=None)
    ns.scalar = AsyncMock(return_value=None)
    return ns


def _app():
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def _db():
        yield _fake_db()

    app.dependency_overrides[get_database] = _db
    app.dependency_overrides[get_current_principal] = lambda: RequestPrincipal(
        id=1, role="user", username="t",
    )
    return app


def _client(app):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestProgressEndpointConsistency:
    @pytest.mark.asyncio
    async def test_setting_status_done_while_underwater_auto_completes(self):
        """Enforcement (was: warning). A progress call that explicitly sets
        status='done' on an underwater checkpoint is a completion gesture —
        the endpoint auto-completes the points to the budget rather than
        persisting the status/points lie. The merged checkpoint comes back
        complete, and a transparency note explains the auto-fix."""
        app = _app()
        bundle = SimpleNamespace(
            plan=SimpleNamespace(checkpoints=[
                {"id": "cp1", "label": "C1", "status": "active",
                 "points_done": 1, "points_total": 5},
            ]),
            doc=SimpleNamespace(title="Plan A"),
        )
        update_result = SimpleNamespace(
            plan_id="p", changes=[], revision=None, commit_sha=None, new_scope=None,
        )
        payload = {
            "checkpoint_id": "cp1",
            "status": "done",
            # No points_delta / points_done — the endpoint completes them.
        }
        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
                  new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.api.v1.dev_plans.update_plan",
                  new=AsyncMock(return_value=update_result)),
        ):
            async with _client(app) as c:
                resp = await c.post("/api/v1/dev/plans/progress/p", json=payload)

        assert resp.status_code == 200
        body = resp.json()
        cp = body["checkpoint"]
        assert cp["status"] == "done"
        assert cp["points_done"] == 5 and cp["points_total"] == 5, cp
        assert any("auto-completed points" in w for w in body["warnings"]), (
            f"Expected an auto-complete note, got: {body['warnings']}"
        )

    @pytest.mark.asyncio
    async def test_setting_status_done_on_stepped_completes_steps(self):
        """Stepped checkpoint: points derive from steps, so status='done'
        auto-marks every remaining step done (the only way to raise points)."""
        app = _app()
        bundle = SimpleNamespace(
            plan=SimpleNamespace(checkpoints=[
                {"id": "cp1", "label": "C1", "status": "active",
                 "steps": [
                     {"id": "s1", "done": True},
                     {"id": "s2", "done": False},
                     {"id": "s3", "done": False},
                 ]},
            ]),
            doc=SimpleNamespace(title="Plan A"),
        )
        update_result = SimpleNamespace(
            plan_id="p", changes=[], revision=None, commit_sha=None, new_scope=None,
        )
        payload = {"checkpoint_id": "cp1", "status": "done"}
        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
                  new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.api.v1.dev_plans.update_plan",
                  new=AsyncMock(return_value=update_result)),
        ):
            async with _client(app) as c:
                resp = await c.post("/api/v1/dev/plans/progress/p", json=payload)

        assert resp.status_code == 200
        body = resp.json()
        cp = body["checkpoint"]
        assert cp["status"] == "done"
        assert all(s["done"] for s in cp["steps"]), cp
        assert any("auto-completed" in w and "step" in w for w in body["warnings"])

    @pytest.mark.asyncio
    async def test_silent_done_auto_promotes_status(self):
        """Inverse rule: bumping points to the budget without touching status
        auto-promotes the checkpoint to 'done' (no silent-open lie)."""
        app = _app()
        bundle = SimpleNamespace(
            plan=SimpleNamespace(checkpoints=[
                {"id": "cp1", "label": "C1", "status": "active",
                 "points_done": 4, "points_total": 5},
            ]),
            doc=SimpleNamespace(title="Plan A"),
        )
        update_result = SimpleNamespace(
            plan_id="p", changes=[], revision=None, commit_sha=None, new_scope=None,
        )
        payload = {"checkpoint_id": "cp1", "points_delta": 1}  # -> 5/5, no status
        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
                  new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.api.v1.dev_plans.update_plan",
                  new=AsyncMock(return_value=update_result)),
        ):
            async with _client(app) as c:
                resp = await c.post("/api/v1/dev/plans/progress/p", json=payload)

        assert resp.status_code == 200
        body = resp.json()
        assert body["checkpoint"]["status"] == "done", body["checkpoint"]

    @pytest.mark.asyncio
    async def test_setting_status_done_with_full_points_no_warning(self):
        """Honest done — points bumped to total in the same call. No
        consistency warning."""
        app = _app()
        bundle = SimpleNamespace(
            plan=SimpleNamespace(checkpoints=[
                {"id": "cp1", "label": "C1", "status": "active",
                 "points_done": 1, "points_total": 5},
            ]),
            doc=SimpleNamespace(title="Plan A"),
        )
        update_result = SimpleNamespace(
            plan_id="p", changes=[], revision=None, commit_sha=None, new_scope=None,
        )
        payload = {
            "checkpoint_id": "cp1",
            "status": "done",
            "points_done": 5,  # bumps to total in the same call
        }
        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
                  new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.api.v1.dev_plans.update_plan",
                  new=AsyncMock(return_value=update_result)),
        ):
            async with _client(app) as c:
                resp = await c.post("/api/v1/dev/plans/progress/p", json=payload)

        body = resp.json()
        consistency_warnings = [
            w for w in body["warnings"]
            if "points_done" in w and "points_total" in w
        ]
        assert consistency_warnings == [], (
            f"Should not warn when points are bumped to total: {body['warnings']}"
        )

    @pytest.mark.asyncio
    async def test_partial_points_bump_no_status_change_no_warning(self):
        """Bumping points part-way without touching status — the existing
        active/pending status is preserved, so the consistency rule doesn't
        fire."""
        app = _app()
        bundle = SimpleNamespace(
            plan=SimpleNamespace(checkpoints=[
                {"id": "cp1", "label": "C1", "status": "active",
                 "points_done": 1, "points_total": 5},
            ]),
            doc=SimpleNamespace(title="Plan A"),
        )
        update_result = SimpleNamespace(
            plan_id="p", changes=[], revision=None, commit_sha=None, new_scope=None,
        )
        payload = {"checkpoint_id": "cp1", "points_delta": 2}
        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
                  new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.api.v1.dev_plans.update_plan",
                  new=AsyncMock(return_value=update_result)),
        ):
            async with _client(app) as c:
                resp = await c.post("/api/v1/dev/plans/progress/p", json=payload)

        body = resp.json()
        consistency_warnings = [
            w for w in body["warnings"]
            if "points_done" in w and "points_total" in w
        ]
        assert consistency_warnings == []
