"""Tests for bridge preamble injection and task metadata extraction.

These tests verify that:
- System prompt is NOT duplicated for Claude sessions (it goes via --append-system-prompt)
- System prompt IS injected in preamble for Codex sessions (no CLI flag support)
- Persona and token are always injected in preamble for new conversations
- Preamble is skipped for resumed conversations (bridge_session_id present)
- _extract_task_meta correctly parses scope, plan, engine, model
"""
import pytest

from pixsim7.client.bridge import Bridge
from pixsim7.client.agent_pool import AgentPool


def _make_bridge() -> Bridge:
    """Create a bridge with a dummy pool (no real sessions needed)."""
    pool = AgentPool(command="claude", max_sessions=0)
    bridge = Bridge(pool, url="ws://localhost:8000/api/v1/ws/agent-cmd")
    bridge._system_prompt = "You are a helpful assistant.\nEndpoints: GET /api/v1/foo"
    return bridge


class TestExtractTaskMeta:
    """Tests for Bridge._extract_task_meta."""

    def test_extracts_engine(self):
        bridge = _make_bridge()
        meta = bridge._extract_task_meta({"engine": "codex"})
        assert meta["engine"] == "codex"

    def test_extracts_model(self):
        bridge = _make_bridge()
        meta = bridge._extract_task_meta({"model": "opus"})
        assert meta["model"] == "opus"

    def test_default_model_normalized(self):
        bridge = _make_bridge()
        meta = bridge._extract_task_meta({"model": "default"})
        assert meta["model"] is None

    def test_extracts_plan_from_context(self):
        bridge = _make_bridge()
        meta = bridge._extract_task_meta({
            "context": {"plan_id": "my-plan"},
            "scope_key": "plan:my-plan",
        })
        assert meta["plan_id"] == "my-plan"

    def test_extracts_plan_from_scope_key_fallback(self):
        bridge = _make_bridge()
        meta = bridge._extract_task_meta({
            "context": {},
            "scope_key": "plan:agent-profiles-v1",
        })
        assert meta["plan_id"] == "agent-profiles-v1"

    def test_extracts_profile_prompt(self):
        bridge = _make_bridge()
        meta = bridge._extract_task_meta({"profile_prompt": "You are a pirate."})
        assert meta["profile_prompt"] == "You are a pirate."

    def test_session_policy(self):
        bridge = _make_bridge()
        meta = bridge._extract_task_meta({"session_policy": "scoped"})
        assert meta["session_policy"] == "scoped"

    def test_scope_key(self):
        bridge = _make_bridge()
        meta = bridge._extract_task_meta({"scope_key": "tab:tab-123"})
        assert meta["scope_key"] == "tab:tab-123"


class TestPreambleInjection:
    """Tests for preamble construction in Bridge._handle_task.

    We can't easily call _handle_task (needs WS), so we test the
    preamble logic by simulating the same conditional block.
    """

    def _build_preamble(
        self,
        bridge: Bridge,
        *,
        engine: str = "claude",
        bridge_session_id: str | None = None,
        profile_prompt: str | None = None,
        user_token: str | None = None,
    ) -> str | None:
        """Simulate the preamble injection logic from _handle_task."""
        prompt = "Hello, help me with something."
        meta = {
            "engine": engine,
            "bridge_session_id": bridge_session_id,
            "profile_prompt": profile_prompt,
        }

        if not meta["bridge_session_id"]:
            preamble_parts: list[str] = []
            eng = meta.get("engine") or ""
            if bridge._system_prompt and eng not in ("claude", ""):
                preamble_parts.append(f"[System context]\n{bridge._system_prompt}")
            if meta["profile_prompt"]:
                preamble_parts.append(f"[Persona: {meta['profile_prompt']}]")
            if user_token:
                preamble_parts.append(
                    f"[Agent Token]\n"
                    f"Use this token for PixSim MCP tools. Your MCP tools are already configured with it.\n"
                    f"Token: {user_token}"
                )
            if preamble_parts:
                prompt = "\n\n".join(preamble_parts) + "\n\n" + prompt
        return prompt

    def test_claude_no_system_prompt_in_preamble(self):
        """Claude sessions should NOT get system prompt in preamble."""
        bridge = _make_bridge()
        result = self._build_preamble(bridge, engine="claude")
        assert "[System context]" not in result

    def test_claude_empty_engine_no_system_prompt(self):
        """Empty engine (defaults to claude) should NOT get system prompt."""
        bridge = _make_bridge()
        result = self._build_preamble(bridge, engine="")
        assert "[System context]" not in result

    def test_codex_gets_system_prompt_in_preamble(self):
        """Codex sessions SHOULD get system prompt in preamble."""
        bridge = _make_bridge()
        result = self._build_preamble(bridge, engine="codex")
        assert "[System context]" in result
        assert "You are a helpful assistant." in result

    def test_persona_always_injected_for_new_session(self):
        """Persona is injected regardless of engine."""
        bridge = _make_bridge()
        for engine in ("claude", "codex", ""):
            result = self._build_preamble(bridge, engine=engine, profile_prompt="You are a pirate.")
            assert "[Persona: You are a pirate.]" in result, f"Failed for engine={engine!r}"

    def test_token_always_injected_for_new_session(self):
        """Token is injected regardless of engine."""
        bridge = _make_bridge()
        result = self._build_preamble(bridge, engine="claude", user_token="abc123")
        assert "Token: abc123" in result

    def test_no_preamble_for_resumed_session(self):
        """Resumed sessions (bridge_session_id set) get no preamble."""
        bridge = _make_bridge()
        result = self._build_preamble(
            bridge,
            engine="claude",
            bridge_session_id="existing-session-uuid",
            profile_prompt="You are a pirate.",
            user_token="abc123",
        )
        # Should be just the raw prompt — no preamble injected
        assert result == "Hello, help me with something."

    def test_no_preamble_when_nothing_to_inject(self):
        """No preamble if no system prompt, no persona, no token."""
        bridge = Bridge(AgentPool(command="claude", max_sessions=0), url="ws://localhost:8000/api/v1/ws/agent-cmd")
        # No system prompt set
        result = self._build_preamble(bridge, engine="claude")
        assert result == "Hello, help me with something."
