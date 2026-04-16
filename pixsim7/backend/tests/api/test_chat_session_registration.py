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
        status="active",
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
        status="active",
        limit=20,
        include_empty=True,
        user=None,
        db=db,
    )

    assert result == {"sessions": []}
    db.commit.assert_not_awaited()
    db.execute.assert_awaited_once()


def _compiled_sql(stmt) -> str:
    """Render a SQLAlchemy statement to a SQL string for assertion."""
    return str(stmt.compile(compile_kwargs={"literal_binds": True}))


@pytest.mark.asyncio
async def test_list_chat_sessions_applies_message_count_filter_by_default():
    """Regression: MCP-registered sessions have message_count=0 until a real
    chat turn bumps them. The default list filter must exclude them so the
    frontend list matches the 'real conversations only' semantic.
    """
    captured = []

    class _RecordingDB:
        async def execute(self, stmt):
            captured.append(stmt)
            # Prune path emits an UPDATE first; SELECT comes last.
            if stmt.__visit_name__ == "update":
                return SimpleNamespace(rowcount=0)
            return _ScalarResult([])

        async def commit(self):
            return None

    await list_chat_sessions(
        engine="claude",
        status="active",
        limit=20,
        include_empty=False,
        user=None,
        db=_RecordingDB(),
    )

    select_stmts = [s for s in captured if s.__visit_name__ == "select"]
    assert len(select_stmts) == 1
    select_sql = _compiled_sql(select_stmts[0])
    assert "message_count > 0" in select_sql, select_sql


@pytest.mark.asyncio
async def test_list_chat_sessions_include_empty_omits_message_count_filter():
    """Counterpart: include_empty=True must return zero-count sessions so
    MCP-auto-registered sessions are retrievable when explicitly requested.
    """
    captured = []

    class _RecordingDB:
        async def execute(self, stmt):
            captured.append(stmt)
            return _ScalarResult([])

        async def commit(self):
            return None

    await list_chat_sessions(
        engine="claude",
        status="active",
        limit=20,
        include_empty=True,
        user=None,
        db=_RecordingDB(),
    )

    select_stmts = [s for s in captured if s.__visit_name__ == "select"]
    assert len(select_stmts) == 1
    select_sql = _compiled_sql(select_stmts[0])
    assert "message_count > 0" not in select_sql, select_sql


@pytest.mark.asyncio
async def test_register_chat_session_falls_back_to_user_id_when_only_id_present(monkeypatch):
    """Regression: older principal shapes only expose `id`, not `user_id`.
    The attribution path must fall back or the session is silently filed under
    user_id=0 (shared) and vanishes from the owning user's list.
    """
    payload = RegisterSessionRequest(
        session_id="id-only-sess",
        engine="claude",
        label="x",
        profile_id="assistant:claude",
        source="mcp",
    )
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)

    upsert_kwargs = {}

    async def mock_upsert(**kwargs):
        upsert_kwargs.update(kwargs)

    async def mock_resolve_agent_profile(*_args, **_kwargs):
        return SimpleNamespace(id="assistant:claude")

    monkeypatch.setattr(
        "pixsim7.backend.main.api.v1.meta_contracts._upsert_chat_session",
        mock_upsert,
    )
    monkeypatch.setattr(
        "pixsim7.backend.main.api.v1.agent_profiles.resolve_agent_profile",
        mock_resolve_agent_profile,
    )

    # Principal with `id` only — no `user_id` attribute at all.
    user = SimpleNamespace(id=7, agent_type="claude")
    await register_chat_session(payload, _user=user, db=db)

    assert upsert_kwargs["user_id"] == 7, (
        "principal.id must be used when principal.user_id is absent — "
        "otherwise sessions get filed under shared user_id=0"
    )


@pytest.mark.asyncio
async def test_register_chat_session_anon_user_attributed_to_zero(monkeypatch):
    """No auth header → shared session under user_id=0. Documents the anon path
    so a future change that raises on anon doesn't go unnoticed.
    """
    payload = RegisterSessionRequest(
        session_id="anon-sess",
        engine="claude",
        label="x",
        profile_id="assistant:claude",
        source="mcp",
    )
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)

    upsert_kwargs = {}

    async def mock_upsert(**kwargs):
        upsert_kwargs.update(kwargs)

    async def mock_resolve_agent_profile(*_args, **_kwargs):
        return SimpleNamespace(id="assistant:claude")

    monkeypatch.setattr(
        "pixsim7.backend.main.api.v1.meta_contracts._upsert_chat_session",
        mock_upsert,
    )
    monkeypatch.setattr(
        "pixsim7.backend.main.api.v1.agent_profiles.resolve_agent_profile",
        mock_resolve_agent_profile,
    )

    await register_chat_session(payload, _user=None, db=db)

    assert upsert_kwargs["user_id"] == 0


@pytest.mark.asyncio
async def test_register_chat_session_does_not_increment_message_count(monkeypatch):
    """Regression: log_work re-registers the session on every summary. The
    upsert must NOT bump message_count — that counter is reserved for real
    user↔agent message turns (see _upsert_chat_session docstring).
    """
    payload = RegisterSessionRequest(
        session_id="existing-sess",
        engine="claude",
        label="updated via log_work",
        profile_id="assistant:claude",
        source="mcp",
    )
    existing = SimpleNamespace(id="existing-sess", profile_id="assistant:claude", last_used_at=None)
    db = AsyncMock()
    db.get = AsyncMock(return_value=existing)

    upsert_kwargs = {}

    async def mock_upsert(**kwargs):
        upsert_kwargs.update(kwargs)

    monkeypatch.setattr(
        "pixsim7.backend.main.api.v1.meta_contracts._upsert_chat_session",
        mock_upsert,
    )

    await register_chat_session(payload, _user=None, db=db)

    # Default for increment_messages is False; the endpoint must never pass True.
    assert upsert_kwargs.get("increment_messages") is not True
