"""Tests for WebSocket chat endpoint (/ws/chat)."""
from __future__ import annotations

TEST_SUITE = {
    "id": "ws-chat",
    "label": "WebSocket Chat",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "websocket",
    "covers": [
        "pixsim7/backend/main/api/v1/ws_chat.py",
    ],
    "order": 33,
}

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

try:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from pixsim7.backend.main.api.v1.ws_chat import (
        router,
        _recover_session_tail_response,
    )
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import RemoteAgent

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="backend deps not available")

# All patches needed for unauthenticated debug access
_RESOLVE_USER = "pixsim7.backend.main.api.v1.ws_chat._resolve_user_id"
_RESOLVE_TOKEN = "pixsim7.backend.main.api.v1.ws_chat._resolve_raw_token"
_SETTINGS_DEBUG = "pixsim7.backend.main.shared.config.settings.debug"
_BRIDGE = "pixsim7.backend.main.services.llm.remote_cmd_bridge.remote_cmd_bridge"


# ── Helpers ──────────────────────────────────────────────────────

def _app():
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    return app


def _make_agent(bridge_client_id: str = "test-agent") -> RemoteAgent:
    ws = AsyncMock()
    return RemoteAgent(
        bridge_client_id=bridge_client_id,
        websocket=ws,
        agent_type="claude-cli",
    )


def _debug_patches(user_id=None, token=None):
    """Return a list of patch context managers for debug mode."""
    return [
        patch(_RESOLVE_USER, AsyncMock(return_value=user_id)),
        patch(_RESOLVE_TOKEN, AsyncMock(return_value=token)),
        patch(_SETTINGS_DEBUG, True),
    ]


def _auth_patches(user_id=42, token="tok"):
    """Return patches for authenticated non-debug mode."""
    return [
        patch(_RESOLVE_USER, AsyncMock(return_value=user_id)),
        patch(_RESOLVE_TOKEN, AsyncMock(return_value=token)),
        patch(_SETTINGS_DEBUG, False),
    ]


# ── Connection & Keep-alive ──────────────────────────────────────

class TestWsChatConnection:
    """Basic WebSocket chat connection and keep-alive."""

    def test_connect_sends_welcome(self):
        app = _app()
        client = TestClient(app)
        with _debug_patches()[0], _debug_patches()[1], _debug_patches()[2]:
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                data = json.loads(ws.receive_text())
                assert data["type"] == "connected"
                assert "user_id" in data

    def test_ping_pong(self):
        app = _app()
        client = TestClient(app)
        with _debug_patches()[0], _debug_patches()[1], _debug_patches()[2]:
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text("ping")
                assert ws.receive_text() == "pong"

    def test_multiple_pings(self):
        app = _app()
        client = TestClient(app)
        with _debug_patches()[0], _debug_patches()[1], _debug_patches()[2]:
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                for _ in range(3):
                    ws.send_text("ping")
                    assert ws.receive_text() == "pong"

    def test_invalid_json_ignored(self):
        app = _app()
        client = TestClient(app)
        with _debug_patches()[0], _debug_patches()[1], _debug_patches()[2]:
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text("not json")
                ws.send_text("ping")
                assert ws.receive_text() == "pong"


# ── Message dispatch ─────────────────────────────────────────────

