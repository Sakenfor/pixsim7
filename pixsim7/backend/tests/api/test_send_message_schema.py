"""Tests for SendMessageRequest — schema validation, engine/persona fields."""
from __future__ import annotations

import pytest

try:
    from pixsim7.backend.main.api.v1.meta_contracts import (
        SendMessageRequest,
        _extract_chat_session_scope,
    )

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="backend deps not available")


class TestSendMessageRequest:
    """Schema validation for the AI assistant send endpoint."""

    def test_minimal(self):
        req = SendMessageRequest(message="hello")
        assert req.message == "hello"
        assert req.timeout == 120
        assert req.engine == "claude"
        assert req.skip_persona is False
        assert req.claude_session_id is None
        assert req.assistant_id is None

    def test_engine_override(self):
        req = SendMessageRequest(message="hi", engine="codex")
        assert req.engine == "codex"

    def test_api_engine(self):
        req = SendMessageRequest(message="hi", engine="api")
        assert req.engine == "api"

    def test_skip_persona(self):
        req = SendMessageRequest(message="hi", skip_persona=True)
        assert req.skip_persona is True

    def test_session_id(self):
        req = SendMessageRequest(message="hi", claude_session_id="abc-123")
        assert req.claude_session_id == "abc-123"

    def test_timeout_bounds(self):
        req = SendMessageRequest(message="hi", timeout=10)
        assert req.timeout == 10

        req = SendMessageRequest(message="hi", timeout=600)
        assert req.timeout == 600

        with pytest.raises(Exception):
            SendMessageRequest(message="hi", timeout=5)  # below min

        with pytest.raises(Exception):
            SendMessageRequest(message="hi", timeout=601)  # above max

    def test_all_fields(self):
        req = SendMessageRequest(
            message="test",
            model="gpt-4",
            timeout=60,
            assistant_id="profile-coder",
            claude_session_id="sess-abc",
            skip_persona=True,
            engine="codex",
        )
        assert req.model == "gpt-4"
        assert req.assistant_id == "profile-coder"
        assert req.engine == "codex"

    def test_extract_scope_derives_from_plan_context(self):
        req = SendMessageRequest(
            message="scope me",
            context={"plan_id": "unified-task-agent-architecture"},
        )
        scope_key, plan_id, contract_id = _extract_chat_session_scope(req)
        assert scope_key == "plan:unified-task-agent-architecture"
        assert plan_id == "unified-task-agent-architecture"
        assert contract_id is None

    def test_extract_scope_respects_explicit_scope_key(self):
        req = SendMessageRequest(
            message="scope me",
            scope_key="contract:notifications.emit",
            context={"plan_id": "plan-x", "contract_id": "contract-x"},
        )
        scope_key, plan_id, contract_id = _extract_chat_session_scope(req)
        assert scope_key == "contract:notifications.emit"
        assert plan_id == "plan-x"
        assert contract_id == "contract-x"
