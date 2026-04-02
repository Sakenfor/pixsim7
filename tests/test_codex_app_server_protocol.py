"""Unit tests for Codex app-server protocol event normalization."""

from __future__ import annotations

import pytest

try:
    from pixsim7.client.protocols import CodexAppServerProtocol

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="client deps not available")


def test_turn_completed_dot_method_maps_to_result():
    protocol = CodexAppServerProtocol()
    parsed = protocol.parse_event({"method": "turn.completed", "params": {}})
    assert parsed.kind == "result"


def test_item_completed_snake_agent_message_maps_to_progress():
    protocol = CodexAppServerProtocol()
    parsed = protocol.parse_event(
        {
            "method": "item.completed",
            "params": {
                "item": {
                    "type": "agent_message",
                    "text": "Final assistant text",
                }
            },
        }
    )
    assert parsed.kind == "progress"
    assert parsed.text == "Final assistant text"


def test_item_delta_snake_method_maps_to_progress():
    protocol = CodexAppServerProtocol()
    parsed = protocol.parse_event(
        {
            "method": "item.agent_message.delta",
            "params": {"delta": "partial"},
        }
    )
    assert parsed.kind == "progress"
    assert parsed.text == "partial"


def test_turn_failed_dot_method_maps_to_error():
    protocol = CodexAppServerProtocol()
    parsed = protocol.parse_event(
        {
            "method": "turn.failed",
            "params": {"error": "tool execution failed"},
        }
    )
    assert parsed.kind == "error"
    assert "tool execution failed" in parsed.text


def test_turn_start_response_done_payload_maps_to_result():
    protocol = CodexAppServerProtocol()
    parsed = protocol.parse_event(
        {
            "id": 2,
            "result": {
                "status": "completed",
                "output": "Synchronous completion",
            },
        }
    )
    assert parsed.kind == "result"
    assert parsed.text == "Synchronous completion"
