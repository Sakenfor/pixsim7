"""Unit tests for `_should_export_plan` and tag-gated FS export on write."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from pixsim7.backend.main.services.docs import plan_write
from pixsim7.backend.main.services.docs.plan_write import (
    PlanBundle,
    _FS_EXPORT_TAG,
    _should_export_plan,
)


def _make_bundle(*, status: str = "active", tags=None) -> PlanBundle:
    doc = SimpleNamespace(
        title="Plan A",
        status=status,
        owner="lane",
        summary="",
        markdown="# Plan A",
        visibility="public",
        namespace="dev/plans",
        tags=list(tags) if tags is not None else [],
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
    return PlanBundle(plan=plan, doc=doc)


class TestShouldExportPlan:
    def test_killswitch_overrides_tag(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(plan_write.settings, "plans_db_only_mode", True)
        bundle = _make_bundle(tags=[_FS_EXPORT_TAG])
        assert _should_export_plan(bundle) is False

    def test_tag_absent_returns_false(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(plan_write.settings, "plans_db_only_mode", False)
        bundle = _make_bundle(tags=["unrelated"])
        assert _should_export_plan(bundle) is False

    def test_tag_present_returns_true(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(plan_write.settings, "plans_db_only_mode", False)
        bundle = _make_bundle(tags=[_FS_EXPORT_TAG, "other"])
        assert _should_export_plan(bundle) is True

    def test_none_tags_returns_false(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(plan_write.settings, "plans_db_only_mode", False)
        bundle = _make_bundle(tags=None)
        bundle.doc.tags = None
        assert _should_export_plan(bundle) is False


class TestUpdatePlanGatedExport:
    """Verify update_plan's write-side commit-back is gated on the tag, not the killswitch."""

    @pytest.mark.asyncio
    async def test_tagged_plan_exports_on_update(self, monkeypatch: pytest.MonkeyPatch) -> None:
        bundle = _make_bundle(tags=[_FS_EXPORT_TAG])
        db = SimpleNamespace(commit=AsyncMock())

        monkeypatch.setattr(plan_write, "_ensure_bundle", AsyncMock(return_value=bundle))
        monkeypatch.setattr(plan_write, "record_plan_revision", AsyncMock(return_value=SimpleNamespace(revision=2)))
        monkeypatch.setattr(plan_write, "_emit_plan_notification", AsyncMock())
        monkeypatch.setattr(plan_write.settings, "plans_db_only_mode", False)

        export_mock = MagicMock(return_value=[])
        git_mock = MagicMock(return_value=None)
        monkeypatch.setattr(plan_write, "export_plan_to_disk", export_mock)
        monkeypatch.setattr(plan_write, "_git_commit", git_mock)

        principal = SimpleNamespace(source="user:1")
        await plan_write.update_plan(
            db,
            "plan-a",
            {"summary": "Updated summary"},
            principal=principal,
        )

        export_mock.assert_called_once()
        assert export_mock.call_args.args[0] is bundle

    @pytest.mark.asyncio
    async def test_untagged_plan_skips_export(self, monkeypatch: pytest.MonkeyPatch) -> None:
        bundle = _make_bundle(tags=["unrelated"])
        db = SimpleNamespace(commit=AsyncMock())

        monkeypatch.setattr(plan_write, "_ensure_bundle", AsyncMock(return_value=bundle))
        monkeypatch.setattr(plan_write, "record_plan_revision", AsyncMock(return_value=SimpleNamespace(revision=2)))
        monkeypatch.setattr(plan_write, "_emit_plan_notification", AsyncMock())
        monkeypatch.setattr(plan_write.settings, "plans_db_only_mode", False)

        export_mock = MagicMock(return_value=[])
        git_mock = MagicMock(return_value=None)
        monkeypatch.setattr(plan_write, "export_plan_to_disk", export_mock)
        monkeypatch.setattr(plan_write, "_git_commit", git_mock)

        principal = SimpleNamespace(source="user:1")
        await plan_write.update_plan(
            db,
            "plan-a",
            {"summary": "Updated summary"},
            principal=principal,
        )

        export_mock.assert_not_called()
        git_mock.assert_not_called()

    @pytest.mark.asyncio
    async def test_killswitch_blocks_tagged_export(self, monkeypatch: pytest.MonkeyPatch) -> None:
        bundle = _make_bundle(tags=[_FS_EXPORT_TAG])
        db = SimpleNamespace(commit=AsyncMock())

        monkeypatch.setattr(plan_write, "_ensure_bundle", AsyncMock(return_value=bundle))
        monkeypatch.setattr(plan_write, "record_plan_revision", AsyncMock(return_value=SimpleNamespace(revision=2)))
        monkeypatch.setattr(plan_write, "_emit_plan_notification", AsyncMock())
        monkeypatch.setattr(plan_write.settings, "plans_db_only_mode", True)

        export_mock = MagicMock(return_value=[])
        monkeypatch.setattr(plan_write, "export_plan_to_disk", export_mock)
        monkeypatch.setattr(plan_write, "_git_commit", MagicMock(return_value=None))

        principal = SimpleNamespace(source="user:1")
        await plan_write.update_plan(
            db,
            "plan-a",
            {"summary": "Updated summary"},
            principal=principal,
        )

        export_mock.assert_not_called()


class TestExportPlanToDiskScopeOverride:
    def test_invalid_scope_override_raises(self, monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
        bundle = _make_bundle(status="active")
        monkeypatch.setattr(plan_write, "_resolve_repo_root", lambda: tmp_path)
        with pytest.raises(ValueError, match="scope_override"):
            plan_write.export_plan_to_disk(bundle, scope_override="not-a-scope")

    def test_scope_override_routes_to_target_dir(self, monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
        bundle = _make_bundle(status="active")
        bundle.doc.markdown = "# Body"
        monkeypatch.setattr(plan_write, "_resolve_repo_root", lambda: tmp_path)
        paths = plan_write.export_plan_to_disk(bundle, scope_override="parked")
        # All paths must live under the parked/ scope dir
        for p in paths:
            assert "parked" in str(p)
            assert "active" not in str(p.parent.parent)

    def test_default_scope_derives_from_status(self, monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
        bundle = _make_bundle(status="done")
        bundle.doc.markdown = "# Body"
        monkeypatch.setattr(plan_write, "_resolve_repo_root", lambda: tmp_path)
        paths = plan_write.export_plan_to_disk(bundle)
        for p in paths:
            assert "done" in str(p)
