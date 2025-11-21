"""
WebSocket Contract Tests

Tests to ensure WebSocket message handling is robust to keep-alive frames
(ping/pong) and enforces message envelopes for JSON traffic.

Part of Phase 31.2 - WebSocket Contract & Keep-Alive Tests.
"""

import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    """Create a test client with the FastAPI app"""
    from pixsim7.backend.main.main import app
    return TestClient(app)


class TestWebSocketKeepAlive:
    """Test WebSocket keep-alive (ping/pong) handling"""

    def test_ping_pong_without_error(self, client):
        """
        Test that WebSocket can handle ping/pong keep-alive without errors.

        The endpoint should respond to 'ping' with 'pong' without trying
        to parse it as JSON.
        """
        with client.websocket_connect("/api/v1/ws/generations") as websocket:
            # Receive welcome message
            data = websocket.receive_text()
            welcome = json.loads(data)

            assert welcome["type"] == "connected", "Should receive connected message"
            assert "message" in welcome

            # Send ping
            websocket.send_text("ping")

            # Should receive pong
            response = websocket.receive_text()
            assert response == "pong", "Should receive plain 'pong' response"

    def test_multiple_pings(self, client):
        """Test handling multiple ping/pong cycles"""
        with client.websocket_connect("/api/v1/ws/events") as websocket:
            # Receive welcome message
            welcome_data = websocket.receive_text()
            welcome = json.loads(welcome_data)
            assert welcome["type"] == "connected"

            # Send multiple pings
            for i in range(3):
                websocket.send_text("ping")
                response = websocket.receive_text()
                assert response == "pong", f"Ping {i+1} should get pong response"


class TestWebSocketMessageEnvelope:
    """Test WebSocket message envelope structure"""

    def test_welcome_message_has_type_field(self, client):
        """
        Test that welcome message conforms to envelope structure.

        All JSON messages should have a 'type' field.
        """
        with client.websocket_connect("/api/v1/ws/generations") as websocket:
            data = websocket.receive_text()
            message = json.loads(data)

            assert "type" in message, "Message should have 'type' field"
            assert message["type"] == "connected"
            assert isinstance(message.get("user_id"), (int, type(None)))

    def test_events_welcome_message_structure(self, client):
        """Test events endpoint welcome message structure"""
        with client.websocket_connect("/api/v1/ws/events") as websocket:
            data = websocket.receive_text()
            message = json.loads(data)

            assert "type" in message, "Message should have 'type' field"
            assert message["type"] == "connected"


class TestWebSocketMessageTypes:
    """Test WebSocket message type validation (backend)"""

    def test_is_keep_alive_function(self):
        """Test the is_keep_alive helper function"""
        from pixsim7.backend.main.infrastructure.websocket.types import is_keep_alive

        assert is_keep_alive("ping") is True
        assert is_keep_alive("pong") is True
        assert is_keep_alive("PING") is False
        assert is_keep_alive('{"type": "test"}') is False
        assert is_keep_alive("") is False

    def test_message_validation(self):
        """Test WebSocket message validation"""
        from pixsim7.backend.main.infrastructure.websocket.types import (
            validate_message,
            WebSocketMessage,
        )

        # Valid message
        valid_msg = {"type": "test", "payload": {"data": "test"}}
        result = validate_message(valid_msg)
        assert isinstance(result, WebSocketMessage)
        assert result.type == "test"

        # Invalid message (missing type)
        with pytest.raises(ValueError, match="missing required 'type' field"):
            validate_message({"payload": "test"})

    def test_connected_message_type(self):
        """Test ConnectedMessage envelope"""
        from pixsim7.backend.main.infrastructure.websocket.types import ConnectedMessage

        msg = ConnectedMessage(
            type="connected",
            message="Welcome",
            user_id=123,
        )

        assert msg.type == "connected"
        assert msg.message == "Welcome"
        assert msg.user_id == 123

        # Serialize to dict
        data = msg.model_dump()
        assert data["type"] == "connected"
        assert "message" in data


class TestFrontendWebSocketTypes:
    """Test frontend WebSocket type utilities"""

    @pytest.mark.skip(reason="TypeScript tests - requires TS test runner")
    def test_parse_websocket_message_typescript(self):
        """
        Placeholder for TypeScript tests.

        These should be run with a TypeScript test runner (Vitest, Jest, etc.)
        to test the parseWebSocketMessage and isWebSocketMessage functions.

        Key test cases:
        - parseWebSocketMessage('pong') should return null
        - parseWebSocketMessage('ping') should return null
        - parseWebSocketMessage('{"type": "test"}') should return parsed object
        - parseWebSocketMessage('{"no_type": true}') should throw error
        - isWebSocketMessage({type: 'test'}) should return true
        - isWebSocketMessage({no_type: true}) should return false
        """
        pass


class TestWebSocketRobustness:
    """Test WebSocket error handling and robustness"""

    def test_connection_survives_ping_pong(self, client):
        """
        Test that connection remains stable through ping/pong cycles.

        This is a regression test for issues where ping/pong caused
        disconnections due to JSON parsing errors.
        """
        with client.websocket_connect("/api/v1/ws/generations") as websocket:
            # Receive welcome
            welcome_data = websocket.receive_text()
            welcome = json.loads(welcome_data)
            assert welcome["type"] == "connected"

            # Multiple ping/pong cycles
            for _ in range(5):
                websocket.send_text("ping")
                pong = websocket.receive_text()
                assert pong == "pong"

            # Connection should still be alive
            # Send another ping to verify
            websocket.send_text("ping")
            pong = websocket.receive_text()
            assert pong == "pong", "Connection should still be alive after multiple pings"
