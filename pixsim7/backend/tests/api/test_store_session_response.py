"""Tests for _store_session_response — server-side message persistence.

This function is called fire-and-forget after each WS/SSE result delivery
to persist the user+assistant message pair to the ChatSession DB record.
It's the recovery source when the frontend reloads mid-conversation.
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

TEST_SUITE = {
    "id": "store-session-response",
    "label": "Store Session Response",
    "kind": "unit",
    "category": "backend/api",
    "subcategory": "chat",
    "covers": [
        "pixsim7/backend/main/api/v1/meta_contracts.py:_store_session_response",
    ],
    "order": 33,
}

try:
    from pixsim7.backend.main.api.v1.meta_contracts import _store_session_response

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="backend deps not available")


@pytest.fixture(autouse=True)
def _stub_chat_notification():
    """Neutralise the Phase 4a chat-message emit by default.

    In production the notification uses its OWN ``AsyncSessionLocal``; the
    suite's ``_patch_db`` collapses every ``AsyncSessionLocal`` onto one
    shared mock, so without this the notification's commit would pollute the
    message-persistence ``db.commit`` call counts. Source-specific tests
    request this fixture and assert on the returned mock instead.
    """
    with patch(
        "pixsim7.backend.main.api.v1.meta_contracts.chat_store._emit_chat_message_notification",
        new_callable=AsyncMock,
    ) as m:
        yield m


def _make_session(
    session_id: str = "sess-1",
    messages: list | None = None,
    *,
    status: str = "active",
    user_id: int = 7,
    label: str = "Test Session",
    cli_session_id: str | None = None,
):
    # status/user_id/label/cli_session_id are read by the archived-guard
    # (commit f5857102d), the Phase 4a chat-message notification source, and
    # the tab-surface gate — a bare namespace without them makes
    # _store_session_response's broad except swallow an AttributeError and
    # silently no-op.
    return SimpleNamespace(
        id=session_id,
        messages=messages,
        last_used_at=None,
        status=status,
        user_id=user_id,
        label=label,
        cli_session_id=cli_session_id,
    )


def _mock_db(session=None, alias_session=None, has_tab=True):
    """Build a fake AsyncSessionLocal context manager returning a mock DB.

    ``session`` is returned by ``db.get`` (PK lookup).
    ``alias_session`` is returned by ``db.execute(select).scalars().all()``
    (the ``cli_session_id`` fallback). ``None`` for either means "no row".
    ``has_tab`` controls the tab-surface gate query
    (``db.execute(select(ChatTab.id)...).first()``): True means a ChatTab
    references the session so the chat-message ping is allowed to fire.
    """
    db = AsyncMock()
    db.get = AsyncMock(return_value=session)
    db.commit = AsyncMock()

    class _ScalarResult:
        def __init__(self, rows):
            self._rows = rows
        def all(self):
            return self._rows

    class _ExecuteResult:
        def __init__(self, rows, tab_row):
            self._rows = rows
            self._tab_row = tab_row
        def scalars(self):
            return _ScalarResult(self._rows)
        def first(self):
            # Tab-surface probe: a truthy row means "a tab points here".
            return self._tab_row

    rows = [alias_session] if alias_session is not None else []
    tab_row = ("tab-1",) if has_tab else None
    db.execute = AsyncMock(return_value=_ExecuteResult(rows, tab_row))
    return db


def _patch_db(db_mock):
    """Patch AsyncSessionLocal to yield our mock DB."""
    class _FakeSessionCtx:
        async def __aenter__(self):
            return db_mock
        async def __aexit__(self, *args):
            pass

    return patch(
        "pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal",
        _FakeSessionCtx,
    )


# ── Basic persistence ────────────────────────────────────────────


class TestStoreSessionResponse:

    @pytest.mark.asyncio
    async def test_appends_user_and_assistant_messages(self):
        session = _make_session(messages=[])
        db = _mock_db(session)
        with _patch_db(db):
            await _store_session_response("sess-1", "Hello", "Hi there!", duration_ms=150)

        assert len(session.messages) == 2
        assert session.messages[0]["role"] == "user"
        assert session.messages[0]["text"] == "Hello"
        assert session.messages[1]["role"] == "assistant"
        assert session.messages[1]["text"] == "Hi there!"
        assert session.messages[1]["duration_ms"] == 150
        db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_appends_to_existing_messages(self):
        existing = [
            {"role": "user", "text": "First", "timestamp": "2026-04-01T00:00:00"},
            {"role": "assistant", "text": "Reply", "timestamp": "2026-04-01T00:00:01"},
        ]
        session = _make_session(messages=existing)
        db = _mock_db(session)
        with _patch_db(db):
            await _store_session_response("sess-1", "Second", "Another reply")

        assert len(session.messages) == 4
        assert session.messages[2]["role"] == "user"
        assert session.messages[2]["text"] == "Second"
        assert session.messages[3]["role"] == "assistant"
        assert session.messages[3]["text"] == "Another reply"

    @pytest.mark.asyncio
    async def test_handles_none_messages(self):
        """Session with messages=None (freshly created, no messages yet)."""
        session = _make_session(messages=None)
        db = _mock_db(session)
        with _patch_db(db):
            await _store_session_response("sess-1", "Hello", "Hi!")

        assert len(session.messages) == 2

    @pytest.mark.asyncio
    async def test_duration_ms_omitted_when_none(self):
        session = _make_session(messages=[])
        db = _mock_db(session)
        with _patch_db(db):
            await _store_session_response("sess-1", "Hello", "Hi!", duration_ms=None)

        assert "duration_ms" not in session.messages[1]

    @pytest.mark.asyncio
    async def test_updates_last_used_at(self):
        session = _make_session(messages=[])
        db = _mock_db(session)
        with _patch_db(db):
            await _store_session_response("sess-1", "Hello", "Hi!")

        assert session.last_used_at is not None


# ── Deduplication ────────────────────────────────────────────────


class TestDeduplication:

    @pytest.mark.asyncio
    async def test_skips_duplicate_user_message(self):
        """If the last message is already the same user text, don't double-add it."""
        existing = [
            {"role": "user", "text": "Hello", "timestamp": "2026-04-01T00:00:00"},
        ]
        session = _make_session(messages=existing)
        db = _mock_db(session)
        with _patch_db(db):
            await _store_session_response("sess-1", "Hello", "Response")

        # Should NOT add another "Hello" — just the assistant response
        assert len(session.messages) == 2
        assert session.messages[0]["text"] == "Hello"
        assert session.messages[1]["role"] == "assistant"
        assert session.messages[1]["text"] == "Response"

    @pytest.mark.asyncio
    async def test_adds_user_when_different_from_last(self):
        existing = [
            {"role": "user", "text": "First question", "timestamp": "2026-04-01T00:00:00"},
            {"role": "assistant", "text": "First answer", "timestamp": "2026-04-01T00:00:01"},
        ]
        session = _make_session(messages=existing)
        db = _mock_db(session)
        with _patch_db(db):
            await _store_session_response("sess-1", "Second question", "Second answer")

        assert len(session.messages) == 4
        assert session.messages[2]["text"] == "Second question"


    @pytest.mark.asyncio
    async def test_dedupe_reentry_is_idempotent(self):
        """Bridge-side and WS-side persistence can both fire for the same
        reply. The merge dedupes by (role, stripped-text, kind), so a
        re-entry adds no rows. The commit still runs unconditionally —
        re-persisting an identical, idempotent merge is harmless and
        cheaper than a dirty-check (there has never been a no-op skip;
        the merge module is the documented source of truth here)."""
        existing = [
            {"role": "user", "text": "Hello", "timestamp": "2026-04-01T00:00:00"},
            {"role": "assistant", "text": "Hi there!", "timestamp": "2026-04-01T00:00:01"},
        ]
        session = _make_session(messages=existing)
        db = _mock_db(session)
        with _patch_db(db):
            # Same user_message + assistant_response as the existing tail.
            await _store_session_response("sess-1", "Hello", "Hi there!")

        # Tail unchanged, no new entries appended.
        assert len(session.messages) == 2
        assert session.messages[1]["text"] == "Hi there!"
        db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_assistant_dedupe_does_not_block_different_response(self):
        """Same user_message but different assistant_response still appends —
        dedupe is keyed strictly on the assistant text."""
        existing = [
            {"role": "user", "text": "Hello", "timestamp": "2026-04-01T00:00:00"},
            {"role": "assistant", "text": "Hi", "timestamp": "2026-04-01T00:00:01"},
        ]
        session = _make_session(messages=existing)
        db = _mock_db(session)
        with _patch_db(db):
            await _store_session_response("sess-1", "Hello", "Different reply")

        # New assistant turn appended (user dedupes — last text already "Hello"
        # would skip, but the previous tail isn't "Hello", it's "Hi", so the
        # branch taken depends on the user-dedupe key. We only assert the
        # assistant entry made it through.)
        assert any(
            m.get("role") == "assistant" and m.get("text") == "Different reply"
            for m in session.messages
        )

    @pytest.mark.asyncio
    async def test_skips_user_append_when_prompt_empty(self):
        """Handshake-replayed tasks lose the original prompt; passing empty
        string must not append a `{role: user, text: ""}` row."""
        existing = [
            {"role": "user", "text": "First", "timestamp": "2026-04-01T00:00:00"},
        ]
        session = _make_session(messages=existing)
        db = _mock_db(session)
        with _patch_db(db):
            await _store_session_response("sess-1", "", "Reply")

        # Existing user + new assistant only — no empty user row injected.
        assert len(session.messages) == 2
        assert session.messages[0]["text"] == "First"
        assert session.messages[1]["role"] == "assistant"
        assert session.messages[1]["text"] == "Reply"


