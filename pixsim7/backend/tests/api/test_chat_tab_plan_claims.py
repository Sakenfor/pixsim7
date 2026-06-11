"""Backend coverage for the chat-tab <-> plan-claim unification (plan
``plan-participant-liveness``, checkpoint ``unify-tab-plan-categorization``,
step 1: ``unify-claim-write`` + ``session-claims-read``).

Verifies the three new backend behaviours in isolation (self-contained
session doubles — does not extend the SQL-shape-coupled harness in
``test_chat_tabs_endpoint.py``):

* ``claim_checkpoint`` forwards ``session_id`` to the participant upsert
  (the join key shared by UI @-mention and MCP self-assign).
* ``_sync_plan_claim`` mirrors a tab's ``plan_id`` transition into
  release(old)/claim(new), is a no-op when unchanged, and never lets
  claim bookkeeping fail the tab PATCH.
* ``GET /chat-tabs/{id}/plan-claims`` returns the session's open-claim
  plans plus the always-present derived primary, owner-scoped.
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "chat-tab-plan-claims",
    "label": "Chat Tab Plan-Claim Unification",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "plan-participants",
    "covers": [
        "pixsim7/backend/main/api/v1/chat_tabs.py",
        "pixsim7/backend/main/api/v1/plans/helpers.py",
    ],
    "order": 44.5,
}

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any, List, Optional
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from pixsim7.backend.main.api.v1 import chat_tabs as ct
from pixsim7.backend.main.api.v1.plans import helpers as _h
from pixsim7.backend.main.domain.docs.models import PlanParticipant
from pixsim7.backend.main.domain.platform.agent_profile import ChatTab


def _user(user_id: int) -> SimpleNamespace:
    return SimpleNamespace(id=user_id, is_admin=lambda: False)


def _result(rows: List[Any]) -> SimpleNamespace:
    return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: list(rows)))


def _open_claim(checkpoint_id: Optional[str] = "cp1", *, claimed_at: Optional[str] = None):
    return {
        "checkpoint_id": checkpoint_id,
        "claimed_at": claimed_at or datetime.now(timezone.utc).isoformat(),
        "released_at": None,
    }


def _participant(plan_id: str, session_id: str, claim: Optional[dict]) -> PlanParticipant:
    now = datetime.now(timezone.utc)
    return PlanParticipant(
        plan_id=plan_id,
        role="builder",
        principal_type="user",
        session_id=session_id,
        user_id=1,
        first_seen_at=now,
        last_seen_at=now,
        last_heartbeat_at=now,
        touches=1,
        meta=({"claim": claim} if claim is not None else None),
    )


def _tab(user_id: int, *, session_id: Optional[str], plan_id: Optional[str]) -> ChatTab:
    now = datetime.now(timezone.utc)
    return ChatTab(
        id=uuid4(),
        user_id=user_id,
        session_id=session_id,
        label="Tab",
        order_index=0,
        plan_id=plan_id,
        pinned=False,
        created_at=now,
        updated_at=now,
    )


# ── claim_checkpoint forwards session_id ─────────────────────────────


@pytest.mark.asyncio
async def test_claim_checkpoint_forwards_session_id() -> None:
    """The session_id passes through to the participant upsert verbatim."""
    db = SimpleNamespace(
        execute=AsyncMock(return_value=_result([])),
        flush=AsyncMock(),
    )
    with patch.object(_h, "_record_plan_participant_from_principal", new=AsyncMock()) as rec:
        await _h.claim_checkpoint(
            db,
            principal=_user(1),
            plan_id="plan-a",
            checkpoint_id="cp1",
            session_id="sess-9",
        )
    rec.assert_awaited_once()
    kwargs = rec.await_args.kwargs
    assert kwargs["session_id"] == "sess-9"
    assert kwargs["role"] == "builder"
    assert kwargs["action"] == "claim"
    assert kwargs["meta"]["claim"]["checkpoint_id"] == "cp1"


@pytest.mark.asyncio
async def test_claim_checkpoint_session_id_defaults_none() -> None:
    """Omitting session_id keeps the headless/roster-only behaviour."""
    db = SimpleNamespace(
        execute=AsyncMock(return_value=_result([])),
        flush=AsyncMock(),
    )
    with patch.object(_h, "_record_plan_participant_from_principal", new=AsyncMock()) as rec:
        await _h.claim_checkpoint(
            db, principal=_user(1), plan_id="plan-a", checkpoint_id=None
        )
    assert rec.await_args.kwargs["session_id"] is None


# ── _sync_plan_claim transitions ─────────────────────────────────────


@pytest.mark.asyncio
async def test_sync_noop_when_plan_unchanged() -> None:
    with patch.object(_h, "release_checkpoint", new=AsyncMock()) as rel, patch.object(
        _h, "claim_checkpoint", new=AsyncMock()
    ) as clm:
        await ct._sync_plan_claim(
            object(), user=_user(1), session_id="s1",
            old_plan_id="plan-a", new_plan_id="plan-a",
        )
    rel.assert_not_awaited()
    clm.assert_not_awaited()


@pytest.mark.asyncio
async def test_sync_bind_from_empty_claims_only() -> None:
    with patch.object(_h, "release_checkpoint", new=AsyncMock()) as rel, patch.object(
        _h, "claim_checkpoint", new=AsyncMock()
    ) as clm:
        await ct._sync_plan_claim(
            object(), user=_user(1), session_id="s1",
            old_plan_id=None, new_plan_id="plan-b",
        )
    rel.assert_not_awaited()
    clm.assert_awaited_once()
    assert clm.await_args.kwargs["plan_id"] == "plan-b"
    assert clm.await_args.kwargs["session_id"] == "s1"
    assert clm.await_args.kwargs["checkpoint_id"] is None


@pytest.mark.asyncio
async def test_sync_swap_releases_old_and_claims_new() -> None:
    with patch.object(_h, "release_checkpoint", new=AsyncMock()) as rel, patch.object(
        _h, "claim_checkpoint", new=AsyncMock()
    ) as clm:
        await ct._sync_plan_claim(
            object(), user=_user(1), session_id="s1",
            old_plan_id="plan-a", new_plan_id="plan-b",
        )
    rel.assert_awaited_once()
    assert rel.await_args.kwargs["plan_id"] == "plan-a"
    clm.assert_awaited_once()
    assert clm.await_args.kwargs["plan_id"] == "plan-b"


@pytest.mark.asyncio
async def test_sync_clear_releases_only() -> None:
    with patch.object(_h, "release_checkpoint", new=AsyncMock()) as rel, patch.object(
        _h, "claim_checkpoint", new=AsyncMock()
    ) as clm:
        await ct._sync_plan_claim(
            object(), user=_user(1), session_id="s1",
            old_plan_id="plan-a", new_plan_id=None,
        )
    rel.assert_awaited_once()
    clm.assert_not_awaited()


@pytest.mark.asyncio
async def test_sync_swallows_claim_errors() -> None:
    """Claim bookkeeping must never propagate and fail the tab PATCH."""
    with patch.object(
        _h, "release_checkpoint", new=AsyncMock()
    ), patch.object(
        _h, "claim_checkpoint", new=AsyncMock(side_effect=RuntimeError("boom"))
    ):
        # Must not raise.
        await ct._sync_plan_claim(
            object(), user=_user(1), session_id="s1",
            old_plan_id=None, new_plan_id="plan-b",
        )


# ── list_tab_plan_claims read endpoint ───────────────────────────────


class _ReadSession:
    """Minimal async session: get(ChatTab) + execute(select PlanParticipant)."""

    def __init__(self, tab: ChatTab, participants: List[PlanParticipant]):
        self._tab = tab
        self._participants = participants

    async def get(self, model: Any, key: Any) -> Optional[Any]:
        if model is ChatTab and key == self._tab.id:
            return self._tab
        return None

    async def execute(self, _stmt: Any) -> SimpleNamespace:
        return _result(self._participants)


@pytest.mark.asyncio
async def test_plan_claims_multi_with_primary_first() -> None:
    tab = _tab(1, session_id="s1", plan_id="plan-a")
    older = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    parts = [
        _participant("plan-a", "s1", _open_claim("cpA")),
        _participant("plan-b", "s1", _open_claim("cpB", claimed_at=older)),
        _participant("plan-c", "s1", {**_open_claim("cpC"), "released_at": older}),
    ]
    db = _ReadSession(tab, parts)
    with patch.object(
        _h, "resolve_plan_titles",
        new=AsyncMock(return_value={"plan-a": "Plan A", "plan-b": "Plan B"}),
    ):
        resp = await ct.list_tab_plan_claims(tab_id=tab.id, user=_user(1), db=db)

    assert resp.primaryPlanId == "plan-a"
    ids = [p.planId for p in resp.plans]
    assert "plan-c" not in ids  # released claim excluded
    assert ids[0] == "plan-a"  # primary first
    assert set(ids) == {"plan-a", "plan-b"}
    assert resp.plans[0].primary is True
    assert resp.plans[0].planTitle == "Plan A"


@pytest.mark.asyncio
async def test_plan_claims_primary_present_without_claim_row() -> None:
    """Derived primary is always surfaced even with no participant row."""
    tab = _tab(1, session_id="s1", plan_id="plan-z")
    db = _ReadSession(tab, [])
    with patch.object(_h, "resolve_plan_titles", new=AsyncMock(return_value={})):
        resp = await ct.list_tab_plan_claims(tab_id=tab.id, user=_user(1), db=db)
    assert [p.planId for p in resp.plans] == ["plan-z"]
    assert resp.plans[0].primary is True


@pytest.mark.asyncio
async def test_plan_claims_unbound_tab_no_session() -> None:
    tab = _tab(1, session_id=None, plan_id=None)
    db = _ReadSession(tab, [])
    with patch.object(_h, "resolve_plan_titles", new=AsyncMock(return_value={})):
        resp = await ct.list_tab_plan_claims(tab_id=tab.id, user=_user(1), db=db)
    assert resp.plans == []
    assert resp.primaryPlanId is None


@pytest.mark.asyncio
async def test_plan_claims_owner_scoped() -> None:
    tab = _tab(2, session_id="s1", plan_id="plan-a")
    db = _ReadSession(tab, [])
    with pytest.raises(HTTPException) as exc:
        await ct.list_tab_plan_claims(tab_id=tab.id, user=_user(1), db=db)
    assert exc.value.status_code == 403


# ── _derive_primary_plan_ids (sidebar grouping source) ───────────────


@pytest.mark.asyncio
async def test_derive_primary_uses_manual_binding_first() -> None:
    """A tab with a manual @-mention binding never needs a claim lookup."""
    tab = _tab(1, session_id="s1", plan_id="plan-mention")
    db = SimpleNamespace(execute=AsyncMock(return_value=_result([])))
    out = await ct._derive_primary_plan_ids(db, [tab])
    assert out == {str(tab.id): "plan-mention"}
    db.execute.assert_not_awaited()  # no session_ids needed a claim query


@pytest.mark.asyncio
async def test_derive_primary_falls_back_to_recent_open_claim() -> None:
    """Self-assigned-only tab (no manual binding) groups under its claim."""
    tab = _tab(1, session_id="s1", plan_id=None)
    older = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
    parts = [
        _participant("plan-old", "s1", _open_claim(claimed_at=older)),
        _participant("plan-new", "s1", _open_claim()),  # most recent
    ]
    db = SimpleNamespace(execute=AsyncMock(return_value=_result(parts)))
    out = await ct._derive_primary_plan_ids(db, [tab])
    assert out == {str(tab.id): "plan-new"}


@pytest.mark.asyncio
async def test_derive_primary_ignores_released_and_sessionless() -> None:
    bound = _tab(1, session_id="s1", plan_id=None)
    nosess = _tab(1, session_id=None, plan_id=None)
    released = (datetime.now(timezone.utc)).isoformat()
    parts = [
        _participant("plan-x", "s1", {**_open_claim(), "released_at": released}),
    ]
    db = SimpleNamespace(execute=AsyncMock(return_value=_result(parts)))
    out = await ct._derive_primary_plan_ids(db, [bound, nosess])
    # Released claim → not grouped; no session → not grouped.
    assert out == {}


# ── single-tab responses carry the claim-derived primary ─────────────


@pytest.mark.asyncio
async def test_rename_preserves_claim_derived_primary() -> None:
    """Regression: a label-only PATCH (a user rename) on a tab grouped via an
    agent's session claim must still return the claim-derived
    ``primaryPlanId``, not collapse it to the (null) manual ``plan_id``.

    Before the fix the PATCH response carried ``primaryPlanId=None``; the
    client shallow-merged that over the known value and the tab bounced out
    of its plan group until the next list poll re-derived it.
    """
    tab = _tab(1, session_id="s1", plan_id=None)
    parts = [_participant("plan-claimed", "s1", _open_claim())]
    db = SimpleNamespace(
        get=AsyncMock(return_value=tab),
        commit=AsyncMock(),
        refresh=AsyncMock(),
        execute=AsyncMock(return_value=_result(parts)),
    )
    result = await ct.update_chat_tab(
        tab_id=tab.id,
        payload=ct.ChatTabUpdateRequest(label="renamed by user"),
        user=_user(1),
        db=db,
    )
    assert result.label == "renamed by user"
    assert result.planId is None  # manual binding untouched
    assert result.primaryPlanId == "plan-claimed"  # grouping preserved
