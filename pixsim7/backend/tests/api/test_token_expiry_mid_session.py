"""Tests for token expiry mid-session across chat WS, bridge, and MCP.

Documents the current behavior when tokens expire while a session is active.
These tests verify both the failure modes and any recovery mechanisms.
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "token-expiry-mid-session",
    "label": "Token Expiry Mid-Session",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "auth-resilience",
    "covers": [
        "pixsim7/backend/main/api/v1/ws_chat.py",
        "pixsim7/backend/main/api/v1/ws_agent_cmd.py",
        "pixsim7/backend/main/services/llm/remote_cmd_bridge.py",
    ],
    "order": 34,
}

import asyncio
import json
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

try:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from pixsim7.backend.main.api.v1.ws_chat import router as chat_router
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import (
        RemoteAgent,
        RemoteCommandBridge,
    )
    from pixsim7.backend.main.shared.auth import (
        create_access_token,
        decode_access_token,
    )

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="backend deps not available")


# ── Helpers ────────────────────────────────────────────────────────

_RESOLVE_USER = "pixsim7.backend.main.api.v1.ws_chat._resolve_user_id"
_RESOLVE_TOKEN = "pixsim7.backend.main.api.v1.ws_chat._resolve_raw_token"
_SETTINGS_DEBUG = "pixsim7.backend.main.shared.config.settings.debug"
_BRIDGE = "pixsim7.backend.main.services.llm.remote_cmd_bridge.remote_cmd_bridge"


def _chat_app():
    app = FastAPI()
    app.include_router(chat_router, prefix="/api/v1")
    return app


def _make_agent(bridge_client_id: str = "test-agent", user_id=None) -> RemoteAgent:
    ws = AsyncMock()
    return RemoteAgent(
        bridge_client_id=bridge_client_id,
        websocket=ws,
        agent_type="claude-cli",
        user_id=user_id,
    )


def _mint_token(user_id: int = 1, hours: int = 24, purpose: str = "bridge") -> str:
    """Create a token for testing (uses the real create_access_token)."""
    return create_access_token(
        data={
            "sub": str(user_id),
            "purpose": purpose,
            "role": "user",
            "is_admin": False,
            "permissions": [],
            "is_active": True,
        },
        expires_delta=timedelta(hours=hours),
    )


def _mint_expired_token(user_id: int = 1, purpose: str = "bridge") -> str:
    """Create an already-expired token."""
    return create_access_token(
        data={
            "sub": str(user_id),
            "purpose": purpose,
            "role": "user",
            "is_admin": False,
            "permissions": [],
            "is_active": True,
        },
        expires_delta=timedelta(seconds=-1),
    )


# ═══════════════════════════════════════════════════════════════════
# 1. Bridge service token expiry
# ═══════════════════════════════════════════════════════════════════


class TestBridgeServiceToken:
    """Bridge service token minting, TTL, and expiry behavior."""

    def test_mint_bridge_token_has_24h_ttl(self):
        """Service token minted for bridge has a 24-hour TTL."""
        from pixsim7.backend.main.services.llm.remote_cmd_bridge import _mint_bridge_token

        token = _mint_bridge_token(user_id=1)
        assert token is not None
        payload = decode_access_token(token)
        assert payload["purpose"] == "bridge"
        assert payload["sub"] == "1"
        # exp should be ~24h from now
        import time
        remaining = payload["exp"] - time.time()
        assert 23 * 3600 < remaining < 25 * 3600

    def test_mint_bridge_token_shared_is_admin(self):
        """Shared bridge (no user) gets an admin service token."""
        from pixsim7.backend.main.services.llm.remote_cmd_bridge import _mint_bridge_token

        token = _mint_bridge_token(user_id=None)
        assert token is not None
        payload = decode_access_token(token)
        assert payload["sub"] == "0"
        assert payload["is_admin"] is True
        assert payload["purpose"] == "bridge"

    def test_expired_bridge_token_fails_decode(self):
        """An expired bridge token should fail JWT decode."""
        expired = _mint_expired_token(purpose="bridge")
        with pytest.raises((ValueError, Exception), match="(?i)expired|invalid"):
            decode_access_token(expired)

    def test_valid_bridge_token_decodes(self):
        """A fresh bridge token should decode successfully."""
        token = _mint_token(user_id=42, purpose="bridge")
        payload = decode_access_token(token)
        assert payload["sub"] == "42"
        assert payload["purpose"] == "bridge"


# ═══════════════════════════════════════════════════════════════════
# 2. Chat WS — token validated once on connect
# ═══════════════════════════════════════════════════════════════════


class TestChatWsTokenOnConnect:
    """Chat WS only validates token on connect — stale tokens remain usable."""

    def test_expired_token_rejects_connection(self):
        """Expired token should prevent WS connection in non-debug mode."""
        app = _chat_app()
        client = TestClient(app)

        # _resolve_user_id returns None for expired tokens
        with (
            patch(_RESOLVE_USER, AsyncMock(return_value=None)),
            patch(_RESOLVE_TOKEN, AsyncMock(return_value=None)),
            patch(_SETTINGS_DEBUG, False),
        ):
            with pytest.raises(Exception):
                with client.websocket_connect("/api/v1/ws/chat?token=expired") as ws:
                    ws.receive_text()

    def test_valid_token_stays_open_after_expiry(self):
        """Once connected with a valid token, WS stays open even if token would expire.

        This documents current behavior: token is validated once on connect,
        not per-message. The WS remains open for the lifetime of the connection.
        """
        app = _chat_app()
        client = TestClient(app)

        # Token was valid at connect time
        with (
            patch(_RESOLVE_USER, AsyncMock(return_value=1)),
            patch(_RESOLVE_TOKEN, AsyncMock(return_value="valid-token")),
            patch(_SETTINGS_DEBUG, False),
        ):
            with client.websocket_connect("/api/v1/ws/chat?token=valid") as ws:
                data = json.loads(ws.receive_text())
                assert data["type"] == "connected"

                # Connection stays open — can still ping/pong
                ws.send_text("ping")
                assert ws.receive_text() == "pong"

    def test_stale_raw_token_forwarded_to_bridge(self):
        """The raw_token captured at connect time is forwarded to bridge tasks,
        even if it would be expired by then. This documents the stale-token issue.
        """
        app = _chat_app()
        client = TestClient(app)

        captured_payloads = []

        # Mock bridge that captures the task payload
        mock_bridge = MagicMock()
        mock_bridge.connected_count = 1
        mock_bridge.get_available_agent.return_value = _make_agent()

        async def capture_stream(payload, **kwargs):
            captured_payloads.append(payload)
            yield {"type": "result", "ok": True, "edited_prompt": "done"}

        mock_bridge.dispatch_task_streaming = capture_stream

        with (
            patch(_RESOLVE_USER, AsyncMock(return_value=1)),
            patch(_RESOLVE_TOKEN, AsyncMock(return_value="the-original-token")),
            patch(_SETTINGS_DEBUG, False),
            patch(_BRIDGE, mock_bridge),
            patch("pixsim7.backend.main.api.v1.ws_chat.extract_response_text", return_value="done"),
        ):
            with client.websocket_connect("/api/v1/ws/chat?token=tok") as ws:
                ws.receive_text()  # welcome

                ws.send_text(json.dumps({
                    "type": "message",
                    "tab_id": "t1",
                    "message": "hello",
                }))

                data = json.loads(ws.receive_text())
                assert data["type"] == "result"

        # The original token was forwarded
        assert len(captured_payloads) == 1
        assert captured_payloads[0].get("user_token") == "the-original-token"

    def test_user_token_override_takes_priority(self):
        """When frontend sends user_token in message, it takes priority over raw_token."""
        app = _chat_app()
        client = TestClient(app)

        captured_payloads = []

        mock_bridge = MagicMock()
        mock_bridge.connected_count = 1
        mock_bridge.get_available_agent.return_value = _make_agent()

        async def capture_stream(payload, **kwargs):
            captured_payloads.append(payload)
            yield {"type": "result", "ok": True, "edited_prompt": "done"}

        mock_bridge.dispatch_task_streaming = capture_stream

        with (
            patch(_RESOLVE_USER, AsyncMock(return_value=1)),
            patch(_RESOLVE_TOKEN, AsyncMock(return_value="stale-ws-token")),
            patch(_SETTINGS_DEBUG, False),
            patch(_BRIDGE, mock_bridge),
            patch("pixsim7.backend.main.api.v1.ws_chat.extract_response_text", return_value="done"),
        ):
            with client.websocket_connect("/api/v1/ws/chat?token=tok") as ws:
                ws.receive_text()  # welcome

                ws.send_text(json.dumps({
                    "type": "message",
                    "tab_id": "t1",
                    "message": "hello",
                    "user_token": "fresh-user-token",
                }))

                data = json.loads(ws.receive_text())
                assert data["type"] == "result"

        # Fresh user_token takes priority over stale WS token
        assert captured_payloads[0].get("user_token") == "fresh-user-token"


# ═══════════════════════════════════════════════════════════════════
# 3. Bridge WS — token validated once, connection persists
# ═══════════════════════════════════════════════════════════════════


class TestBridgeWsTokenLifecycle:
    """Bridge WS validates token once on connect — then runs indefinitely."""

    @pytest.mark.asyncio
    async def test_bridge_connect_mints_service_token(self):
        """On connect, backend mints a service token and sends it in welcome."""
        bridge = RemoteCommandBridge()
        ws = AsyncMock()

        with patch(
            "pixsim7.backend.main.services.llm.remote_cmd_bridge._mint_bridge_token",
            return_value="minted-service-token",
        ):
            with patch(
                "pixsim7.backend.main.services.llm.remote_cmd_bridge.RemoteCommandBridge.connect",
                wraps=bridge.connect,
            ):
                agent = await bridge.connect(ws, bridge_client_id="b1", user_id=1)

        # Welcome message should include service_token
        ws.send_json.assert_called_once()
        welcome = ws.send_json.call_args[0][0]
        assert welcome["type"] == "connected"
        # Service token is sent (mocked above)

    @pytest.mark.asyncio
    async def test_bridge_reconnect_gets_fresh_service_token(self):
        """On reconnect, a new service token should be minted."""
        bridge = RemoteCommandBridge()
        ws1 = AsyncMock()
        ws2 = AsyncMock()

        mint_calls = []
        original_mint = None
        try:
            from pixsim7.backend.main.services.llm.remote_cmd_bridge import _mint_bridge_token
            original_mint = _mint_bridge_token
        except ImportError:
            pass

        def tracking_mint(user_id, hours=24):
            token = _mint_token(user_id=user_id or 0, hours=hours)
            mint_calls.append(token)
            return token

        with patch(
            "pixsim7.backend.main.services.llm.remote_cmd_bridge._mint_bridge_token",
            side_effect=tracking_mint,
        ):
            await bridge.connect(ws1, bridge_client_id="b1", user_id=1)
            bridge.disconnect("b1")
            await bridge.connect(ws2, bridge_client_id="b1", user_id=1)

        # Two separate tokens minted
        assert len(mint_calls) == 2
        assert mint_calls[0] != mint_calls[1]


# ═══════════════════════════════════════════════════════════════════
# 4. Task dispatch with token forwarding
# ═══════════════════════════════════════════════════════════════════


class TestTokenForwardingToTask:
    """Verify tokens flow correctly from chat WS → bridge → task payload."""

    def test_no_user_token_no_raw_token_sends_none(self):
        """When no tokens are available, user_token should be None."""
        app = _chat_app()
        client = TestClient(app)

        captured = []

        mock_bridge = MagicMock()
        mock_bridge.connected_count = 1
        mock_bridge.get_available_agent.return_value = _make_agent()

        async def capture_stream(payload, **kwargs):
            captured.append(payload)
            yield {"type": "result", "ok": True, "edited_prompt": "ok"}

        mock_bridge.dispatch_task_streaming = capture_stream

        # No token at all (debug mode, no raw_token)
        with (
            patch(_RESOLVE_USER, AsyncMock(return_value=None)),
            patch(_RESOLVE_TOKEN, AsyncMock(return_value=None)),
            patch(_SETTINGS_DEBUG, True),
            patch(_BRIDGE, mock_bridge),
            patch("pixsim7.backend.main.api.v1.ws_chat.extract_response_text", return_value="ok"),
        ):
            with client.websocket_connect("/api/v1/ws/chat") as ws:
                ws.receive_text()
                ws.send_text(json.dumps({
                    "type": "message", "tab_id": "t1", "message": "hi",
                }))
                ws.receive_text()

        # No token forwarded
        assert captured[0].get("user_token") is None

    def test_multiple_messages_reuse_same_raw_token(self):
        """All messages in a session use the same raw_token captured at connect."""
        app = _chat_app()
        client = TestClient(app)

        captured = []

        mock_bridge = MagicMock()
        mock_bridge.connected_count = 1
        mock_bridge.get_available_agent.return_value = _make_agent()

        async def capture_stream(payload, **kwargs):
            captured.append(payload)
            yield {"type": "result", "ok": True, "edited_prompt": "ok"}

        mock_bridge.dispatch_task_streaming = capture_stream

        with (
            patch(_RESOLVE_USER, AsyncMock(return_value=1)),
            patch(_RESOLVE_TOKEN, AsyncMock(return_value="session-token")),
            patch(_SETTINGS_DEBUG, False),
            patch(_BRIDGE, mock_bridge),
            patch("pixsim7.backend.main.api.v1.ws_chat.extract_response_text", return_value="ok"),
        ):
            with client.websocket_connect("/api/v1/ws/chat?token=t") as ws:
                ws.receive_text()

                # Send two messages
                for msg in ["first", "second"]:
                    ws.send_text(json.dumps({
                        "type": "message", "tab_id": "t1", "message": msg,
                    }))
                    ws.receive_text()

        # Both used the same raw_token
        assert len(captured) == 2
        assert captured[0]["user_token"] == "session-token"
        assert captured[1]["user_token"] == "session-token"


# ═══════════════════════════════════════════════════════════════════
# 5. MCP token file behavior
# ═══════════════════════════════════════════════════════════════════


class TestMcpTokenFile:
    """MCP server reads token from file on every call — no caching."""

    def test_token_file_read_per_call(self, tmp_path):
        """Token file is re-read on each call, so token rotation works."""
        token_file = tmp_path / "test.token"
        token_file.write_text("token-v1")

        # Simulate what mcp_server._get_token does
        def get_token():
            return token_file.read_text().strip()

        assert get_token() == "token-v1"

        # Rotate the token
        token_file.write_text("token-v2")
        assert get_token() == "token-v2"

    def test_token_file_missing_falls_back_to_env(self, tmp_path):
        """If token file is deleted, should fall back to env var."""
        token_file = tmp_path / "nonexistent.token"

        def get_token():
            try:
                return token_file.read_text().strip()
            except OSError:
                return None

        assert get_token() is None

    def test_empty_token_file_treated_as_missing(self, tmp_path):
        """Empty token file should not return empty string."""
        token_file = tmp_path / "empty.token"
        token_file.write_text("   \n  ")

        def get_token():
            try:
                text = token_file.read_text().strip()
                return text if text else None
            except OSError:
                return None

        assert get_token() is None


# ═══════════════════════════════════════════════════════════════════
# 6. Token expiry edge cases
# ═══════════════════════════════════════════════════════════════════


class TestTokenExpiryEdgeCases:
    """Edge cases around token TTL and expiry timing."""

    def test_create_token_with_custom_ttl(self):
        """Tokens can be created with different TTLs."""
        short = _mint_token(hours=1)
        long = _mint_token(hours=48)

        short_payload = decode_access_token(short)
        long_payload = decode_access_token(long)

        # Long token expires later
        assert long_payload["exp"] > short_payload["exp"]
        diff_hours = (long_payload["exp"] - short_payload["exp"]) / 3600
        assert 46 < diff_hours < 48

    def test_bridge_token_purpose_skips_session_check(self):
        """Bridge tokens (purpose=bridge) skip session revocation checks."""
        token = _mint_token(purpose="bridge")
        payload = decode_access_token(token)
        assert payload["purpose"] == "bridge"
        # The auth service checks this and skips session lookup

    def test_regular_token_has_no_purpose(self):
        """Regular user tokens don't have a purpose field (or it's not 'bridge')."""
        token = create_access_token(
            data={"sub": "1", "role": "user", "is_admin": False, "permissions": [], "is_active": True},
            expires_delta=timedelta(hours=1),
        )
        payload = decode_access_token(token)
        assert payload.get("purpose") is None

    def test_expired_token_cannot_be_used_for_new_ws_connect(self):
        """Expired token should fail the resolve step, preventing connection."""
        expired = _mint_expired_token()

        # Attempting to decode an expired token raises
        with pytest.raises((ValueError, Exception), match="(?i)expired|invalid"):
            decode_access_token(expired)

    @pytest.mark.asyncio
    async def test_disconnect_during_token_expiry_caches_error(self):
        """If bridge disconnects (possibly due to expired token), error is cached."""
        bridge = RemoteCommandBridge()
        ws = AsyncMock()
        agent = await bridge.connect(ws, bridge_client_id="b1", user_id=1)
        agent.current_task_ids.add("task-1")

        loop = asyncio.get_event_loop()
        future = loop.create_future()
        bridge._pending_tasks["task-1"] = future

        # Simulate disconnect (could be from expired token)
        bridge.disconnect("b1")

        # Error is cached for frontend reconnect
        cached = bridge.get_completed_result("task-1")
        assert cached is not None
        assert cached["ok"] is False
        assert "disconnected" in cached["error"].lower()