# ── Cap at 50 ────────────────────────────────────────────────────


class TestMessageCap:

    @pytest.mark.asyncio
    async def test_caps_at_50_messages(self):
        # Realistic monotonic ISO timestamps: the merge sorts by timestamp,
        # so the old fixture's literal "t" sorted *after* the new rows' real
        # ISO stamps and the cap dropped the wrong end.
        existing = [
            {
                "role": "user",
                "text": f"msg-{i}",
                "timestamp": f"2026-04-01T00:{i // 60:02d}:{i % 60:02d}",
            }
            for i in range(49)
        ]
        session = _make_session(messages=existing)
        db = _mock_db(session)
        with _patch_db(db):
            await _store_session_response("sess-1", "new-user", "new-assistant")

        # 49 existing + 1 user + 1 assistant = 51, capped to 50
        assert len(session.messages) == 50
        # Oldest message should be dropped
        assert session.messages[0]["text"] == "msg-1"
        assert session.messages[-1]["text"] == "new-assistant"


# ── Error resilience ─────────────────────────────────────────────


class TestErrorResilience:

    @pytest.mark.asyncio
    async def test_nonexistent_session_is_silent(self):
        """No session found by PK or alias — should not raise."""
        db = _mock_db(session=None, alias_session=None)
        with _patch_db(db):
            await _store_session_response("nonexistent", "Hello", "Hi!")
        # No exception, no commit
        db.commit.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_db_error_is_swallowed(self):
        """DB exceptions should be caught and logged, not raised."""
        db = _mock_db(session=None)
        db.get = AsyncMock(side_effect=RuntimeError("DB down"))
        with _patch_db(db):
            # Should not raise
            await _store_session_response("sess-1", "Hello", "Hi!")

    @pytest.mark.asyncio
    async def test_logs_warning_when_session_missing(self, caplog):
        """When no session row exists by PK or alias, log a warning so the
        silent loss is diagnosable instead of dropped without trace."""
        import logging
        db = _mock_db(session=None, alias_session=None)
        with _patch_db(db), caplog.at_level(logging.WARNING):
            await _store_session_response("missing-id", "Hello", "Hi!")
        # Warning recorded; commit not called
        assert any("store_session_response_session_missing" in r.message for r in caplog.records)
        db.commit.assert_not_awaited()