class TestWsChatMessage:
    """Message dispatch via WS chat."""

    def test_empty_message_returns_error(self):
        app = _app()
        client = TestClient(app)
        patches = _debug_patches(user_id=1, token="tok")
        with patches[0], patches[1], patches[2]:
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "message", "tab_id": "t1", "message": "",
                }))
                data = json.loads(ws.receive_text())
                assert data["type"] == "error"
                assert data["tab_id"] == "t1"
                assert data["error_code"] == "empty_message"

    def test_no_bridge_returns_error(self):
        app = _app()
        client = TestClient(app)
        mock_bridge = MagicMock()
        mock_bridge.connected_count = 0
        patches = _debug_patches(user_id=1, token="tok")
        with patches[0], patches[1], patches[2], patch(_BRIDGE, mock_bridge):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "message", "tab_id": "t1", "message": "hello",
                }))
                data = json.loads(ws.receive_text())
                assert data["type"] == "result"
                assert data["ok"] is False
                assert "No bridge" in data["error"]
                assert data["error_code"] == "bridge_offline"

    def test_no_agents_returns_error(self):
        app = _app()
        client = TestClient(app)
        mock_bridge = MagicMock()
        mock_bridge.connected_count = 1
        mock_bridge.get_available_agent.return_value = None
        mock_bridge.get_agents.return_value = []
        patches = _debug_patches(user_id=1, token="tok")
        with patches[0], patches[1], patches[2], patch(_BRIDGE, mock_bridge):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "message", "tab_id": "t1", "message": "hello",
                }))
                data = json.loads(ws.receive_text())
                assert data["type"] == "result"
                assert data["ok"] is False
                assert "No bridge available" in data["error"]
                assert "pixsim-cli" in data["error"]  # actionable recovery hint
                assert data["error_code"] == "bridge_unavailable"

    def test_engine_mismatch_returns_structured_error(self):
        """Codex tab dispatched while only Claude bridge is connected
        must return a precise `bridge_engine_unavailable` error instead
        of silently running on Claude and mislabelling the row."""
        app = _app()
        client = TestClient(app)
        claude_agent = _make_agent()
        claude_agent.agent_type = "claude-cli"
        mock_bridge = MagicMock()
        mock_bridge.connected_count = 1

        # Mirror the real bridge filter: engine-specific lookup misses,
        # but a generic lookup still returns the Claude agent so the
        # handler can name what's actually connected.
        from pixsim7.backend.main.services.llm.remote_cmd_bridge import normalize_engine

        def _get_available(*, user_id=None, agent_type=None):
            if agent_type and normalize_engine(agent_type) == "codex":
                return None
            return claude_agent

        mock_bridge.get_available_agent.side_effect = _get_available

        patches = _debug_patches(user_id=1, token="tok")
        with patches[0], patches[1], patches[2], patch(_BRIDGE, mock_bridge):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "message", "tab_id": "t1", "message": "hello",
                    "engine": "codex",
                }))
                data = json.loads(ws.receive_text())
                assert data["type"] == "result"
                assert data["ok"] is False
                assert data["error_code"] == "bridge_engine_unavailable"
                assert "codex" in data["error"]
                assert "claude" in data["error"]  # diagnostic names what IS connected
                # Remediation hint must point the user at a concrete recovery
                # path; without it the diagnostic is correct but unactionable.
                assert "Restart" in data["error"]

    def test_persisted_engine_uses_agent_type_not_request(self):
        """When the request says `engine='claude'` but the agent is
        actually `claude-cli`, the persisted ChatSession.engine should
        be the normalized `claude` (from agent_type), not the raw
        request value. Same row no matter where the value came from."""
        app = _app()
        client = TestClient(app)
        agent = _make_agent()
        agent.agent_type = "claude-cli"
        mock_bridge = MagicMock()
        mock_bridge.connected_count = 1
        mock_bridge.get_available_agent.return_value = agent

        async def fake_stream(*args, **kwargs):
            yield {
                "type": "result", "ok": True,
                "response": "Hello!",
                "bridge_session_id": "sess-engine-check",
            }

        mock_bridge.dispatch_task_streaming = fake_stream
        patches = _debug_patches(user_id=7, token="tok")
        mock_db = MagicMock()
        mock_db_session = MagicMock()
        mock_db_session.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db_session.__aexit__ = AsyncMock(return_value=None)
        mock_upsert = AsyncMock()
        mock_resolve_profile = AsyncMock(return_value=None)

        with patches[0], patches[1], patches[2], \
             patch(_BRIDGE, mock_bridge), \
             patch("pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal", return_value=mock_db_session), \
             patch("pixsim7.backend.main.api.v1.agent_profiles.resolve_agent_profile", mock_resolve_profile), \
             patch("pixsim7.backend.main.api.v1.meta_contracts._upsert_chat_session", mock_upsert):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "message", "tab_id": "t1", "message": "hello",
                    "engine": "claude",
                }))
                json.loads(ws.receive_text())  # result

        assert mock_upsert.call_count == 1
        # Persisted as the normalized form, not "claude-cli" or any oddity.
        assert mock_upsert.call_args.kwargs["engine"] == "claude"

    def test_missing_engine_field_falls_back_to_agent_type(self):
        """A WS payload that forgets to include `engine` no longer silently
        defaults to "claude" — instead the agent's actual type wins."""
        app = _app()
        client = TestClient(app)
        agent = _make_agent()
        agent.agent_type = "codex-cli"
        mock_bridge = MagicMock()
        mock_bridge.connected_count = 1
        mock_bridge.get_available_agent.return_value = agent

        async def fake_stream(*args, **kwargs):
            yield {
                "type": "result", "ok": True,
                "response": "ok",
                "bridge_session_id": "sess-default",
            }

        mock_bridge.dispatch_task_streaming = fake_stream
        patches = _debug_patches(user_id=7, token="tok")
        mock_db = MagicMock()
        mock_db_session = MagicMock()
        mock_db_session.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db_session.__aexit__ = AsyncMock(return_value=None)
        mock_upsert = AsyncMock()
        mock_resolve_profile = AsyncMock(return_value=None)

        with patches[0], patches[1], patches[2], \
             patch(_BRIDGE, mock_bridge), \
             patch("pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal", return_value=mock_db_session), \
             patch("pixsim7.backend.main.api.v1.agent_profiles.resolve_agent_profile", mock_resolve_profile), \
             patch("pixsim7.backend.main.api.v1.meta_contracts._upsert_chat_session", mock_upsert):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "message", "tab_id": "t1", "message": "hello",
                    # NB: no `engine` field — pre-fix this would default to claude
                }))
                json.loads(ws.receive_text())

        assert mock_upsert.call_count == 1
        assert mock_upsert.call_args.kwargs["engine"] == "codex"

    def test_dispatch_error_propagates_structured_code(self):
        app = _app()
        client = TestClient(app)
        agent = _make_agent()
        mock_bridge = MagicMock()
        mock_bridge.connected_count = 1
        mock_bridge.get_available_agent.return_value = agent

        class _ScopedBusy(RuntimeError):
            def __init__(self):
                super().__init__("Scoped session 'tab:t1' is busy")
                self.code = "scoped_session_busy"
                self.details = {"scope_key": "tab:t1", "busy_for_s": 5}

        async def fake_stream(*args, **kwargs):
            if False:
                yield {}
            raise _ScopedBusy()

        mock_bridge.dispatch_task_streaming = fake_stream
        patches = _debug_patches(user_id=1, token="tok")
        mock_db_session = MagicMock()
        mock_db_session.__aenter__ = AsyncMock(return_value=MagicMock())
        mock_db_session.__aexit__ = AsyncMock(return_value=None)
        with patches[0], patches[1], patches[2], \
             patch(_BRIDGE, mock_bridge), \
             patch("pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal", return_value=mock_db_session):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "message", "tab_id": "t1", "message": "hello",
                }))
                data = json.loads(ws.receive_text())
                assert data["type"] == "result"
                assert data["ok"] is False
                assert data["error_code"] == "scoped_session_busy"
                assert data["error_details"]["scope_key"] == "tab:t1"

    def test_successful_dispatch_streams_result(self):
        app = _app()
        client = TestClient(app)
        agent = _make_agent()
        mock_bridge = MagicMock()
        mock_bridge.connected_count = 1
        mock_bridge.get_available_agent.return_value = agent

        async def fake_stream(*args, **kwargs):
            yield {"type": "heartbeat", "action": "thinking", "detail": "Working on it"}
            yield {
                "type": "result", "ok": True,
                "response": "Hello back!",
                "bridge_session_id": "sess-123",
            }

        mock_bridge.dispatch_task_streaming = fake_stream
        patches = _debug_patches(user_id=1, token="tok")
        # Patch DB session factory to avoid real DB access during profile resolution
        mock_db_session = MagicMock()
        mock_db_session.__aenter__ = AsyncMock(return_value=MagicMock())
        mock_db_session.__aexit__ = AsyncMock(return_value=None)
        with patches[0], patches[1], patches[2], \
             patch(_BRIDGE, mock_bridge), \
             patch("pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal", return_value=mock_db_session):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "message", "tab_id": "t1", "message": "hello",
                }))
                hb = json.loads(ws.receive_text())
                assert hb["type"] == "heartbeat"
                assert hb["tab_id"] == "t1"

                result = json.loads(ws.receive_text())
                assert result["type"] == "result"
                assert result["tab_id"] == "t1"
                assert result["ok"] is True
                assert result["response"] == "Hello back!"
                assert result["bridge_session_id"] == "sess-123"
                assert "duration_ms" in result

    def test_interrupted_turn_still_persists_and_binds(self):
        """Plan `chat-session-durable-resume` CP-A: a turn that surfaces its
        cli_session_id via heartbeat but never produces a `result` (bridge/MCP
        drop, timeout) must STILL create a resumable ChatSession, bind the
        tab, and persist the user turn. Pre-fix all three were gated on the
        result event, so an interrupted turn left zero server-side trace."""
        app = _app()
        client = TestClient(app)
        agent = _make_agent()
        mock_bridge = MagicMock()
        mock_bridge.connected_count = 1
        mock_bridge.get_available_agent.return_value = agent

        async def fake_stream(*args, **kwargs):
            # session_resolved surfaces the id on a heartbeat — then the
            # bridge dies: NO result event ever follows.
            yield {
                "type": "heartbeat", "action": "session_resolved",
                "detail": "", "bridge_session_id": "conv-interrupted",
            }

        mock_bridge.dispatch_task_streaming = fake_stream
        patches = _debug_patches(user_id=9, token="tok")
        mock_db_session = MagicMock()
        mock_db_session.__aenter__ = AsyncMock(return_value=MagicMock())
        mock_db_session.__aexit__ = AsyncMock(return_value=None)
        mock_upsert = AsyncMock()
        mock_bind = AsyncMock()
        mock_pending = AsyncMock()

        with patches[0], patches[1], patches[2], \
             patch(_BRIDGE, mock_bridge), \
             patch("pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal", return_value=mock_db_session), \
             patch("pixsim7.backend.main.api.v1.meta_contracts._upsert_chat_session", mock_upsert), \
             patch("pixsim7.backend.main.api.v1.meta_contracts._store_pending_user_message", mock_pending), \
             patch("pixsim7.backend.main.api.v1.ws_chat._bind_tab_to_session", mock_bind):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "message", "tab_id": "t-int", "message": "durable fix please",
                }))
                hb = json.loads(ws.receive_text())
                assert hb["type"] == "heartbeat"

        assert mock_upsert.call_count == 1
        kw = mock_upsert.call_args.kwargs
        assert kw["session_id"] == "conv-interrupted"
        assert kw["cli_session_id"] == "conv-interrupted"
        # The result path owns the count bump; early-bind must not double it.
        assert kw["increment_messages"] is False
        mock_bind.assert_awaited_once_with("t-int", "conv-interrupted", 9)
        mock_pending.assert_awaited_once()
        assert mock_pending.call_args.kwargs["session_id"] == "conv-interrupted"

    def test_early_bind_then_result_is_idempotent(self):
        """Happy path regression: heartbeat early-bind + the result path both
        upsert the same session. Early-bind must NOT increment (no
        double-count); the result upsert is the one that bumps the count."""
        app = _app()
        client = TestClient(app)
        agent = _make_agent()
        mock_bridge = MagicMock()
        mock_bridge.connected_count = 1
        mock_bridge.get_available_agent.return_value = agent

        async def fake_stream(*args, **kwargs):
            yield {
                "type": "heartbeat", "action": "session_resolved",
                "detail": "", "bridge_session_id": "conv-ok",
            }
            yield {
                "type": "result", "ok": True,
                "response": "done", "bridge_session_id": "conv-ok",
            }

        mock_bridge.dispatch_task_streaming = fake_stream
        patches = _debug_patches(user_id=9, token="tok")
        mock_db_session = MagicMock()
        mock_db_session.__aenter__ = AsyncMock(return_value=MagicMock())
        mock_db_session.__aexit__ = AsyncMock(return_value=None)
        mock_upsert = AsyncMock()
        mock_bind = AsyncMock()
        mock_pending = AsyncMock()
        mock_store = AsyncMock()

        with patches[0], patches[1], patches[2], \
             patch(_BRIDGE, mock_bridge), \
             patch("pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal", return_value=mock_db_session), \
             patch("pixsim7.backend.main.api.v1.meta_contracts._upsert_chat_session", mock_upsert), \
             patch("pixsim7.backend.main.api.v1.meta_contracts._store_pending_user_message", mock_pending), \
             patch("pixsim7.backend.main.api.v1.meta_contracts._store_session_response", mock_store), \
             patch("pixsim7.backend.main.api.v1.ws_chat._bind_tab_to_session", mock_bind):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "message", "tab_id": "t-ok", "message": "hello",
                }))
                json.loads(ws.receive_text())  # heartbeat
                result = json.loads(ws.receive_text())
                assert result["type"] == "result"
                assert result["ok"] is True

        # Two upserts, same session, exactly one of which increments.
        assert mock_upsert.call_count == 2
        sessions = {c.kwargs["session_id"] for c in mock_upsert.call_args_list}
        assert sessions == {"conv-ok"}
        increments = [c.kwargs.get("increment_messages") for c in mock_upsert.call_args_list]
        assert increments.count(True) == 1
        assert increments.count(False) == 1
        # cli_session_id populated on both for the CP-B resume lookup.
        assert all(c.kwargs.get("cli_session_id") == "conv-ok" for c in mock_upsert.call_args_list)

    def test_resume_failure_forwarded_and_tab_rebound(self):
        """Plan `chat-session-durable-resume` CP-C/CP-D: a `resume_failed`
        verdict on a heartbeat must be forwarded to the panel AND trigger the
        server-side tab rebind (off the dead conversation, onto the fresh
        one) — never silently dropped."""
        app = _app()
        client = TestClient(app)
        agent = _make_agent()
        mock_bridge = MagicMock()
        mock_bridge.connected_count = 1
        mock_bridge.get_available_agent.return_value = agent

        rf = {"requested": "old-conv", "actual": "fresh-conv"}

        async def fake_stream(*args, **kwargs):
            yield {
                "type": "heartbeat", "action": "resume_failed",
                "detail": "", "bridge_session_id": "fresh-conv",
                "resume_failed": rf,
            }
            yield {
                "type": "result", "ok": True, "response": "hi",
                "bridge_session_id": "fresh-conv", "resume_failed": rf,
            }

        mock_bridge.dispatch_task_streaming = fake_stream
        patches = _debug_patches(user_id=9, token="tok")
        mock_db_session = MagicMock()
        mock_db_session.__aenter__ = AsyncMock(return_value=MagicMock())
        mock_db_session.__aexit__ = AsyncMock(return_value=None)
        mock_upsert = AsyncMock()
        mock_bind = AsyncMock()
        mock_pending = AsyncMock()
        mock_store = AsyncMock()
        mock_rebind = AsyncMock()

        with patches[0], patches[1], patches[2], \
             patch(_BRIDGE, mock_bridge), \
             patch("pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal", return_value=mock_db_session), \
             patch("pixsim7.backend.main.api.v1.meta_contracts._upsert_chat_session", mock_upsert), \
             patch("pixsim7.backend.main.api.v1.meta_contracts._store_pending_user_message", mock_pending), \
             patch("pixsim7.backend.main.api.v1.meta_contracts._store_session_response", mock_store), \
             patch("pixsim7.backend.main.api.v1.ws_chat._bind_tab_to_session", mock_bind), \
             patch("pixsim7.backend.main.api.v1.ws_chat._handle_resume_failure", mock_rebind):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "message", "tab_id": "11111111-1111-1111-1111-111111111111",
                    "message": "still there?",
                }))
                hb = json.loads(ws.receive_text())
                result = json.loads(ws.receive_text())

        assert hb["resume_failed"] == rf
        assert result["resume_failed"] == rf
        # Rebind invoked (heartbeat path + result path both call it; idempotent).
        assert mock_rebind.await_count >= 1
        assert mock_rebind.call_args.args[0] == rf

    def test_handle_resume_failure_repoints_bound_tab(self):
        """`_handle_resume_failure` force-repoints ChatTab.session_id onto the
        fresh conversation even though it's already bound (the dead-conv bind
        is exactly what we must overwrite)."""
        import asyncio
        from types import SimpleNamespace

        from pixsim7.backend.main.api.v1.ws_chat import _handle_resume_failure

        tab = SimpleNamespace(
            user_id=9, session_id="old-conv", updated_at=None,
        )
        fake_db = AsyncMock()
        fake_db.get = AsyncMock(return_value=tab)
        fake_db.commit = AsyncMock()

        class _Ctx:
            async def __aenter__(self):
                return fake_db
            async def __aexit__(self, *a):
                return None

        with patch(
            "pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal",
            _Ctx,
        ):
            asyncio.run(
                _handle_resume_failure(
                    {"requested": "old-conv", "actual": "fresh-conv"},
                    "11111111-1111-1111-1111-111111111111",
                    9,
                )
            )

        assert tab.session_id == "fresh-conv"
        fake_db.commit.assert_awaited_once()

    def test_missing_assistant_id_uses_resolved_default_profile_for_session(self):
        app = _app()
        client = TestClient(app)
        agent = _make_agent()
        mock_bridge = MagicMock()
        mock_bridge.connected_count = 1
        mock_bridge.get_available_agent.return_value = agent

        async def fake_stream(*args, **kwargs):
            yield {
                "type": "result", "ok": True,
                "response": "Hello back!",
                "bridge_session_id": "sess-xyz",
            }

        mock_bridge.dispatch_task_streaming = fake_stream
        patches = _debug_patches(user_id=7, token="tok")
        mock_db = MagicMock()
        mock_db_session = MagicMock()
        mock_db_session.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db_session.__aexit__ = AsyncMock(return_value=None)
        mock_upsert = AsyncMock()
        resolved_profile = SimpleNamespace(
            id="assistant:default",
            system_prompt=None,
            model_id=None,
            config=None,
            reasoning_effort=None,
        )
        mock_resolve_profile = AsyncMock(return_value=resolved_profile)

        with patches[0], patches[1], patches[2], \
             patch(_BRIDGE, mock_bridge), \
             patch("pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal", return_value=mock_db_session), \
             patch("pixsim7.backend.main.api.v1.agent_profiles.resolve_agent_profile", mock_resolve_profile), \
             patch("pixsim7.backend.main.api.v1.meta_contracts._upsert_chat_session", mock_upsert):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "message",
                    "tab_id": "t1",
                    "message": "hello",
                    "engine": "claude",
                }))
                result = json.loads(ws.receive_text())
                assert result["type"] == "result"
                assert result["ok"] is True
                assert result["bridge_session_id"] == "sess-xyz"

        mock_resolve_profile.assert_awaited_once_with(mock_db, 7, None, agent_type="claude")
        assert mock_upsert.call_count == 1
        assert mock_upsert.call_args.kwargs["profile_id"] == "assistant:default"

    def test_explicit_body_model_wins_over_profile_model_id(self):
        """`profile.model_id` is a default, not a pin: an explicit
        `body.model` (toolbar dropdown) must override it. Otherwise the
        dropdown is dead UI for any profile that has a model set, and
        the only way to try a different model is to edit the profile.
        """
        app = _app()
        client = TestClient(app)
        agent = _make_agent()
        mock_bridge = MagicMock()
        mock_bridge.connected_count = 1
        mock_bridge.get_available_agent.return_value = agent

        captured: dict = {}

        async def fake_stream(payload, **kwargs):
            captured["model"] = payload.get("model")
            yield {"type": "result", "ok": True, "response": "ok", "bridge_session_id": "s"}

        mock_bridge.dispatch_task_streaming = fake_stream
        patches = _debug_patches(user_id=7, token="tok")
        mock_db_session = MagicMock()
        mock_db_session.__aenter__ = AsyncMock(return_value=MagicMock())
        mock_db_session.__aexit__ = AsyncMock(return_value=None)
        # Profile pins gpt-5.3-codex; explicit body.model is gpt-5.4 — explicit wins.
        resolved_profile = SimpleNamespace(
            id="profile-codex",
            system_prompt=None,
            model_id="gpt-5.3-codex",
            config=None,
            reasoning_effort=None,
        )
        mock_resolve_profile = AsyncMock(return_value=resolved_profile)

        with patches[0], patches[1], patches[2], \
             patch(_BRIDGE, mock_bridge), \
             patch("pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal", return_value=mock_db_session), \
             patch("pixsim7.backend.main.api.v1.agent_profiles.resolve_agent_profile", mock_resolve_profile), \
             patch("pixsim7.backend.main.api.v1.meta_contracts._upsert_chat_session", AsyncMock()):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "message",
                    "tab_id": "t1",
                    "message": "hello",
                    "engine": "codex",
                    "assistant_id": "profile-codex",
                    "model": "gpt-5.4",  # explicit override
                }))
                # Drain to result
                while True:
                    msg = json.loads(ws.receive_text())
                    if msg.get("type") == "result":
                        break

        assert captured["model"] == "gpt-5.4", (
            f"explicit body.model must win over profile.model_id, got {captured['model']!r}"
        )

    def test_explicit_body_reasoning_effort_wins_over_profile(self):
        """A per-turn `reasoning_effort` (composer dropdown) overrides the
        profile's effort. The dispatched payload carries it under
        `profile_config.reasoning_effort` (the bridge reads it from there).
        """
        app = _app()
        client = TestClient(app)
        agent = _make_agent()
        mock_bridge = MagicMock()
        mock_bridge.connected_count = 1
        mock_bridge.get_available_agent.return_value = agent

        captured: dict = {}

        async def fake_stream(payload, **kwargs):
            captured["profile_config"] = payload.get("profile_config")
            yield {"type": "result", "ok": True, "response": "ok", "bridge_session_id": "s"}

        mock_bridge.dispatch_task_streaming = fake_stream
        patches = _debug_patches(user_id=7, token="tok")
        mock_db_session = MagicMock()
        mock_db_session.__aenter__ = AsyncMock(return_value=MagicMock())
        mock_db_session.__aexit__ = AsyncMock(return_value=None)
        # Profile sets effort=low; explicit body effort=high — explicit wins.
        resolved_profile = SimpleNamespace(
            id="profile-claude",
            system_prompt=None,
            model_id=None,
            config=None,
            reasoning_effort="low",
        )
        mock_resolve_profile = AsyncMock(return_value=resolved_profile)

        with patches[0], patches[1], patches[2], \
             patch(_BRIDGE, mock_bridge), \
             patch("pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal", return_value=mock_db_session), \
             patch("pixsim7.backend.main.api.v1.agent_profiles.resolve_agent_profile", mock_resolve_profile), \
             patch("pixsim7.backend.main.api.v1.meta_contracts._upsert_chat_session", AsyncMock()):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "message",
                    "tab_id": "t1",
                    "message": "hello",
                    "engine": "claude",
                    "assistant_id": "profile-claude",
                    "reasoning_effort": "high",  # explicit override
                }))
                while True:
                    msg = json.loads(ws.receive_text())
                    if msg.get("type") == "result":
                        break

        effort = (captured.get("profile_config") or {}).get("reasoning_effort")
        assert effort == "high", (
            f"explicit body.reasoning_effort must win over profile, got {effort!r}"
        )

    def test_profile_model_id_used_when_body_model_missing(self):
        """Sanity: profile.model_id IS still the default — it just doesn't pin."""
        app = _app()
        client = TestClient(app)
        agent = _make_agent()
        mock_bridge = MagicMock()
        mock_bridge.connected_count = 1
        mock_bridge.get_available_agent.return_value = agent

        captured: dict = {}

        async def fake_stream(payload, **kwargs):
            captured["model"] = payload.get("model")
            yield {"type": "result", "ok": True, "response": "ok", "bridge_session_id": "s"}

        mock_bridge.dispatch_task_streaming = fake_stream
        patches = _debug_patches(user_id=7, token="tok")
        mock_db_session = MagicMock()
        mock_db_session.__aenter__ = AsyncMock(return_value=MagicMock())
        mock_db_session.__aexit__ = AsyncMock(return_value=None)
        resolved_profile = SimpleNamespace(
            id="profile-codex",
            system_prompt=None,
            model_id="gpt-5.3-codex",
            config=None,
            reasoning_effort=None,
        )
        mock_resolve_profile = AsyncMock(return_value=resolved_profile)
        # Bridge doesn't advertise a default — fallback path returns no model.
        mock_bridge.get_available_models.return_value = []

        with patches[0], patches[1], patches[2], \
             patch(_BRIDGE, mock_bridge), \
             patch("pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal", return_value=mock_db_session), \
             patch("pixsim7.backend.main.api.v1.agent_profiles.resolve_agent_profile", mock_resolve_profile), \
             patch("pixsim7.backend.main.api.v1.meta_contracts._upsert_chat_session", AsyncMock()):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "message",
                    "tab_id": "t1",
                    "message": "hello",
                    "engine": "codex",
                    "assistant_id": "profile-codex",
                    # no `model` key
                }))
                while True:
                    msg = json.loads(ws.receive_text())
                    if msg.get("type") == "result":
                        break

        assert captured["model"] == "gpt-5.3-codex"

    def test_static_default_model_used_when_bridge_catalog_empty(self):
        """First dispatch on a fresh bridge: query_models hasn't replied yet,
        bridge_models is empty, profile has no model_id. Without the static
        fallback the payload would carry model=None and the engine would
        silently use whatever local config.toml says. With it, the dispatch
        is deterministic.
        """
        app = _app()
        client = TestClient(app)
        agent = _make_agent()
        agent.agent_type = "codex-cli"
        mock_bridge = MagicMock()
        mock_bridge.connected_count = 1
        mock_bridge.get_available_agent.return_value = agent
        # Bridge advertises no models (catalog race) — fallback must fire.
        mock_bridge.get_available_models.return_value = []

        captured: dict = {}

        async def fake_stream(payload, **kwargs):
            captured["model"] = payload.get("model")
            yield {"type": "result", "ok": True, "response": "ok", "bridge_session_id": "s"}

        mock_bridge.dispatch_task_streaming = fake_stream
        patches = _debug_patches(user_id=7, token="tok")
        mock_db_session = MagicMock()
        mock_db_session.__aenter__ = AsyncMock(return_value=MagicMock())
        mock_db_session.__aexit__ = AsyncMock(return_value=None)
        # No profile model_id, no body.model — entire stack must rely on fallback.
        resolved_profile = SimpleNamespace(
            id="profile-codex",
            system_prompt=None,
            model_id=None,
            config=None,
            reasoning_effort=None,
        )

        with patches[0], patches[1], patches[2], \
             patch(_BRIDGE, mock_bridge), \
             patch("pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal", return_value=mock_db_session), \
             patch("pixsim7.backend.main.api.v1.agent_profiles.resolve_agent_profile", AsyncMock(return_value=resolved_profile)), \
             patch("pixsim7.backend.main.api.v1.meta_contracts._upsert_chat_session", AsyncMock()):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()
                ws.send_text(json.dumps({
                    "type": "message",
                    "tab_id": "t1",
                    "message": "hello",
                    "engine": "codex",
                    "assistant_id": "profile-codex",
                }))
                while True:
                    msg = json.loads(ws.receive_text())
                    if msg.get("type") == "result":
                        break

        # Concrete model name, not None / "default"
        assert captured["model"] == "gpt-5.4", f"expected static fallback, got {captured['model']!r}"

    def test_bridge_advertised_default_wins_over_static_fallback(self):
        """Once the bridge catalog lands, its is_default model wins over
        the static fallback — the static is only the safety net for the
        first dispatch.
        """
        app = _app()
        client = TestClient(app)
        agent = _make_agent()
        agent.agent_type = "codex-cli"
        mock_bridge = MagicMock()
        mock_bridge.connected_count = 1
        mock_bridge.get_available_agent.return_value = agent
        # Bridge has a different default than our static fallback —
        # bridge wins.
        mock_bridge.get_available_models.return_value = [
            {"id": "gpt-5.5-codex", "is_default": True},
            {"id": "gpt-5.4", "is_default": False},
        ]

        captured: dict = {}

        async def fake_stream(payload, **kwargs):
            captured["model"] = payload.get("model")
            yield {"type": "result", "ok": True, "response": "ok", "bridge_session_id": "s"}

        mock_bridge.dispatch_task_streaming = fake_stream
        patches = _debug_patches(user_id=7, token="tok")
        mock_db_session = MagicMock()
        mock_db_session.__aenter__ = AsyncMock(return_value=MagicMock())
        mock_db_session.__aexit__ = AsyncMock(return_value=None)
        resolved_profile = SimpleNamespace(
            id="profile-codex",
            system_prompt=None,
            model_id=None,
            config=None,
            reasoning_effort=None,
        )

        with patches[0], patches[1], patches[2], \
             patch(_BRIDGE, mock_bridge), \
             patch("pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal", return_value=mock_db_session), \
             patch("pixsim7.backend.main.api.v1.agent_profiles.resolve_agent_profile", AsyncMock(return_value=resolved_profile)), \
             patch("pixsim7.backend.main.api.v1.meta_contracts._upsert_chat_session", AsyncMock()):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()
                ws.send_text(json.dumps({
                    "type": "message",
                    "tab_id": "t1",
                    "message": "hello",
                    "engine": "codex",
                    "assistant_id": "profile-codex",
                }))
                while True:
                    msg = json.loads(ws.receive_text())
                    if msg.get("type") == "result":
                        break

        assert captured["model"] == "gpt-5.5-codex"

    def test_blank_body_model_falls_back_to_profile(self):
        """Empty-string body.model must not pin to "" — treat as missing."""
        app = _app()
        client = TestClient(app)
        agent = _make_agent()
        mock_bridge = MagicMock()
        mock_bridge.connected_count = 1
        mock_bridge.get_available_agent.return_value = agent

        captured: dict = {}

        async def fake_stream(payload, **kwargs):
            captured["model"] = payload.get("model")
            yield {"type": "result", "ok": True, "response": "ok", "bridge_session_id": "s"}

        mock_bridge.dispatch_task_streaming = fake_stream
        patches = _debug_patches(user_id=7, token="tok")
        mock_db_session = MagicMock()
        mock_db_session.__aenter__ = AsyncMock(return_value=MagicMock())
        mock_db_session.__aexit__ = AsyncMock(return_value=None)
        resolved_profile = SimpleNamespace(
            id="profile-codex",
            system_prompt=None,
            model_id="gpt-5.3-codex",
            config=None,
            reasoning_effort=None,
        )
        mock_resolve_profile = AsyncMock(return_value=resolved_profile)
        mock_bridge.get_available_models.return_value = []

        with patches[0], patches[1], patches[2], \
             patch(_BRIDGE, mock_bridge), \
             patch("pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal", return_value=mock_db_session), \
             patch("pixsim7.backend.main.api.v1.agent_profiles.resolve_agent_profile", mock_resolve_profile), \
             patch("pixsim7.backend.main.api.v1.meta_contracts._upsert_chat_session", AsyncMock()):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()
                ws.send_text(json.dumps({
                    "type": "message",
                    "tab_id": "t1",
                    "message": "hello",
                    "engine": "codex",
                    "assistant_id": "profile-codex",
                    "model": "   ",  # whitespace-only — must be treated as absent
                }))
                while True:
                    msg = json.loads(ws.receive_text())
                    if msg.get("type") == "result":
                        break

        assert captured["model"] == "gpt-5.3-codex"

    def test_body_model_is_trimmed_before_dispatch(self):
        """Whitespace around explicit body.model must be stripped."""
        app = _app()
        client = TestClient(app)
        agent = _make_agent()
        mock_bridge = MagicMock()
        mock_bridge.connected_count = 1
        mock_bridge.get_available_agent.return_value = agent

        captured: dict = {}

        async def fake_stream(payload, **kwargs):
            captured["model"] = payload.get("model")
            yield {"type": "result", "ok": True, "response": "ok", "bridge_session_id": "s"}

        mock_bridge.dispatch_task_streaming = fake_stream
        patches = _debug_patches(user_id=7, token="tok")
        mock_db_session = MagicMock()
        mock_db_session.__aenter__ = AsyncMock(return_value=MagicMock())
        mock_db_session.__aexit__ = AsyncMock(return_value=None)
        resolved_profile = SimpleNamespace(
            id="profile-codex",
            system_prompt=None,
            model_id="gpt-5.4",
            config=None,
            reasoning_effort=None,
        )
        mock_resolve_profile = AsyncMock(return_value=resolved_profile)

        with patches[0], patches[1], patches[2], \
             patch(_BRIDGE, mock_bridge), \
             patch("pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal", return_value=mock_db_session), \
             patch("pixsim7.backend.main.api.v1.agent_profiles.resolve_agent_profile", mock_resolve_profile), \
             patch("pixsim7.backend.main.api.v1.meta_contracts._upsert_chat_session", AsyncMock()):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()
                ws.send_text(json.dumps({
                    "type": "message",
                    "tab_id": "t1",
                    "message": "hello",
                    "engine": "codex",
                    "assistant_id": "profile-codex",
                    "model": "  gpt-5.3-codex  ",
                }))
                while True:
                    msg = json.loads(ws.receive_text())
                    if msg.get("type") == "result":
                        break

        assert captured["model"] == "gpt-5.3-codex"

    def test_unknown_assistant_id_uses_resolved_default_profile_for_session(self):
        app = _app()
        client = TestClient(app)
        agent = _make_agent()
        mock_bridge = MagicMock()
        mock_bridge.connected_count = 1
        mock_bridge.get_available_agent.return_value = agent

        captured: dict = {}

        async def fake_stream(payload, **kwargs):
            captured["profile_id"] = payload.get("profile_id")
            yield {
                "type": "result", "ok": True,
                "response": "Hello back!",
                "bridge_session_id": "sess-xyz",
            }

        mock_bridge.dispatch_task_streaming = fake_stream
        patches = _debug_patches(user_id=7, token="tok")
        mock_db = MagicMock()
        mock_db_session = MagicMock()
        mock_db_session.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db_session.__aexit__ = AsyncMock(return_value=None)
        mock_upsert = AsyncMock()
        resolved_profile = SimpleNamespace(
            id="assistant:default",
            system_prompt=None,
            model_id=None,
            config=None,
            reasoning_effort=None,
        )
        mock_resolve_profile = AsyncMock(return_value=resolved_profile)

        with patches[0], patches[1], patches[2], \
             patch(_BRIDGE, mock_bridge), \
             patch("pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal", return_value=mock_db_session), \
             patch("pixsim7.backend.main.api.v1.agent_profiles.resolve_agent_profile", mock_resolve_profile), \
             patch("pixsim7.backend.main.api.v1.meta_contracts._upsert_chat_session", mock_upsert):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "message",
                    "tab_id": "t1",
                    "message": "hello",
                    "engine": "claude",
                    "assistant_id": "unknown",
                }))
                result = json.loads(ws.receive_text())
                assert result["type"] == "result"
                assert result["ok"] is True
                assert result["bridge_session_id"] == "sess-xyz"

        mock_resolve_profile.assert_awaited_once_with(mock_db, 7, None, agent_type="claude")
        assert mock_upsert.call_count == 1
        assert mock_upsert.call_args.kwargs["profile_id"] == "assistant:default"
        assert captured["profile_id"] == "assistant:default"


