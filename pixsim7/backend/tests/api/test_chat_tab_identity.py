"""Backend coverage for agent-set tab identity (plan
``plan-participant-liveness``, checkpoint ``agent-freeform-tab-identity``).

Self-contained session doubles (same style as
``test_chat_tab_plan_claims.py`` — no SQL-shape coupling). Covers:

* ``_resolve_self_tab`` — token-only resolution priority
  (scope_key ``tab:<uuid>`` → ``chat_session_id`` claim → body hint),
  owner-scoping, and the unresolvable / not-owner failure modes.
* ``set_self_tab_identity`` — partial write, explicit-null clear,
  empty-body read-back, owner-scoping.
* ``maybe_tab_identity_nudge`` — once per anchor-type, hard global cap,
  ledger merged without clobbering the claim, no-participant no-op.
* no-auto-guard — the explicit non-goals: the nudge path never touches a
  ChatTab, and identity resolution never copies a plan / agent-profile
  icon onto the tab (a fresh / unbranded tab stays icon=None).
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "chat-tab-identity",
    "label": "Agent-set Tab Identity",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "chat-tabs",
    "covers": [
        "pixsim7/backend/main/api/v1/chat_tabs.py",
        "pixsim7/backend/main/api/v1/plans/helpers.py",
        "pixsim7/backend/main/shared/actor.py",
    ],
    "order": 44.6,
}

from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any, List, Optional
from uuid import uuid4

import pytest
from fastapi import HTTPException

from pixsim7.backend.main.api.v1 import chat_tabs as ct
from pixsim7.backend.main.api.v1.plans import helpers as _h
from pixsim7.backend.main.domain.docs.models import PlanParticipant
from pixsim7.backend.main.domain.platform.agent_profile import ChatSession, ChatTab


def _principal(
    user_id: int,
    *,
    scope_key: Optional[str] = None,
    chat_session_id: Optional[str] = None,
    tab_id: Optional[str] = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=user_id,
        is_admin=lambda: False,
        scope_key=scope_key,
        chat_session_id=chat_session_id,
        tab_id=tab_id,
    )


def _tab(
    user_id: int,
    *,
    session_id: Optional[str] = None,
    icon: Optional[str] = None,
    subtitle: Optional[str] = None,
) -> ChatTab:
    now = datetime.now(timezone.utc)
    return ChatTab(
        id=uuid4(),
        user_id=user_id,
        session_id=session_id,
        label="Tab",
        icon=icon,
        subtitle=subtitle,
        order_index=0,
        plan_id=None,
        pinned=False,
        created_at=now,
        updated_at=now,
    )


def _session(
    sid: str,
    *,
    icon: Optional[str] = None,
    subtitle: Optional[str] = None,
) -> ChatSession:
    return ChatSession(id=sid, user_id=1, label="Sess", icon=icon, subtitle=subtitle)


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
    """``get`` by (model, key); ``execute`` returns a fixed row set with
    both ``.scalars().first()`` and ``.scalars().all()``."""

    def __init__(
        self,
        *,
        tabs: Optional[List[ChatTab]] = None,
        rows: Optional[List[Any]] = None,
        sessions: Optional[List[ChatSession]] = None,
    ):
        self._tabs = {t.id: t for t in (tabs or [])}
        self._sessions = {s.id: s for s in (sessions or [])}
        self._rows = rows or []
        self.committed = False

    async def get(self, model: Any, key: Any) -> Optional[Any]:
        if model is ChatTab:
            return self._tabs.get(key)
        if model is ChatSession:
            return self._sessions.get(key)
        return None

    async def execute(self, _stmt: Any) -> SimpleNamespace:
        rows = list(self._rows)
        return SimpleNamespace(
            scalars=lambda: SimpleNamespace(
                first=lambda: rows[0] if rows else None,
                all=lambda: rows,
            )
        )

    async def commit(self) -> None:
        self.committed = True

    async def refresh(self, _obj: Any) -> None:
        pass


# ── _resolve_self_tab — token-only resolution ────────────────────────


@pytest.mark.asyncio
async def test_resolve_by_tab_id_claim() -> None:
    """The tab_id claim is the primary anchor — resolves with no scope_key and
    no chat_session_id (turn 1) and for plan-scoped tabs. Plan
    ``tab-identity-mode``."""
    tab = _tab(1)
    db = _FakeDB(tabs=[tab])
    p = _principal(1, tab_id=str(tab.id), scope_key="plan:some-plan")
    resolved = await ct._resolve_self_tab(db, p, fallback_session_id=None)
    assert resolved is tab


@pytest.mark.asyncio
async def test_resolve_by_scope_key_tab_uuid() -> None:
    tab = _tab(1)
    db = _FakeDB(tabs=[tab])
    p = _principal(1, scope_key=f"tab:{tab.id}")
    resolved = await ct._resolve_self_tab(db, p, fallback_session_id=None)
    assert resolved is tab


@pytest.mark.asyncio
async def test_resolve_falls_back_to_chat_session_claim() -> None:
    tab = _tab(1, session_id="sess-7")
    db = _FakeDB(rows=[tab])  # _by_session(...).first()
    p = _principal(1, scope_key=None, chat_session_id="sess-7")
    resolved = await ct._resolve_self_tab(db, p, fallback_session_id=None)
    assert resolved is tab


@pytest.mark.asyncio
async def test_resolve_falls_back_to_body_session_hint() -> None:
    tab = _tab(1, session_id="sess-9")
    db = _FakeDB(rows=[tab])
    p = _principal(1)  # no scope_key, no chat_session_id
    resolved = await ct._resolve_self_tab(db, p, fallback_session_id="sess-9")
    assert resolved is tab


@pytest.mark.asyncio
async def test_resolve_malformed_scope_key_falls_through() -> None:
    """``tab:not-a-uuid`` must not raise — it falls to the session path."""
    tab = _tab(1, session_id="sess-1")
    db = _FakeDB(rows=[tab])
    p = _principal(1, scope_key="tab:not-a-uuid", chat_session_id="sess-1")
    resolved = await ct._resolve_self_tab(db, p, fallback_session_id=None)
    assert resolved is tab


@pytest.mark.asyncio
async def test_resolve_unresolvable_is_404() -> None:
    db = _FakeDB()
    p = _principal(1)
    with pytest.raises(HTTPException) as exc:
        await ct._resolve_self_tab(db, p, fallback_session_id=None)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_resolve_not_owner_is_403() -> None:
    tab = _tab(2)  # owned by user 2
    db = _FakeDB(tabs=[tab])
    p = _principal(1, scope_key=f"tab:{tab.id}")
    with pytest.raises(HTTPException) as exc:
        await ct._resolve_self_tab(db, p, fallback_session_id=None)
    assert exc.value.status_code == 403


# ── set_self_tab_identity endpoint ───────────────────────────────────


@pytest.mark.asyncio
async def test_set_identity_partial_write_and_commit() -> None:
    tab = _tab(1)
    db = _FakeDB(tabs=[tab])
    p = _principal(1, scope_key=f"tab:{tab.id}")
    resp = await ct.set_self_tab_identity(
        payload=ct.TabIdentityRequest(icon="wrench", subtitle="refactoring auth"),
        user=p,
        db=db,
    )
    assert tab.icon == "wrench"
    assert tab.subtitle == "refactoring auth"
    assert resp.icon == "wrench"
    assert resp.subtitle == "refactoring auth"
    assert db.committed is True


@pytest.mark.asyncio
async def test_set_identity_icon_only_leaves_subtitle() -> None:
    tab = _tab(1, subtitle="keep me")
    db = _FakeDB(tabs=[tab])
    p = _principal(1, scope_key=f"tab:{tab.id}")
    await ct.set_self_tab_identity(
        payload=ct.TabIdentityRequest(icon="bug"), user=p, db=db
    )
    assert tab.icon == "bug"
    assert tab.subtitle == "keep me"  # untouched (exclude_unset)


@pytest.mark.asyncio
async def test_set_identity_explicit_null_clears() -> None:
    tab = _tab(1, icon="old", subtitle="old sub")
    db = _FakeDB(tabs=[tab])
    p = _principal(1, scope_key=f"tab:{tab.id}")
    await ct.set_self_tab_identity(
        payload=ct.TabIdentityRequest(icon=None, subtitle=None), user=p, db=db
    )
    assert tab.icon is None
    assert tab.subtitle is None


@pytest.mark.asyncio
async def test_set_identity_empty_payload_is_readback_no_commit() -> None:
    tab = _tab(1, icon="sparkles", subtitle="current")
    db = _FakeDB(tabs=[tab])
    p = _principal(1, scope_key=f"tab:{tab.id}")
    resp = await ct.set_self_tab_identity(
        payload=ct.TabIdentityRequest(), user=p, db=db
    )
    assert resp.icon == "sparkles"
    assert resp.subtitle == "current"
    assert db.committed is False  # pure read-back


@pytest.mark.asyncio
async def test_set_identity_owner_scoped() -> None:
    tab = _tab(2)
    db = _FakeDB(tabs=[tab])
    p = _principal(1, scope_key=f"tab:{tab.id}")
    with pytest.raises(HTTPException) as exc:
        await ct.set_self_tab_identity(
            payload=ct.TabIdentityRequest(icon="x"), user=p, db=db
        )
    assert exc.value.status_code == 403


# ── set_self_tab_identity — session mirror (resume parity) ───────────


@pytest.mark.asyncio
async def test_set_identity_mirrors_onto_bound_session() -> None:
    """Identity is mirrored onto the tab's bound ChatSession so it survives the
    tab being closed (closing deletes the ChatTab row). The resume picker reads
    the session copy. Plan ``agent-freeform-tab-identity`` — resume parity."""
    sess = _session("sess-mirror")
    tab = _tab(1, session_id="sess-mirror")
    db = _FakeDB(tabs=[tab], sessions=[sess])
    p = _principal(1, scope_key=f"tab:{tab.id}")
    await ct.set_self_tab_identity(
        payload=ct.TabIdentityRequest(icon="rocket", subtitle="shipping it"),
        user=p,
        db=db,
    )
    assert tab.icon == "rocket" and tab.subtitle == "shipping it"
    assert sess.icon == "rocket" and sess.subtitle == "shipping it"


@pytest.mark.asyncio
async def test_set_identity_mirror_respects_partial_and_clear() -> None:
    """Only the keys present in the payload mirror — icon-only leaves the
    session subtitle untouched; an explicit null clears the session copy too."""
    sess = _session("sess-partial", icon="old", subtitle="keep")
    tab = _tab(1, session_id="sess-partial", icon="old", subtitle="keep")
    db = _FakeDB(tabs=[tab], sessions=[sess])
    p = _principal(1, scope_key=f"tab:{tab.id}")
    await ct.set_self_tab_identity(
        payload=ct.TabIdentityRequest(icon="bug"), user=p, db=db
    )
    assert sess.icon == "bug" and sess.subtitle == "keep"  # subtitle untouched

    await ct.set_self_tab_identity(
        payload=ct.TabIdentityRequest(icon=None), user=p, db=db
    )
    assert sess.icon is None and sess.subtitle == "keep"  # null clears icon only


@pytest.mark.asyncio
async def test_set_identity_unbound_tab_skips_mirror() -> None:
    """A tab with no bound session writes its own identity and simply skips the
    mirror (no crash, no session lookup needed)."""
    tab = _tab(1, session_id=None)
    db = _FakeDB(tabs=[tab])
    p = _principal(1, scope_key=f"tab:{tab.id}")
    resp = await ct.set_self_tab_identity(
        payload=ct.TabIdentityRequest(icon="flask"), user=p, db=db
    )
    assert tab.icon == "flask"
    assert resp.icon == "flask"


# ── maybe_tab_identity_nudge — gating ────────────────────────────────


@pytest.mark.asyncio
async def test_nudge_first_claim_returns_text_and_writes_ledger() -> None:
    row = _builder(1, meta={_h.CLAIM_META_KEY: {"checkpoint_id": "cp1"}})
    db = _FakeDB(rows=[row])
    text = await _h.maybe_tab_identity_nudge(
        db, principal=_principal(1), plan_id="plan-a", anchor="claim"
    )
    assert text and "set_tab_identity" in text
    ledger = row.meta[_h.TAB_IDENTITY_NUDGE_META_KEY]
    assert "claim" in ledger
    # claim sibling key preserved (merge, not clobber)
    assert row.meta[_h.CLAIM_META_KEY]["checkpoint_id"] == "cp1"


@pytest.mark.asyncio
async def test_nudge_second_same_anchor_is_none() -> None:
    row = _builder(1, meta=None)
    db = _FakeDB(rows=[row])
    p = _principal(1)
    first = await _h.maybe_tab_identity_nudge(db, principal=p, plan_id="plan-a", anchor="claim")
    second = await _h.maybe_tab_identity_nudge(db, principal=p, plan_id="plan-a", anchor="claim")
    assert first is not None
    assert second is None  # once per anchor-type


@pytest.mark.asyncio
async def test_nudge_different_anchor_still_fires() -> None:
    row = _builder(1, meta=None)
    db = _FakeDB(rows=[row])
    p = _principal(1)
    await _h.maybe_tab_identity_nudge(db, principal=p, plan_id="plan-a", anchor="claim")
    completion = await _h.maybe_tab_identity_nudge(
        db, principal=p, plan_id="plan-a", anchor="completion"
    )
    assert completion is not None
    assert set(row.meta[_h.TAB_IDENTITY_NUDGE_META_KEY]) == {"claim", "completion"}


@pytest.mark.asyncio
async def test_nudge_global_cap_blocks_new_anchor() -> None:
    """Two ledger entries already → a fresh anchor is capped, not nudged."""
    row = _builder(
        1,
        meta={_h.TAB_IDENTITY_NUDGE_META_KEY: {"x": "t1", "y": "t2"}},
    )
    db = _FakeDB(rows=[row])
    text = await _h.maybe_tab_identity_nudge(
        db, principal=_principal(1), plan_id="plan-a", anchor="claim"
    )
    assert text is None


@pytest.mark.asyncio
async def test_nudge_no_participant_is_noop() -> None:
    db = _FakeDB(rows=[])
    text = await _h.maybe_tab_identity_nudge(
        db, principal=_principal(1), plan_id="plan-a", anchor="claim"
    )
    assert text is None


@pytest.mark.asyncio
async def test_nudge_unknown_anchor_is_none() -> None:
    row = _builder(1, meta=None)
    db = _FakeDB(rows=[row])
    text = await _h.maybe_tab_identity_nudge(
        db, principal=_principal(1), plan_id="plan-a", anchor="bogus"
    )
    assert text is None


@pytest.mark.asyncio
async def test_nudge_auto_claim_anchor_fires_and_ledgers() -> None:
    """The new ``"auto_claim"`` anchor catches plan-bound tabs whose claim was
    opened implicitly by a mutation (plans.update/progress/etc) — the agent
    never sees the explicit-claim nudge otherwise. Plan ``tab-identity-mode``."""
    row = _builder(1, meta=None)
    db = _FakeDB(rows=[row])
    text = await _h.maybe_tab_identity_nudge(
        db, principal=_principal(1), plan_id="plan-a", anchor="auto_claim"
    )
    assert text is not None
    assert "set_tab_identity" in text
    # Ledger entry exists, idempotent on re-fire (same anchor → None).
    assert "auto_claim" in row.meta[_h.TAB_IDENTITY_NUDGE_META_KEY]
    second = await _h.maybe_tab_identity_nudge(
        db, principal=_principal(1), plan_id="plan-a", anchor="auto_claim"
    )
    assert second is None


# ── no-auto-guard — explicit non-goals ───────────────────────────────


@pytest.mark.asyncio
async def test_guard_nudge_never_touches_a_chat_tab() -> None:
    """The nudge path mutates only participant.meta — it has no ChatTab
    parameter and performs no ChatTab write. A tab handed to the fake DB
    is left untouched (its icon stays None)."""
    untouched = _tab(1)
    row = _builder(1, meta=None)
    db = _FakeDB(tabs=[untouched], rows=[row])
    await _h.maybe_tab_identity_nudge(
        db, principal=_principal(1), plan_id="plan-a", anchor="claim"
    )
    assert untouched.icon is None
    assert untouched.subtitle is None


@pytest.mark.asyncio
async def test_guard_resolution_never_copies_plan_or_profile_icon() -> None:
    """Identity resolution + read-back never derive an icon: an unbranded
    tab stays icon=None even though the owner could have a plan/profile
    with an icon. The only way icon is ever set is an explicit agent
    write (covered above)."""
    tab = _tab(1)  # no icon/subtitle
    db = _FakeDB(tabs=[tab])
    p = _principal(1, scope_key=f"tab:{tab.id}")
    resp = await ct.set_self_tab_identity(
        payload=ct.TabIdentityRequest(), user=p, db=db
    )
    assert tab.icon is None and tab.subtitle is None
    assert resp.icon is None and resp.subtitle is None


def test_guard_chat_tab_defaults_have_no_identity() -> None:
    """Model default: a freshly constructed tab carries no agent identity
    (nothing auto-populates it at construction)."""
    fresh = ChatTab(user_id=1, label="x")
    assert fresh.icon is None
    assert fresh.subtitle is None