# ── cli_session_id fallback ─────────────────────────────────────


class TestCliSessionIdFallback:

    @pytest.mark.asyncio
    async def test_falls_back_to_cli_session_id_when_pk_miss(self):
        """PK lookup misses, but a row with matching cli_session_id exists —
        the response should land on that aliased row."""
        alias = _make_session(session_id="real-pk", messages=[])
        db = _mock_db(session=None, alias_session=alias)
        with _patch_db(db):
            await _store_session_response("alias-id", "Hello", "Hi!")

        # Append happened on the aliased session
        assert len(alias.messages) == 2
        assert alias.messages[0]["text"] == "Hello"
        assert alias.messages[1]["text"] == "Hi!"
        db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_pk_match_skips_cli_session_id_lookup(self):
        """When PK lookup hits, the cli_session_id alias fallback should not
        run. ``db.execute`` is still called exactly once — for the
        tab-surface gate probe, not the alias lookup — and the reply lands on
        the PK-matched session."""
        session = _make_session(messages=[])
        db = _mock_db(session=session, alias_session=None)
        with _patch_db(db):
            await _store_session_response("sess-1", "Hello", "Hi!")

        # Only the tab-surface probe runs; no alias fallback query.
        db.execute.assert_called_once()
        assert len(session.messages) == 2


# ── Timestamps ───────────────────────────────────────────────────


