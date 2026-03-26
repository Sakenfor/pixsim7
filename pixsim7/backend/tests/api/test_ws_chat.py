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