# ── Reconnect ────────────────────────────────────────────────────

class TestWsChatReconnect:
    """Reconnect to in-flight or completed tasks."""

    def test_reconnect_no_task_id_returns_error(self):
        app = _app()
        client = TestClient(app)
        patches = _debug_patches(user_id=1)
        with patches[0], patches[1], patches[2]:
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "reconnect", "tab_id": "t1",
                }))
                data = json.loads(ws.receive_text())
                assert data["type"] == "error"
                assert "No task_id" in data["error"]
                assert data["error_code"] == "reconnect_missing_task_id"

    def test_reconnect_cached_result(self):
        app = _app()
        client = TestClient(app)
        mock_bridge = MagicMock()
        mock_bridge.get_completed_result.return_value = {
            "response": "cached answer",
            "bridge_session_id": "sess-456",
        }
        patches = _debug_patches(user_id=1)
        with patches[0], patches[1], patches[2], patch(_BRIDGE, mock_bridge):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "reconnect", "tab_id": "t1", "task_id": "task-abc",
                }))
                data = json.loads(ws.receive_text())
                assert data["type"] == "result"
                assert data["tab_id"] == "t1"
                assert data["ok"] is True
                assert data["response"] == "cached answer"
                assert data["reconnected"] is True

    def test_reconnect_task_not_found(self):
        app = _app()
        client = TestClient(app)
        mock_bridge = MagicMock()
        mock_bridge.get_completed_result.return_value = None
        mock_bridge._active_tasks = {}
        mock_bridge.connected_count = 0  # no bridge → grace wait then give up
        patches = _debug_patches(user_id=1)
        with (
            patches[0],
            patches[1],
            patches[2],
            patch(_BRIDGE, mock_bridge),
            patch("pixsim7.backend.main.api.v1.ws_chat._RECONNECT_BRIDGE_RETURN_WAIT_S", 0.1),
        ):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "reconnect", "tab_id": "t1", "task_id": "task-gone",
                }))
                # Fix A: the reconnect is held open (recovering heartbeat) while
                # we wait for a bridge to return before failing.
                hb = json.loads(ws.receive_text())
                assert hb["type"] == "heartbeat"
                assert hb["action"] == "recovering"
                data = json.loads(ws.receive_text())
                assert data["type"] == "error"
                assert "not found" in data["error"].lower()
                assert data["error_code"] == "task_not_found"

    def test_reconnect_after_bridge_disconnect_returns_cached_error(self):
        """When a bridge disconnects mid-task, the error is cached and returned on reconnect."""
        app = _app()
        client = TestClient(app)
        mock_bridge = MagicMock()
        # Simulate: bridge disconnected, error was cached in _completed_results
        mock_bridge.get_completed_result.return_value = {
            "error": "Remote agent disconnected",
            "ok": False,
        }
        patches = _debug_patches(user_id=1)
        with patches[0], patches[1], patches[2], patch(_BRIDGE, mock_bridge):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "reconnect", "tab_id": "t1", "task_id": "task-lost",
                }))
                data = json.loads(ws.receive_text())
                assert data["type"] == "result"
                assert data["ok"] is False
                assert "disconnected" in data.get("error", "").lower()
                assert data["reconnected"] is True

    def test_reconnect_waits_for_bridge_replay_after_restart(self):
        app = _app()
        client = TestClient(app)
        mock_bridge = MagicMock()
        mock_bridge._active_tasks = {}
        mock_bridge.connected_count = 1
        mock_bridge.get_completed_result.side_effect = [
            None,
            {"response": "replayed answer", "bridge_session_id": "sess-777"},
        ]
        patches = _debug_patches(user_id=1)
        with (
            patches[0],
            patches[1],
            patches[2],
            patch(_BRIDGE, mock_bridge),
            patch("pixsim7.backend.main.api.v1.ws_chat._RECONNECT_REPLAY_WAIT_S", 0.2),
            patch("pixsim7.backend.main.api.v1.ws_chat._RECONNECT_REPLAY_POLL_S", 0.01),
        ):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "reconnect", "tab_id": "t1", "task_id": "task-replay",
                }))
                heartbeat = json.loads(ws.receive_text())
                assert heartbeat["type"] == "heartbeat"
                assert heartbeat["action"] == "recovering"
                data = json.loads(ws.receive_text())
                assert data["type"] == "result"
                assert data["ok"] is True
                assert data["response"] == "replayed answer"
                assert data["bridge_session_id"] == "sess-777"
                assert data["reconnected"] is True

    def test_reconnect_recovers_from_session_tail(self):
        app = _app()
        client = TestClient(app)
        mock_bridge = MagicMock()
        mock_bridge.get_completed_result.return_value = None
        mock_bridge._active_tasks = {}
        mock_bridge.connected_count = 0
        recover = AsyncMock(return_value=("Recovered from session", "sess-tail"))
        patches = _debug_patches(user_id=1)
        with (
            patches[0],
            patches[1],
            patches[2],
            patch(_BRIDGE, mock_bridge),
            patch("pixsim7.backend.main.api.v1.ws_chat._RECONNECT_BRIDGE_RETURN_WAIT_S", 0.1),
            patch("pixsim7.backend.main.api.v1.ws_chat._recover_session_tail_response", recover),
        ):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "reconnect",
                    "tab_id": "t1",
                    "task_id": "task-gone",
                    "bridge_session_id": "sess-tail",
                }))
                # No bridge present → recovering heartbeat while we wait, then
                # fall through to the persisted session-tail recovery.
                hb = json.loads(ws.receive_text())
                assert hb["type"] == "heartbeat"
                assert hb["action"] == "recovering"
                data = json.loads(ws.receive_text())
                assert data["type"] == "result"
                assert data["ok"] is True
                assert data["response"] == "Recovered from session"
                assert data["bridge_session_id"] == "sess-tail"
                assert data["reconnected"] is True

        recover.assert_awaited_once_with("sess-tail", user_id=1)

    def test_reconnect_inflight_holds_open_for_bridge_then_recovers(self):
        """Fix A: panel reconnects before the bridge does after a restart.

        Reproduces the field report — user sent a message, then restarted the
        backend within a few seconds. The browser panel reconnects almost
        instantly, but the agent bridge is still in its reconnect backoff, so
        it hasn't re-reported its in-flight task via the ``pool_status``
        handshake yet. At that instant the backend knows nothing about the task
        and ``connected_count == 0``.

        Rather than instantly failing with ``task_not_found``, the reconnect is
        now held open (a ``recovering`` heartbeat is sent) while we wait for a
        bridge to return. Here the bridge comes back and replays the result,
        so the panel recovers instead of seeing a spurious failure.
        """
        app = _app()
        client = TestClient(app)
        mock_bridge = MagicMock()
        mock_bridge._active_tasks = {}
        mock_bridge.connected_count = 0  # bridge still in reconnect backoff
        # tier-1 cache miss, then the replayed result lands once the bridge is
        # back and the held-open replay-wait polls again.
        mock_bridge.get_completed_result.side_effect = [
            None,
            {"response": "replayed answer", "bridge_session_id": "sess-back"},
        ]
        # Simulate the bridge returning during the grace wait.
        wait_return = AsyncMock(return_value=True)
        patches = _debug_patches(user_id=1)
        with (
            patches[0],
            patches[1],
            patches[2],
            patch(_BRIDGE, mock_bridge),
            patch("pixsim7.backend.main.api.v1.ws_chat._wait_for_bridge_return", wait_return),
            patch("pixsim7.backend.main.api.v1.ws_chat._RECONNECT_REPLAY_WAIT_S", 0.2),
            patch("pixsim7.backend.main.api.v1.ws_chat._RECONNECT_REPLAY_POLL_S", 0.01),
        ):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "reconnect",
                    "tab_id": "t1",
                    "task_id": "task-inflight",
                    "bridge_session_id": "sess-pending",
                }))
                # First frame: recovering heartbeat (reconnect held open).
                hb = json.loads(ws.receive_text())
                assert hb["type"] == "heartbeat"
                assert hb["action"] == "recovering"
                assert hb["detail"] == "Waiting for agent to reconnect"
                # Then the second recovering heartbeat for the replay-wait.
                hb2 = json.loads(ws.receive_text())
                assert hb2["type"] == "heartbeat"
                assert hb2["detail"] == "Waiting for bridge replay"
                # Finally the replayed result.
                data = json.loads(ws.receive_text())
                assert data["type"] == "result"
                assert data["ok"] is True
                assert data["response"] == "replayed answer"
                assert data["reconnected"] is True
        wait_return.assert_awaited_once()

    def test_reconnect_inflight_gives_up_after_grace_when_bridge_never_returns(self):
        """Fix A: the held-open reconnect still fails (gracefully) if no bridge
        comes back and nothing was persisted — but only after the grace wait,
        and after surfacing a ``recovering`` heartbeat first."""
        app = _app()
        client = TestClient(app)
        mock_bridge = MagicMock()
        mock_bridge.get_completed_result.return_value = None
        mock_bridge._active_tasks = {}
        mock_bridge.connected_count = 0
        recover = AsyncMock(return_value=None)  # nothing persisted yet
        patches = _debug_patches(user_id=1)
        with (
            patches[0],
            patches[1],
            patches[2],
            patch(_BRIDGE, mock_bridge),
            patch("pixsim7.backend.main.api.v1.ws_chat._RECONNECT_BRIDGE_RETURN_WAIT_S", 0.1),
            patch("pixsim7.backend.main.api.v1.ws_chat._recover_session_tail_response", recover),
        ):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "reconnect",
                    "tab_id": "t1",
                    "task_id": "task-inflight",
                    "bridge_session_id": "sess-pending",
                }))
                hb = json.loads(ws.receive_text())
                assert hb["type"] == "heartbeat"
                assert hb["action"] == "recovering"
                data = json.loads(ws.receive_text())
                assert data["type"] == "error"
                assert data["error_code"] == "task_not_found"


