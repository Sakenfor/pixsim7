"""Unit tests for plan_write.update_plan mutable field handling."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from pixsim7.backend.main.services.docs import plan_write
from pixsim7.backend.main.services.docs.plan_write import PlanBundle


@pytest.mark.asyncio
async def test_update_plan_updates_target_and_checkpoints(monkeypatch: pytest.MonkeyPatch) -> None:
    doc = SimpleNamespace(
        title="Plan A",
        status="active",
        owner="lane",
        summary="",
        markdown="# Plan A",
        visibility="public",
        tags=[],
        revision=1,
        updated_at=None,
    )
    plan = SimpleNamespace(
        id="plan-a",
        stage="proposed",
        priority="normal",
        task_scope="plan",
        plan_type="feature",
        target=None,
        checkpoints=None,
        code_paths=[],
        companions=[],
        handoffs=[],
        depends_on=[],
        scope="active",
        updated_at=None,
    )
    bundle = PlanBundle(plan=plan, doc=doc)
    db = SimpleNamespace(commit=AsyncMock())

    monkeypatch.setattr(plan_write, "_ensure_bundle", AsyncMock(return_value=bundle))
    monkeypatch.setattr(plan_write, "record_plan_revision", AsyncMock(return_value=SimpleNamespace(revision=2)))
    monkeypatch.setattr(plan_write, "_emit_plan_notification", AsyncMock())
    monkeypatch.setattr(plan_write.settings, "plans_db_only_mode", True)

    from pixsim7.backend.main.shared.actor import RequestPrincipal
    principal = RequestPrincipal(id=1, username="test", source="user:1")

    result = await plan_write.update_plan(
        db,
        "plan-a",
        {
            "target": {"type": "system", "id": "agent-infra"},
            "checkpoints": [{"id": "phase_1", "label": "Phase 1", "status": "active"}],
        },
        principal=principal,
    )

    assert plan.target == {"type": "system", "id": "agent-infra"}
    assert plan.checkpoints == [{"id": "phase_1", "label": "Phase 1", "status": "active"}]
    assert {change["field"] for change in result.changes} == {"target", "checkpoints"}
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_plan_rejects_invalid_checkpoints_shape() -> None:
    # A list with a non-object item is rejected per-item by _validate_checkpoints.
    with pytest.raises(ValueError, match="expected object"):
        await plan_write.update_plan(
            db=SimpleNamespace(),
            plan_id="plan-a",
            updates={"checkpoints": ["not-an-object"]},
        )


def test_validate_checkpoints_strips_points_when_stepped() -> None:
    """steps-XOR-points canonicalization: a step-tracked checkpoint must not
    persist explicit points alongside steps[] (steps win on read)."""
    out = plan_write._validate_checkpoints([
        {
            "id": "cp1", "label": "C1", "status": "active",
            "points_done": 1, "points_total": 5,  # stale — should be stripped
            "steps": [
                {"id": "s1", "label": "a", "done": True},
                {"id": "s2", "label": "b", "done": False},
            ],
        },
    ])
    assert "points_done" not in out[0]
    assert "points_total" not in out[0]
    assert len(out[0]["steps"]) == 2


def test_validate_checkpoints_keeps_points_when_not_stepped() -> None:
    """Points-tracked checkpoints (no steps[]) keep their explicit points."""
    out = plan_write._validate_checkpoints([
        {"id": "cp1", "label": "C1", "status": "active",
         "points_done": 2, "points_total": 5},
    ])
    assert out[0]["points_done"] == 2
    assert out[0]["points_total"] == 5


def test_validate_checkpoints_promotes_silent_done() -> None:
    """A checkpoint complete by points but left non-done is auto-promoted."""
    out = plan_write._validate_checkpoints([
        {"id": "cp1", "label": "C1", "status": "active",
         "points_done": 5, "points_total": 5},
    ])
    assert out[0]["status"] == "done"


@pytest.mark.asyncio
async def test_update_plan_rejects_invalid_target_shape() -> None:
    with pytest.raises(ValueError, match="Invalid 'target'"):
        await plan_write.update_plan(
            db=SimpleNamespace(),
            plan_id="plan-a",
            updates={"target": ["not-an-object"]},
        )


@pytest.mark.asyncio
async def test_update_plan_accepts_tags(monkeypatch: pytest.MonkeyPatch) -> None:
    doc = SimpleNamespace(
        title="Plan A",
        status="active",
        owner="unassigned",
        summary="",
        markdown="# Plan A",
        visibility="public",
        namespace="dev/plans",
        tags=["existing"],
        revision=1,
        updated_at=None,
    )
    plan = SimpleNamespace(
        id="plan-a",
        stage="proposed",
        priority="normal",
        task_scope="plan",
        plan_type="feature",
        target=None,
        checkpoints=[],
        code_paths=[],
        companions=[],
        handoffs=[],
        depends_on=[],
        scope="active",
        updated_at=None,
    )
    bundle = PlanBundle(plan=plan, doc=doc)
    db = SimpleNamespace(commit=AsyncMock())

    monkeypatch.setattr(plan_write, "_ensure_bundle", AsyncMock(return_value=bundle))
    monkeypatch.setattr(plan_write, "record_plan_revision", AsyncMock(return_value=SimpleNamespace(revision=2)))
    monkeypatch.setattr(plan_write, "_emit_plan_notification", AsyncMock())
    monkeypatch.setattr(plan_write.settings, "plans_db_only_mode", True)

    from pixsim7.backend.main.shared.actor import RequestPrincipal
    principal = RequestPrincipal(id=1, username="test", source="user:1")

    result = await plan_write.update_plan(
        db,
        "plan-a",
        {"tags": ["existing", "lane:platform"]},
        principal=principal,
    )

    assert doc.tags == ["existing", "lane:platform"]
    assert [c["field"] for c in result.changes] == ["tags"]
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_plan_allows_removed_status_for_soft_delete(monkeypatch: pytest.MonkeyPatch) -> None:
    doc = SimpleNamespace(
        title="Plan A",
        status="active",
        owner="lane",
        summary="",
        markdown="# Plan A",
        visibility="public",
        namespace="dev/plans",
        tags=[],
        revision=1,
        updated_at=None,
    )
    plan = SimpleNamespace(
        id="plan-a",
        stage="proposed",
        priority="normal",
        task_scope="plan",
        plan_type="feature",
        target=None,
        checkpoints=[],
        code_paths=[],
        companions=[],
        handoffs=[],
        depends_on=[],
        scope="active",
        updated_at=None,
    )
    bundle = PlanBundle(plan=plan, doc=doc)
    db = SimpleNamespace(commit=AsyncMock())

    monkeypatch.setattr(plan_write, "_ensure_bundle", AsyncMock(return_value=bundle))
    monkeypatch.setattr(plan_write, "record_plan_revision", AsyncMock(return_value=SimpleNamespace(revision=2)))
    monkeypatch.setattr(plan_write, "_emit_plan_notification", AsyncMock())
    monkeypatch.setattr(plan_write.settings, "plans_db_only_mode", True)

    principal = SimpleNamespace(source="user:1")

    result = await plan_write.update_plan(
        db,
        "plan-a",
        {"status": "removed"},
        principal=principal,
    )

    assert doc.status == "removed"
    assert plan.scope == "parked"
    assert [c["field"] for c in result.changes] == ["status"]
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_plan_expected_revision_conflict(monkeypatch: pytest.MonkeyPatch) -> None:
    doc = SimpleNamespace(
        title="Plan A",
        status="active",
        owner="lane",
        summary="",
        markdown="# Plan A",
        visibility="public",
        namespace="dev/plans",
        tags=[],
        revision=5,
        updated_at=None,
    )
    plan = SimpleNamespace(
        id="plan-a",
        stage="proposed",
        priority="normal",
        task_scope="plan",
        plan_type="feature",
        target=None,
        checkpoints=[],
        code_paths=[],
        companions=[],
        handoffs=[],
        depends_on=[],
        scope="active",
        updated_at=None,
    )
    bundle = PlanBundle(plan=plan, doc=doc)
    db = SimpleNamespace(commit=AsyncMock())

    monkeypatch.setattr(plan_write, "_ensure_bundle", AsyncMock(return_value=bundle))

    with pytest.raises(plan_write.PlanRevisionConflictError) as excinfo:
        await plan_write.update_plan(
            db,
            "plan-a",
            {"status": "active"},
            expected_revision=4,
        )

    assert excinfo.value.expected_revision == 4
    assert excinfo.value.current_revision == 5
    db.commit.assert_not_called()
