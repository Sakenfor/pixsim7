"""Tests for plan request kind normalization and executor guardrails."""
from __future__ import annotations

TEST_SUITE = {
    "id": "plan-request-kind-registry",
    "label": "Plan Request Kind Registry",
    "kind": "unit",
    "category": "backend/api",
    "subcategory": "plan-reviews",
    "covers": [
        "pixsim7/backend/main/api/v1/plans/helpers.py",
    ],
    "order": 41,
}

from types import SimpleNamespace
from uuid import uuid4

import pytest

try:
    from fastapi import HTTPException
    from pixsim7.backend.main.api.v1.plans import helpers as plan_helpers
    from pixsim7.backend.main.api.v1.plans.helpers import (
        _dispatch_review_request_execution,
        _normalize_plan_request_kind,
    )

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="backend deps not available")


class TestPlanRequestKindRegistry:
    def test_kind_normalization(self):
        """Each kind normalizes to itself, defaults to review."""
        assert _normalize_plan_request_kind("review") == "review"
        assert _normalize_plan_request_kind("build") == "build"
        assert _normalize_plan_request_kind("research") == "research"
        assert _normalize_plan_request_kind(" REVIEW ") == "review"
        assert _normalize_plan_request_kind(None) == "review"
        assert _normalize_plan_request_kind("") == "review"

    @pytest.mark.asyncio
    async def test_dispatch_rejects_unknown_kind(self):
        request_row = SimpleNamespace(
            id=uuid4(),
            kind="test",
            status="open",
        )

        with pytest.raises(HTTPException) as excinfo:
            await _dispatch_review_request_execution(
                db=SimpleNamespace(),
                plan_id="plan-a",
                request_row=request_row,
                principal=SimpleNamespace(id=1),
                timeout_seconds=120,
                spawn_if_missing=False,
                create_round_if_missing=True,
            )

        assert excinfo.value.status_code == 400
        assert "Unsupported plan request kind 'test'" in str(excinfo.value.detail)

    @pytest.mark.asyncio
    async def test_dispatch_rejects_stale_patch_base_revision(self, monkeypatch):
        request_row = SimpleNamespace(
            id=uuid4(),
            kind="review",
            status="open",
            meta={"review_mode": "apply_patch", "base_revision": 3},
            target_user_id=None,
            target_bridge_id=None,
            target_agent_id=None,
            target_agent_type=None,
        )

        async def _bundle(*_args, **_kwargs):
            return SimpleNamespace(doc=SimpleNamespace(revision=5))

        monkeypatch.setattr(plan_helpers, "get_plan_bundle", _bundle)

        with pytest.raises(HTTPException) as excinfo:
            await _dispatch_review_request_execution(
                db=SimpleNamespace(),
                plan_id="plan-a",
                request_row=request_row,
                principal=SimpleNamespace(id=1, source="user:1"),
                timeout_seconds=120,
                spawn_if_missing=False,
                create_round_if_missing=True,
            )

        assert excinfo.value.status_code == 409
        detail = excinfo.value.detail
        assert isinstance(detail, dict)
        assert detail["error"] == "plan_review_base_revision_conflict"
        assert detail["expected_revision"] == 3
        assert detail["current_revision"] == 5

    @pytest.mark.asyncio
    async def test_dispatch_allows_patch_base_revision_match(self, monkeypatch):
        request_row = SimpleNamespace(
            id=uuid4(),
            kind="review",
            status="open",
            meta={"review_mode": "apply_patch", "base_revision": 5},
            target_user_id=None,
            target_bridge_id=None,
            target_agent_id=None,
            target_agent_type=None,
        )

        async def _bundle(*_args, **_kwargs):
            return SimpleNamespace(doc=SimpleNamespace(revision=5))

        async def _after_guard(*_args, **_kwargs):
            raise HTTPException(status_code=418, detail="after base revision guard")

        monkeypatch.setattr(plan_helpers, "get_plan_bundle", _bundle)
        monkeypatch.setattr(plan_helpers, "_resolve_request_target_user", _after_guard)

        with pytest.raises(HTTPException) as excinfo:
            await _dispatch_review_request_execution(
                db=SimpleNamespace(),
                plan_id="plan-a",
                request_row=request_row,
                principal=SimpleNamespace(id=1, source="user:1"),
                timeout_seconds=120,
                spawn_if_missing=False,
                create_round_if_missing=True,
            )

        assert excinfo.value.status_code == 418
        assert "after base revision guard" in str(excinfo.value.detail)