# ── Bridge-return grace wait (Fix A) ─────────────────────────────

class TestWaitForBridgeReturn:
    """Unit tests for the bounded bridge-return wait used by reconnect."""

    @staticmethod
    def _bridge(connected_count=0, active=None):
        return SimpleNamespace(
            connected_count=connected_count,
            _active_tasks=active if active is not None else {},
            get_completed_result=lambda _tid: None,
        )

    @pytest.mark.asyncio
    async def test_returns_true_immediately_when_bridge_present(self):
        from pixsim7.backend.main.api.v1 import ws_chat
        bridge = self._bridge(connected_count=1)
        assert await ws_chat._wait_for_bridge_return("t", bridge=bridge) is True

    @pytest.mark.asyncio
    async def test_returns_true_when_bridge_reconnects_mid_wait(self):
        from pixsim7.backend.main.api.v1 import ws_chat
        bridge = self._bridge(connected_count=0)

        async def flip():
            await asyncio.sleep(0.02)
            bridge.connected_count = 1

        with (
            patch.object(ws_chat, "_RECONNECT_BRIDGE_RETURN_WAIT_S", 1.0),
            patch.object(ws_chat, "_RECONNECT_REPLAY_POLL_S", 0.01),
        ):
            flipper = asyncio.create_task(flip())
            result = await ws_chat._wait_for_bridge_return("t", bridge=bridge)
            await flipper
        assert result is True

    @pytest.mark.asyncio
    async def test_returns_true_when_task_rebuilt_mid_wait(self):
        from pixsim7.backend.main.api.v1 import ws_chat
        active: dict = {}
        bridge = self._bridge(connected_count=0, active=active)

        async def rebuild():
            await asyncio.sleep(0.02)
            active["t"] = {"_ts": None}

        with (
            patch.object(ws_chat, "_RECONNECT_BRIDGE_RETURN_WAIT_S", 1.0),
            patch.object(ws_chat, "_RECONNECT_REPLAY_POLL_S", 0.01),
        ):
            rebuilder = asyncio.create_task(rebuild())
            result = await ws_chat._wait_for_bridge_return("t", bridge=bridge)
            await rebuilder
        assert result is True

    @pytest.mark.asyncio
    async def test_returns_false_when_no_bridge_returns(self):
        from pixsim7.backend.main.api.v1 import ws_chat
        bridge = self._bridge(connected_count=0)
        with (
            patch.object(ws_chat, "_RECONNECT_BRIDGE_RETURN_WAIT_S", 0.1),
            patch.object(ws_chat, "_RECONNECT_REPLAY_POLL_S", 0.01),
        ):
            result = await ws_chat._wait_for_bridge_return("t", bridge=bridge)
        assert result is False


