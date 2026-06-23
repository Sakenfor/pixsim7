"""Unit tests for the close-plan soft nudge (plan
``checkpoint-consistency-enforcement``, checkpoint ``plan-level-autoclose-and-nudge``).

``maybe_close_plan_nudge`` mirrors ``maybe_tab_identity_nudge``: once per
anchor-type, hard global cap, ledger merged onto the caller's participant.meta
without clobbering the claim, no-participant no-op — on a SEPARATE meta key so
the two nudge families don't share a budget.
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any, List, Optional

import pytest

from pixsim7.backend.main.api.v1.plans import helpers as _h
from pixsim7.backend.main.domain.docs.models import PlanParticipant

TEST_SUITE = {
    "id": "plan-close-nudge",
    "label": "Close-plan soft nudge",
    "kind": "unit",
    "category": "backend/api",
    "subcategory": "plan-progress",
    "covers": ["pixsim7/backend/main/api/v1/plans/helpers.py"],
    "order": 49,
}


def _principal(user_id: int) -> SimpleNamespace:
    return SimpleNamespace(id=user_id, is_admin=lambda: False)


def _builder(user_id: int, *, meta: Optional[dict]) -> PlanParticipant:
    now = datetime.now(timezone.utc)
    return PlanParticipant(
        plan_id="plan-a",
        role="builder",
        principal_type="user",
        session_id="s1",
        user_id=user_id,
        first_seen_at=now,
        last_seen_at=now,
        last_heartbeat_at=now,
        touches=1,
        meta=meta,
    )


class _FakeDB:
    def __init__(self, *, rows: Optional[List[Any]] = None):
        self._rows = rows or []

    async def execute(self, _stmt: Any) -> SimpleNamespace:
        rows = list(self._rows)
        return SimpleNamespace(
            scalars=lambda: SimpleNamespace(
                first=lambda: rows[0] if rows else None,
                all=lambda: rows,
            )
        )


@pytest.mark.asyncio
async def test_close_nudge_first_fire_returns_text_and_writes_ledger() -> None:
    row = _builder(1, meta={_h.CLAIM_META_KEY: {"checkpoint_id": "cp1"}})
    db = _FakeDB(rows=[row])
    text = await _h.maybe_close_plan_nudge(
        db, principal=_principal(1), plan_id="plan-a",
        anchor="all_checkpoints_complete",
    )
    assert text and "close" in text.lower()
    assert "all_checkpoints_complete" in row.meta[_h.PLAN_HYGIENE_NUDGE_META_KEY]
    # Claim sibling key preserved (merge, not clobber).
    assert row.meta[_h.CLAIM_META_KEY]["checkpoint_id"] == "cp1"


@pytest.mark.asyncio
async def test_close_nudge_second_same_anchor_is_none() -> None:
    row = _builder(1, meta=None)
    db = _FakeDB(rows=[row])
    p = _principal(1)
    first = await _h.maybe_close_plan_nudge(db, principal=p, plan_id="plan-a")
    second = await _h.maybe_close_plan_nudge(db, principal=p, plan_id="plan-a")
    assert first is not None
    assert second is None  # once per anchor-type


@pytest.mark.asyncio
async def test_close_nudge_global_cap_blocks_new_anchor() -> None:
    row = _builder(1, meta={_h.PLAN_HYGIENE_NUDGE_META_KEY: {"x": "t1", "y": "t2"}})
    db = _FakeDB(rows=[row])
    text = await _h.maybe_close_plan_nudge(
        db, principal=_principal(1), plan_id="plan-a",
        anchor="all_checkpoints_complete",
    )
    assert text is None  # cap of 2 already reached


@pytest.mark.asyncio
async def test_close_nudge_no_participant_is_noop() -> None:
    db = _FakeDB(rows=[])
    text = await _h.maybe_close_plan_nudge(
        db, principal=_principal(1), plan_id="plan-a",
    )
    assert text is None


@pytest.mark.asyncio
async def test_close_nudge_unknown_anchor_is_none() -> None:
    row = _builder(1, meta=None)
    db = _FakeDB(rows=[row])
    text = await _h.maybe_close_plan_nudge(
        db, principal=_principal(1), plan_id="plan-a", anchor="bogus",
    )
    assert text is None


@pytest.mark.asyncio
async def test_close_nudge_separate_budget_from_tab_identity() -> None:
    """The two nudge families use distinct meta keys, so a full tab-identity
    ledger does not block the close nudge (and vice-versa)."""
    row = _builder(1, meta={_h.TAB_IDENTITY_NUDGE_META_KEY: {"claim": "t", "completion": "t"}})
    db = _FakeDB(rows=[row])
    text = await _h.maybe_close_plan_nudge(
        db, principal=_principal(1), plan_id="plan-a",
    )
    assert text is not None
    assert "all_checkpoints_complete" in row.meta[_h.PLAN_HYGIENE_NUDGE_META_KEY]
