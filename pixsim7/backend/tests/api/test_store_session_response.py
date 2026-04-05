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


def _make_session(session_id: str = "sess-1", messages: list | None = None):
    return SimpleNamespace(
        id=session_id,
        messages=messages,
        last_used_at=None,
    )


def _mock_db(session=None):
    """Build a fake AsyncSessionLocal context manager returning a mock DB."""
    db = AsyncMock()
    db.get = AsyncMock(return_value=session)
    db.commit = AsyncMock()
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


# ── Cap at 50 ────────────────────────────────────────────────────


class TestMessageCap:

    @pytest.mark.asyncio
    async def test_caps_at_50_messages(self):
        existing = [{"role": "user", "text": f"msg-{i}", "timestamp": "t"} for i in range(49)]
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
        """No session found — should not raise."""
        db = _mock_db(session=None)
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