# ── Session-tail recovery (reconnect tier 4) ─────────────────────

_DB_SESSION = "pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal"


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows


class _FakeSession:
    """Minimal async-session stand-in for _recover_session_tail_response."""

    def __init__(self, get_obj=None, query_rows=None):
        self._get_obj = get_obj
        self._query_rows = query_rows or []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, _model, _key):
        return self._get_obj

    async def execute(self, _stmt):
        return _FakeResult(self._query_rows)


def _chat_session(messages, user_id=1, cli_session_id="cli-1", row_id="row-1"):
    return SimpleNamespace(
        user_id=user_id,
        cli_session_id=cli_session_id,
        id=row_id,
        messages=messages,
    )


class TestRecoverSessionTail:
    """Direct coverage of the DB tail-recovery used as reconnect's last resort.

    Previously only mocked at the ws_chat layer — the actual session lookup,
    owner gate, and tail validation were uncovered.
    """

    @pytest.mark.asyncio
    async def test_no_hint_returns_none_without_db(self):
        # No session hint → bail before touching the DB.
        assert await _recover_session_tail_response("", user_id=1) is None
        assert await _recover_session_tail_response(None, user_id=1) is None

    @pytest.mark.asyncio
    async def test_recovers_assistant_tail_found_by_primary_key(self):
        session = _chat_session(
            [{"role": "user", "text": "hi"},
             {"role": "assistant", "text": "hello there"}],
            cli_session_id="cli-1",
        )
        with patch(_DB_SESSION, lambda: _FakeSession(get_obj=session)):
            result = await _recover_session_tail_response("cli-1", user_id=1)
        assert result == ("hello there", "cli-1")

    @pytest.mark.asyncio
    async def test_recovers_via_cli_session_id_fallback_lookup(self):
        # db.get misses (hint isn't the PK) → fall back to the cli_session_id query.
        session = _chat_session(
            [{"role": "assistant", "text": "from fallback"}],
            cli_session_id="cli-xyz",
        )
        with patch(_DB_SESSION, lambda: _FakeSession(get_obj=None, query_rows=[session])):
            result = await _recover_session_tail_response("cli-xyz", user_id=1)
        assert result == ("from fallback", "cli-xyz")

    @pytest.mark.asyncio
    async def test_owner_mismatch_is_rejected(self):
        session = _chat_session(
            [{"role": "assistant", "text": "secret"}], user_id=2,
        )
        with patch(_DB_SESSION, lambda: _FakeSession(get_obj=session)):
            result = await _recover_session_tail_response("cli-1", user_id=1)
        assert result is None

    @pytest.mark.asyncio
    async def test_system_owned_session_is_allowed(self):
        # owner_id == 0 (system/shared) is readable by any requester.
        session = _chat_session(
            [{"role": "assistant", "text": "shared reply"}], user_id=0,
        )
        with patch(_DB_SESSION, lambda: _FakeSession(get_obj=session)):
            result = await _recover_session_tail_response("cli-1", user_id=1)
        assert result == ("shared reply", "cli-1")

    @pytest.mark.asyncio
    async def test_session_not_found_returns_none(self):
        with patch(_DB_SESSION, lambda: _FakeSession(get_obj=None, query_rows=[])):
            assert await _recover_session_tail_response("cli-gone", user_id=1) is None

    @pytest.mark.asyncio
    async def test_empty_messages_returns_none(self):
        session = _chat_session([])
        with patch(_DB_SESSION, lambda: _FakeSession(get_obj=session)):
            assert await _recover_session_tail_response("cli-1", user_id=1) is None

    @pytest.mark.asyncio
    async def test_tail_not_assistant_returns_none(self):
        # The agent never replied — last message is still the user's.
        session = _chat_session([{"role": "user", "text": "are you there?"}])
        with patch(_DB_SESSION, lambda: _FakeSession(get_obj=session)):
            assert await _recover_session_tail_response("cli-1", user_id=1) is None

    @pytest.mark.asyncio
    async def test_empty_assistant_text_returns_none(self):
        session = _chat_session([{"role": "assistant", "text": "   "}])
        with patch(_DB_SESSION, lambda: _FakeSession(get_obj=session)):
            assert await _recover_session_tail_response("cli-1", user_id=1) is None

    @pytest.mark.asyncio
    async def test_malformed_tail_returns_none(self):
        session = _chat_session([{"role": "user", "text": "hi"}, "not-a-dict"])
        with patch(_DB_SESSION, lambda: _FakeSession(get_obj=session)):
            assert await _recover_session_tail_response("cli-1", user_id=1) is None

    @pytest.mark.asyncio
    async def test_falls_back_to_row_id_when_no_cli_session_id(self):
        session = _chat_session(
            [{"role": "assistant", "text": "ok"}], cli_session_id=None, row_id="row-99",
        )
        with patch(_DB_SESSION, lambda: _FakeSession(get_obj=session)):
            result = await _recover_session_tail_response("some-hint", user_id=1)
        assert result == ("ok", "row-99")


