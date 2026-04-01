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
        generate_cli_token,
        list_chat_sessions,
        register_chat_session,
    )
    from pixsim7.backend.main.shared.auth import decode_access_token

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
async def test_register_chat_session_resolves_default_profile_for_generic_cli_id(monkeypatch):
    payload = RegisterSessionRequest(
        session_id="cli-session",
        engine="codex",
        label="CLI session (codex)",
        profile_id="cli-a1b2c3d4",
        source="mcp-auto",
    )
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)

    upsert_called = {}

    async def mock_upsert(**kwargs):
        upsert_called.update(kwargs)

    async def mock_resolve_agent_profile(db_session, user_id, profile_id, agent_type=None):
        assert db_session is db
        assert user_id == 7
        assert profile_id is None
        assert agent_type == "codex"
        return SimpleNamespace(id="assistant:codex")

    monkeypatch.setattr(
        "pixsim7.backend.main.api.v1.meta_contracts._upsert_chat_session",
        mock_upsert,
    )
    monkeypatch.setattr(
        "pixsim7.backend.main.api.v1.agent_profiles.resolve_agent_profile",
        mock_resolve_agent_profile,
    )

    user = SimpleNamespace(user_id=7, agent_type="codex")
    result = await register_chat_session(payload, _user=user, db=db)

    assert result["ok"] is True
    assert result["created"] is True
    assert upsert_called["profile_id"] == "assistant:codex"


@pytest.mark.asyncio
async def test_register_chat_session_resolves_default_profile_when_missing(monkeypatch):
    payload = RegisterSessionRequest(
        session_id="missing-profile-session",
        engine="claude",
        label="CLI session (claude)",
        profile_id=None,
        source="mcp-auto",
    )
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)

    upsert_called = {}

    async def mock_upsert(**kwargs):
        upsert_called.update(kwargs)

    async def mock_resolve_agent_profile(_db_session, _user_id, _profile_id, agent_type=None):
        assert agent_type == "claude"
        return SimpleNamespace(id="assistant:claude")

    monkeypatch.setattr(
        "pixsim7.backend.main.api.v1.meta_contracts._upsert_chat_session",
        mock_upsert,
    )
    monkeypatch.setattr(
        "pixsim7.backend.main.api.v1.agent_profiles.resolve_agent_profile",
        mock_resolve_agent_profile,
    )

    result = await register_chat_session(payload, _user=SimpleNamespace(user_id=1, agent_type="cli"), db=db)

    assert result["ok"] is True
    assert upsert_called["profile_id"] == "assistant:claude"


@pytest.mark.asyncio
async def test_register_chat_session_resolves_default_profile_when_unknown(monkeypatch):
    payload = RegisterSessionRequest(
        session_id="unknown-profile-session",
        engine="codex",
        label="CLI session (codex)",
        profile_id="unknown",
        source="mcp-auto",
    )
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)

    upsert_called = {}

    async def mock_upsert(**kwargs):
        upsert_called.update(kwargs)

    async def mock_resolve_agent_profile(_db_session, _user_id, _profile_id, agent_type=None):
        assert agent_type == "codex"
        return SimpleNamespace(id="assistant:codex")

    monkeypatch.setattr(
        "pixsim7.backend.main.api.v1.meta_contracts._upsert_chat_session",
        mock_upsert,
    )
    monkeypatch.setattr(
        "pixsim7.backend.main.api.v1.agent_profiles.resolve_agent_profile",
        mock_resolve_agent_profile,
    )

    result = await register_chat_session(payload, _user=SimpleNamespace(user_id=1, agent_type="codex"), db=db)

    assert result["ok"] is True
    assert upsert_called["profile_id"] == "assistant:codex"


@pytest.mark.asyncio
async def test_register_chat_session_keeps_explicit_profile_without_fallback(monkeypatch):
    payload = RegisterSessionRequest(
        session_id="explicit-profile-session",
        engine="claude",
        label="CLI session (explicit)",
        profile_id="assistant:creative",
        source="mcp-auto",
    )
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)

    upsert_called = {}

    async def mock_upsert(**kwargs):
        upsert_called.update(kwargs)

    async def should_not_be_called(*_args, **_kwargs):
        raise AssertionError("resolve_agent_profile should not run for explicit profile IDs")

    monkeypatch.setattr(
        "pixsim7.backend.main.api.v1.meta_contracts._upsert_chat_session",
        mock_upsert,
    )
    monkeypatch.setattr(
        "pixsim7.backend.main.api.v1.agent_profiles.resolve_agent_profile",
        should_not_be_called,
    )

    result = await register_chat_session(payload, _user=SimpleNamespace(user_id=1, agent_type="claude"), db=db)

    assert result["ok"] is True
    assert upsert_called["profile_id"] == "assistant:creative"


@pytest.mark.asyncio
async def test_generate_cli_token_prefers_provider_default_profile(monkeypatch):
    db = AsyncMock()
    db.add = lambda _obj: None
    db.commit = AsyncMock()

    async def mock_resolve_agent_profile(db_session, user_id, profile_id, agent_type=None):
        assert db_session is db
        assert user_id == 1
        assert profile_id is None
        assert agent_type == "codex"
        return SimpleNamespace(id="assistant:codex")

    monkeypatch.setattr(
        "pixsim7.backend.main.api.v1.agent_profiles.resolve_agent_profile",
        mock_resolve_agent_profile,
    )

    response = await generate_cli_token(
        user=SimpleNamespace(user_id=1),
        db=db,
        scope="dev",
        hours=24,
        agent_type="codex",
    )
    claims = decode_access_token(response.token)

    assert response.agent_id == "assistant:codex"
    assert " codex" in response.command
    assert claims.get("profile_id") == "assistant:codex"
    assert claims.get("agent_type") == "codex"


@pytest.mark.asyncio
async def test_generate_cli_token_falls_back_to_generated_cli_profile(monkeypatch):
    db = AsyncMock()
    db.add = lambda _obj: None
    db.commit = AsyncMock()

    async def mock_resolve_agent_profile(_db_session, _user_id, _profile_id, agent_type=None):
        assert agent_type == "claude"
        return None

    monkeypatch.setattr(
        "pixsim7.backend.main.api.v1.agent_profiles.resolve_agent_profile",
        mock_resolve_agent_profile,
    )

    response = await generate_cli_token(
        user=SimpleNamespace(user_id=1),
        db=db,
        scope="dev",
        hours=24,
        agent_type="claude",
    )
    claims = decode_access_token(response.token)

    assert isinstance(response.agent_id, str)
    assert response.agent_id.startswith("cli-")
    assert "claude --mcp-config" in response.command
    assert claims.get("profile_id", "").startswith("cli-")
    assert claims.get("agent_type") == "claude"


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
