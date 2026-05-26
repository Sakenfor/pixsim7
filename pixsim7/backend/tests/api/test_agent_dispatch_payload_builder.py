"""Tests for agent dispatch payload builder scope/policy derivation."""

from __future__ import annotations

TEST_SUITE = {
    "id": "agent-dispatch-payload-builder",
    "label": "Agent Dispatch Payload Builder Tests",
    "kind": "unit",
    "category": "backend/shared",
    "subcategory": "agent-dispatch",
    "covers": [
        "pixsim7/backend/main/shared/agent_dispatch.py",
    ],
    "order": 18.6,
}

import pytest

try:
    from pixsim7.backend.main.shared.agent_dispatch import build_task_payload

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="backend deps not available")


class TestBuildTaskPayload:
    def test_sets_bridge_session_id(self):
        payload = build_task_payload(
            prompt="hello",
            bridge_session_id="sess-canonical",
        )
        assert payload["bridge_session_id"] == "sess-canonical"

    def test_preserves_explicit_scope_and_policy(self):
        payload = build_task_payload(
            prompt="hello",
            context={"plan_id": "plan-from-context"},
            scope_key="plan:manual",
            session_policy="persistent",
        )
        assert payload["scope_key"] == "plan:manual"
        assert payload["session_policy"] == "persistent"

    def test_derives_scope_from_plan_context(self):
        payload = build_task_payload(
            prompt="hello",
            context={"plan_id": "unified-task-agent-architecture"},
        )
        assert payload["scope_key"] == "plan:unified-task-agent-architecture"
        assert payload["session_policy"] == "scoped"

    def test_derives_scope_from_contract_context_alias(self):
        payload = build_task_payload(
            prompt="hello",
            context={"contractId": "notifications.emit"},
        )
        assert payload["scope_key"] == "contract:notifications.emit"
        assert payload["session_policy"] == "scoped"

    def test_scope_key_from_context_passthrough(self):
        payload = build_task_payload(
            prompt="hello",
            context={"scopeKey": "plan:explicit-context-key"},
        )
        assert payload["scope_key"] == "plan:explicit-context-key"
        assert payload["session_policy"] == "scoped"

    def test_no_scope_does_not_force_policy(self):
        payload = build_task_payload(
            prompt="hello",
            context={"foo": "bar"},
        )
        assert "scope_key" not in payload
        assert "session_policy" not in payload

    def test_includes_profile_id_when_present(self):
        payload = build_task_payload(
            prompt="hello",
            profile_id="assistant:codex",
        )
        assert payload["profile_id"] == "assistant:codex"

    def test_omits_profile_id_when_unknown_sentinel(self):
        payload = build_task_payload(
            prompt="hello",
            profile_id="unknown",
        )
        assert "profile_id" not in payload


class TestResolveDefaultModel:
    """Static per-engine fallback used when the bridge model catalog
    hasn't landed yet (model/list reply races first dispatch)."""

    def test_known_engines(self):
        from pixsim7.backend.main.shared.agent_dispatch import resolve_default_model

        assert resolve_default_model("claude") == "sonnet"
        assert resolve_default_model("codex") == "gpt-5.4"

    def test_strips_cli_suffix(self):
        from pixsim7.backend.main.shared.agent_dispatch import resolve_default_model

        # Bridge agent_type registers as ``codex-cli`` — must still resolve.
        assert resolve_default_model("codex-cli") == "gpt-5.4"
        assert resolve_default_model("CLAUDE-CLI") == "sonnet"

    def test_unknown_engine_returns_none(self):
        from pixsim7.backend.main.shared.agent_dispatch import resolve_default_model

        assert resolve_default_model("gemini") is None

    def test_empty_input_returns_none(self):
        from pixsim7.backend.main.shared.agent_dispatch import resolve_default_model

        assert resolve_default_model("") is None
        assert resolve_default_model(None) is None
        assert resolve_default_model("   ") is None