# ── Auth ─────────────────────────────────────────────────────────

class TestWsChatAuth:
    """Authentication for WS chat."""

    def test_reject_unauthenticated_in_non_debug(self):
        app = _app()
        client = TestClient(app)
        patches = [
            patch(_RESOLVE_USER, AsyncMock(return_value=None)),
            patch(_RESOLVE_TOKEN, AsyncMock(return_value=None)),
            patch(_SETTINGS_DEBUG, False),
        ]
        with patches[0], patches[1], patches[2]:
            with pytest.raises(Exception):
                with client.websocket_connect("/api/v1/ws/chat") as ws:
                    ws.receive_text()

    def test_allow_authenticated(self):
        app = _app()
        client = TestClient(app)
        patches = _auth_patches(user_id=42, token="tok")
        with patches[0], patches[1], patches[2]:
            with client.websocket_connect("/api/v1/ws/chat?token=fake") as ws:
                data = json.loads(ws.receive_text())
                assert data["type"] == "connected"
                assert data["user_id"] == 42


# ── Cancel ────────────────────────────────────────────────────────

class TestWsChatCancel:
    """Server-side cancel via WS."""

    def test_cancel_returns_cancelled_result(self):
        app = _app()
        client = TestClient(app)
        patches = _debug_patches(user_id=1)
        with patches[0], patches[1], patches[2]:
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                # Cancel a tab (even with no active dispatch) — always acks
                ws.send_text(json.dumps({
                    "type": "cancel", "tab_id": "t1",
                }))
                data = json.loads(ws.receive_text())
                assert data["type"] == "result"
                assert data["tab_id"] == "t1"
                assert data["ok"] is False
                assert data["error"] == "cancelled"
                assert data["error_code"] == "cancelled"

    def test_cancel_nonexistent_tab_acks(self):
        """Cancel for a tab with no active dispatch still returns ack."""
        app = _app()
        client = TestClient(app)
        patches = _debug_patches(user_id=1)
        with patches[0], patches[1], patches[2]:
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "cancel", "tab_id": "no-such-tab",
                }))
                data = json.loads(ws.receive_text())
                assert data["type"] == "result"
                assert data["tab_id"] == "no-such-tab"
                assert data["error"] == "cancelled"
                assert data["error_code"] == "cancelled"
                # Connection still alive
                ws.send_text("ping")
                assert ws.receive_text() == "pong"


