"""Tests for chat-session registration behavior."""
from __future__ import annotations

TEST_SUITE = {
    "id": "chat-session-registration",
    "label": "Chat Session Registration",
    "kind": "unit",
    "category": "backend/api",
    "subcategory": "assistant-chat",
    "covers": [
        "pixsim7/backend/main/api/v1/meta_contracts.py",
    ],
    "order": 34,
}

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

try:
    from pixsim7.backend.main.api.v1.meta_contracts import (
        RegisterSessionRequest,
        list_chat_sessions,
        register_chat_session,
    )

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="backend deps not available")


class _ScalarResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return self

    def all(self):
        return self._values


@pytest.mark.asyncio
async def test_register_chat_session_creates_new_session(monkeypatch):
    payload = RegisterSessionRequest(
        session_id="test-session",
        engine="claude",
        label="CLI session (test)",
        profile_id="profile-1",
        source="mcp",
    )
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)

    # _upsert_chat_session creates its own DB session — mock it out
    upsert_called = {}
    async def mock_upsert(**kwargs):
        upsert_called.update(kwargs)
    monkeypatch.setattr(
        "pixsim7.backend.main.api.v1.meta_contracts._upsert_chat_session",
        mock_upsert,
    )

    result = await register_chat_session(payload, _user=None, db=db)

    assert result["ok"] is True
    assert result["created"] is True
    assert result["session_id"] == "test-session"
    assert upsert_called["session_id"] == "test-session"
    assert upsert_called["profile_id"] == "profile-1"


@pytest.mark.asyncio
async def test_register_chat_session_updates_existing_session(monkeypatch):
    existing = SimpleNamespace(
        id="existing-session",
        profile_id=None,
        last_used_at=None,
    )
    payload = RegisterSessionRequest(
        session_id="existing-session",
        engine="claude",
        label="CLI session (existing)",
        profile_id="profile-1",
        source="mcp",
    )
    db = AsyncMock()
    db.get = AsyncMock(return_value=existing)

    upsert_called = {}
    async def mock_upsert(**kwargs):
        upsert_called.update(kwargs)
    monkeypatch.setattr(
        "pixsim7.backend.main.api.v1.meta_contracts._upsert_chat_session",
        mock_upsert,
    )

    result = await register_chat_session(payload, _user=None, db=db)

    assert result["ok"] is True
    assert result["created"] is False
    assert result["session_id"] == "existing-session"
    assert upsert_called["profile_id"] == "profile-1"


@pytest.mark.asyncio
async def test_list_chat_sessions_prunes_empty_placeholders_by_default():
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[SimpleNamespace(rowcount=3), _ScalarResult([])])

    result = await list_chat_sessions(
        engine="claude",
        limit=20,
        include_empty=False,
        user=None,
        db=db,
    )

    assert result == {"sessions": []}
    assert db.execute.await_count == 2  # prune update + list select
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_list_chat_sessions_include_empty_skips_prune():
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_ScalarResult([]))

    result = await list_chat_sessions(
        engine="claude",
        limit=20,
        include_empty=True,
        user=None,
        db=db,
    )

    assert result == {"sessions": []}
    db.commit.assert_not_awaited()
    db.execute.assert_awaited_once()
