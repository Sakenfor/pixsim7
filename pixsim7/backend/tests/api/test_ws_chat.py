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

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

try:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from pixsim7.backend.main.api.v1.ws_chat import router
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
                assert data["error_code"] == "bridge_unavailable"

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

    def test_unknown_assistant_id_uses_resolved_default_profile_for_session(self):
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
                    "assistant_id": "unknown",
                }))
                result = json.loads(ws.receive_text())
                assert result["type"] == "result"
                assert result["ok"] is True
                assert result["bridge_session_id"] == "sess-xyz"

        mock_resolve_profile.assert_awaited_once_with(mock_db, 7, None, agent_type="claude")
        assert mock_upsert.call_count == 1
        assert mock_upsert.call_args.kwargs["profile_id"] == "assistant:default"


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
        patches = _debug_patches(user_id=1)
        with patches[0], patches[1], patches[2], patch(_BRIDGE, mock_bridge):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()  # welcome
                ws.send_text(json.dumps({
                    "type": "reconnect", "tab_id": "t1", "task_id": "task-gone",
                }))
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
                data = json.loads(ws.receive_text())
                assert data["type"] == "result"
                assert data["ok"] is True
                assert data["response"] == "Recovered from session"
                assert data["bridge_session_id"] == "sess-tail"
                assert data["reconnected"] is True

        recover.assert_awaited_once_with("sess-tail", user_id=1)


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

        # Capture commits to a fake DB.
        fake_session = SimpleNamespace(messages=[], last_used_at=None)
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