# ── Tab multiplexing ─────────────────────────────────────────────

class TestWsChatMultiplex:
    """Multiple tabs on a single WS connection."""

    def test_tab_id_isolation(self):
        """Messages for different tabs get the correct tab_id in responses."""
        app = _app()
        client = TestClient(app)
        mock_bridge = MagicMock()
        mock_bridge.connected_count = 0
        patches = _debug_patches(user_id=1, token="tok")
        with patches[0], patches[1], patches[2], patch(_BRIDGE, mock_bridge):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "message", "tab_id": "tab-A", "message": "hello A",
                }))
                ws.send_text(json.dumps({
                    "type": "message", "tab_id": "tab-B", "message": "hello B",
                }))
                responses = {}
                r1 = json.loads(ws.receive_text())
                responses[r1["tab_id"]] = r1
                r2 = json.loads(ws.receive_text())
                responses[r2["tab_id"]] = r2

                assert "tab-A" in responses
                assert "tab-B" in responses


# ── Late-result drain ────────────────────────────────────────────


class TestDrainLateResult:
    """_drain_late_result: detect late arrivals (no longer persists itself —
    bridge-side ``resolve_task`` does that now), fall back to placeholder
    when the grace window expires with nothing to detect.
    """

    @pytest.mark.asyncio
    async def test_skips_placeholder_when_late_result_lands(self):
        """When the agent reply arrives within the drain window, the drain
        exits without writing the placeholder. Persistence of the real reply
        is done by ``bridge.resolve_task`` — not by the drain itself."""
        from pixsim7.backend.main.api.v1.ws_chat import _drain_late_result

        bridge = MagicMock()
        # First poll returns nothing, second poll returns a result.
        bridge.get_completed_result.side_effect = [
            None,
            {"response": "late answer", "bridge_session_id": "sess-late"},
        ]
        store_mock = AsyncMock()
        fake_db = AsyncMock()
        fake_db.commit = AsyncMock()

        class _Ctx:
            async def __aenter__(self):
                return fake_db
            async def __aexit__(self, *args):
                pass

        with (
            patch("pixsim7.backend.main.api.v1.ws_chat._LATE_RESULT_DRAIN_S", 5.0),
            patch("pixsim7.backend.main.api.v1.ws_chat._LATE_RESULT_POLL_S", 0.01),
            patch("pixsim7.backend.main.api.v1.meta_contracts._store_session_response", store_mock),
            patch(
                "pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal",
                _Ctx,
            ),
        ):
            await _drain_late_result(
                task_id="task-late",
                bridge=bridge,
                session_id="sess-late",
                user_message="my question",
                dispatch_started_at=0.0,
                timeout_s=900,
            )

        # Drain detected arrival → returned without writing placeholder.
        # It does NOT call _store_session_response (that's resolve_task's job
        # — exercised in test_remote_cmd_bridge.py).
        store_mock.assert_not_awaited()
        fake_db.commit.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_writes_placeholder_when_grace_expires(self):
        from pixsim7.backend.main.api.v1.ws_chat import _drain_late_result

        bridge = MagicMock()
        bridge.get_completed_result.return_value = None  # never lands
        store_mock = AsyncMock()

        # Capture commits to a fake DB. `status` is read by the placeholder
        # path's archived-guard (ws_chat.py) — omitting it makes the bare
        # except swallow an AttributeError and skip the placeholder write.
        fake_session = SimpleNamespace(messages=[], last_used_at=None, status="active")
        fake_db = AsyncMock()
        fake_db.get = AsyncMock(return_value=fake_session)
        fake_db.commit = AsyncMock()

        class _Ctx:
            async def __aenter__(self):
                return fake_db
            async def __aexit__(self, *args):
                pass

        with (
            patch("pixsim7.backend.main.api.v1.ws_chat._LATE_RESULT_DRAIN_S", 0.05),
            patch("pixsim7.backend.main.api.v1.ws_chat._LATE_RESULT_POLL_S", 0.01),
            patch("pixsim7.backend.main.api.v1.meta_contracts._store_session_response", store_mock),
            patch(
                "pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal",
                _Ctx,
            ),
        ):
            await _drain_late_result(
                task_id="task-noresult",
                bridge=bridge,
                session_id="sess-x",
                user_message="lonely question",
                dispatch_started_at=0.0,
                timeout_s=900,
            )

        store_mock.assert_not_awaited()
        # Placeholder appended: user msg + system "did not respond" msg.
        assert len(fake_session.messages) == 2
        assert fake_session.messages[0]["role"] == "user"
        assert fake_session.messages[0]["text"] == "lonely question"
        assert fake_session.messages[1]["role"] == "system"
        assert "did not respond within 900s" in fake_session.messages[1]["text"]
        # Structured terminal marker — the frontend's responseLost
        # detection treats this as a definitive answer to the user turn
        # so the rose chip stops firing once a turn is abandoned.
        assert fake_session.messages[1]["kind"] == "abandoned"
        fake_db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_skips_when_no_session_id(self):
        from pixsim7.backend.main.api.v1.ws_chat import _drain_late_result

        bridge = MagicMock()
        store_mock = AsyncMock()
        with (
            patch("pixsim7.backend.main.api.v1.ws_chat._LATE_RESULT_DRAIN_S", 0.05),
            patch("pixsim7.backend.main.api.v1.meta_contracts._store_session_response", store_mock),
        ):
            await _drain_late_result(
                task_id="task-x",
                bridge=bridge,
                session_id=None,
                user_message="q",
                dispatch_started_at=0.0,
                timeout_s=900,
            )

        bridge.get_completed_result.assert_not_called()
        store_mock.assert_not_awaited()