class TestTimestamps:

    @pytest.mark.asyncio
    async def test_messages_have_timestamps(self):
        session = _make_session(messages=[])
        db = _mock_db(session)
        with _patch_db(db):
            await _store_session_response("sess-1", "Hello", "Hi!")

        assert "timestamp" in session.messages[0]
        assert "timestamp" in session.messages[1]

    @pytest.mark.asyncio
    async def test_timestamps_are_iso_format(self):
        session = _make_session(messages=[])
        db = _mock_db(session)
        with _patch_db(db):
            await _store_session_response("sess-1", "Hello", "Hi!")

        ts = session.messages[0]["timestamp"]
        # ISO format: contains T separator and has reasonable length
        assert "T" in ts
        assert len(ts) > 10


# ── Phase 4a: chat-message unread source ─────────────────────────
#
# `_store_session_response` is the single server-side convergence point
# for assistant replies, so it's where the per-tab unread ping is sourced
# (notification-system Phase 4a). These assert the *gating* — emit fires
# once per genuinely-new reply and is suppressed on dedupe re-entry,
# archived sessions, and empty replies.


class TestChatMessageNotificationSource:

    @pytest.mark.asyncio
    async def test_emits_on_new_assistant_reply(self, _stub_chat_notification):
        session = _make_session(messages=[], user_id=42, label="My Chat")
        db = _mock_db(session)
        with _patch_db(db):
            await _store_session_response("sess-1", "Hello", "Hi there!")

        _stub_chat_notification.assert_awaited_once()
        kwargs = _stub_chat_notification.await_args.kwargs
        assert kwargs["session_id"] == "sess-1"
        assert kwargs["user_id"] == 42
        assert kwargs["label"] == "My Chat"
        assert kwargs["preview"] == "Hi there!"

    @pytest.mark.asyncio
    async def test_no_emit_on_dedupe_reentry(self, _stub_chat_notification):
        """Bridge-side and WS-side persist both fire for one reply; the
        ping must be sourced once, gated on the same identity as the merge."""
        existing = [
            {"role": "user", "text": "Hello", "timestamp": "2026-04-01T00:00:00"},
            {"role": "assistant", "text": "Hi there!", "timestamp": "2026-04-01T00:00:01"},
        ]
        session = _make_session(messages=existing)
        db = _mock_db(session)
        with _patch_db(db):
            await _store_session_response("sess-1", "Hello", "Hi there!")

        _stub_chat_notification.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_no_emit_for_archived_session(self, _stub_chat_notification):
        session = _make_session(messages=[], status="archived")
        db = _mock_db(session)
        with _patch_db(db):
            await _store_session_response("sess-1", "Hello", "Hi!")

        _stub_chat_notification.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_no_emit_for_blank_assistant_reply(self, _stub_chat_notification):
        session = _make_session(messages=[])
        db = _mock_db(session)
        with _patch_db(db):
            await _store_session_response("sess-1", "Hello", "   ")

        _stub_chat_notification.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_no_emit_when_no_tab_surface(self, _stub_chat_notification):
        """A genuinely-new reply on a session that NO ChatTab references
        (ephemeral probe/CLI/bridge/mcp sessions) must not emit: the
        activity-bar aggregate badge sums all chat_session unread, and with
        no focusable tab the count could never be cleared — the historical
        "stuck at N unread" bug."""
        session = _make_session(messages=[], user_id=42)
        db = _mock_db(session, has_tab=False)
        with _patch_db(db):
            await _store_session_response("sess-1", "Hello", "Hi there!")

        _stub_chat_notification.assert_not_awaited()
        # Reply is still persisted — only the unread ping is suppressed.
        assert len(session.messages) == 2
        db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_emits_when_tab_surface_matches_cli_session_id(
        self, _stub_chat_notification
    ):
        """The tab-surface probe matches on the cli_session_id alias too, so
        an MCP-derived session whose tab is keyed by the alias still pings."""
        session = _make_session(
            messages=[], user_id=42, cli_session_id="cli-abc"
        )
        db = _mock_db(session, has_tab=True)
        with _patch_db(db):
            await _store_session_response("sess-1", "Hello", "Hi there!")

        _stub_chat_notification.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_emit_failure_does_not_break_persistence(self):
        """The emit is best-effort: a notification blow-up must not lose the
        reply we just persisted."""
        session = _make_session(messages=[])
        db = _mock_db(session)
        with _patch_db(db), patch(
            "pixsim7.backend.main.api.v1.meta_contracts.chat_store._emit_chat_message_notification",
            new_callable=AsyncMock,
            side_effect=RuntimeError("notif backend down"),
        ):
            await _store_session_response("sess-1", "Hello", "Hi!")

        # Reply still persisted + committed despite the emit raising.
        assert len(session.messages) == 2
        assert session.messages[1]["text"] == "Hi!"
        db.commit.assert_awaited_once()