# ── _bind_and_persist_result durability ──────────────────────────


class TestBindAndPersistResult:
    """Reply persistence must survive a tab-bind failure.

    The bind only drives the unread pip; the persist is what keeps the
    assistant reply recoverable on the next reconcile/poll. If a bind error
    short-circuited the persist, the reply would exist nowhere — the exact
    "lost agent reply" symptom this belt-and-suspenders path guards.
    """

    @pytest.mark.asyncio
    async def test_bind_failure_still_persists_response(self):
        from pixsim7.backend.main.api.v1 import ws_chat

        bind_mock = AsyncMock(side_effect=RuntimeError("ownership race"))
        store_mock = AsyncMock()
        with (
            patch.object(ws_chat, "_bind_tab_to_session", bind_mock),
            patch(
                "pixsim7.backend.main.api.v1.meta_contracts._store_session_response",
                store_mock,
            ),
        ):
            # Must not raise despite the bind blowing up.
            await ws_chat._bind_and_persist_result(
                tab_id="tab-1",
                cli_session_id="sess-1",
                user_id=1,
                user_message="my question",
                response_text="the answer",
                duration_ms=1234,
            )

        bind_mock.assert_awaited_once()
        # The reply still landed — bind failure did not skip the persist.
        store_mock.assert_awaited_once()
        kwargs = store_mock.await_args.kwargs
        assert kwargs["session_id"] == "sess-1"
        assert kwargs["assistant_response"] == "the answer"

    @pytest.mark.asyncio
    async def test_no_session_id_is_noop(self):
        from pixsim7.backend.main.api.v1 import ws_chat

        bind_mock = AsyncMock()
        store_mock = AsyncMock()
        with (
            patch.object(ws_chat, "_bind_tab_to_session", bind_mock),
            patch(
                "pixsim7.backend.main.api.v1.meta_contracts._store_session_response",
                store_mock,
            ),
        ):
            await ws_chat._bind_and_persist_result(
                tab_id="tab-1",
                cli_session_id=None,
                user_id=1,
                user_message="q",
                response_text="a",
                duration_ms=None,
            )

        bind_mock.assert_not_awaited()
        store_mock.assert_not_awaited()


# ── _handle_message TimeoutError → drain spawn wiring ─────────────


class TestHandleMessageTimeout:
    """End-to-end: dispatch TimeoutError sends WS error AND spawns drain."""

    def _setup_bridge(self, fake_stream):
        agent = _make_agent()
        mock_bridge = MagicMock()
        mock_bridge.connected_count = 1
        mock_bridge.get_available_agent.return_value = agent
        mock_bridge.dispatch_task_streaming = fake_stream
        return mock_bridge

    def _patch_db(self):
        # Profile resolution touches the DB; mock it out.
        mock_db_session = MagicMock()
        mock_db_session.__aenter__ = AsyncMock(return_value=MagicMock())
        mock_db_session.__aexit__ = AsyncMock(return_value=None)
        return patch(
            "pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal",
            return_value=mock_db_session,
        )

    def test_timeout_after_task_created_spawns_drain(self):
        """Dispatch yields task_created then raises TimeoutError → drain
        scheduled with the captured task_id and the body's bridge_session_id."""
        async def fake_stream(*args, **kwargs):
            yield {"type": "task_created", "task_id": "task-T"}
            raise TimeoutError("Remote agent did not respond within 900s")

        app = _app()
        client = TestClient(app)
        mock_bridge = self._setup_bridge(fake_stream)
        drain_mock = AsyncMock(return_value=None)
        patches = _debug_patches(user_id=1, token="tok")

        with (
            patches[0], patches[1], patches[2],
            patch(_BRIDGE, mock_bridge),
            self._patch_db(),
            patch("pixsim7.backend.main.api.v1.ws_chat._drain_late_result", drain_mock),
        ):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "message",
                    "tab_id": "t1",
                    "message": "long-running question",
                    "bridge_session_id": "sess-existing",
                }))
                # First frame: task_created heartbeat
                hb = json.loads(ws.receive_text())
                assert hb["type"] == "heartbeat"
                assert hb["task_id"] == "task-T"
                # Second frame: timeout error result
                err = json.loads(ws.receive_text())
                assert err["type"] == "result"
                assert err["ok"] is False
                assert "did not respond" in err["error"].lower()

        # Drain was scheduled with the right context.
        drain_mock.assert_called_once()
        kwargs = drain_mock.call_args.kwargs
        assert kwargs["task_id"] == "task-T"
        assert kwargs["session_id"] == "sess-existing"
        assert kwargs["user_message"] == "long-running question"
        assert kwargs["timeout_s"] == 900
        assert kwargs["bridge"] is mock_bridge

    def test_timeout_with_no_bridge_session_id_passes_none(self):
        """First-message timeout (no prior session) — drain still spawned
        but with session_id=None; drain itself decides to skip."""
        async def fake_stream(*args, **kwargs):
            yield {"type": "task_created", "task_id": "task-first"}
            raise TimeoutError("Remote agent did not respond within 900s")

        app = _app()
        client = TestClient(app)
        mock_bridge = self._setup_bridge(fake_stream)
        drain_mock = AsyncMock(return_value=None)
        patches = _debug_patches(user_id=1, token="tok")

        with (
            patches[0], patches[1], patches[2],
            patch(_BRIDGE, mock_bridge),
            self._patch_db(),
            patch("pixsim7.backend.main.api.v1.ws_chat._drain_late_result", drain_mock),
        ):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "message",
                    "tab_id": "t1",
                    "message": "first ever message",
                }))
                json.loads(ws.receive_text())  # task_created heartbeat
                json.loads(ws.receive_text())  # timeout result

        drain_mock.assert_called_once()
        assert drain_mock.call_args.kwargs["session_id"] is None
        assert drain_mock.call_args.kwargs["user_message"] == "first ever message"

    def test_timeout_before_task_created_does_not_spawn_drain(self):
        """Dispatch raises TimeoutError without ever yielding task_created
        (e.g. agent send_json failed). Drain has nothing to monitor —
        guard prevents the spawn."""
        async def fake_stream(*args, **kwargs):
            if False:
                yield {}  # generator marker
            raise TimeoutError("Remote agent did not respond within 900s")

        app = _app()
        client = TestClient(app)
        mock_bridge = self._setup_bridge(fake_stream)
        drain_mock = AsyncMock(return_value=None)
        patches = _debug_patches(user_id=1, token="tok")

        with (
            patches[0], patches[1], patches[2],
            patch(_BRIDGE, mock_bridge),
            self._patch_db(),
            patch("pixsim7.backend.main.api.v1.ws_chat._drain_late_result", drain_mock),
        ):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "message",
                    "tab_id": "t1",
                    "message": "q",
                    "bridge_session_id": "sess-x",
                }))
                err = json.loads(ws.receive_text())
                assert err["type"] == "result"
                assert err["ok"] is False

        drain_mock.assert_not_called()

    def test_non_timeout_error_does_not_spawn_drain(self):
        """Regression guard: only TimeoutError takes the drain path. Other
        dispatch errors flow through the generic handler unchanged."""
        async def fake_stream(*args, **kwargs):
            yield {"type": "task_created", "task_id": "task-fail"}
            raise RuntimeError("agent crashed")

        app = _app()
        client = TestClient(app)
        mock_bridge = self._setup_bridge(fake_stream)
        drain_mock = AsyncMock(return_value=None)
        patches = _debug_patches(user_id=1, token="tok")

        with (
            patches[0], patches[1], patches[2],
            patch(_BRIDGE, mock_bridge),
            self._patch_db(),
            patch("pixsim7.backend.main.api.v1.ws_chat._drain_late_result", drain_mock),
        ):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "message",
                    "tab_id": "t1",
                    "message": "q",
                    "bridge_session_id": "sess-x",
                }))
                json.loads(ws.receive_text())  # task_created
                err = json.loads(ws.receive_text())
                assert err["type"] == "result"
                assert err["ok"] is False
                assert "agent crashed" in err["error"]

        drain_mock.assert_not_called()
