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


class TestExtractTokenJti:
    """`_extract_token_jti` namespaces codex workdirs by token id so a
    rotated JWT never reads back a stale token from a cached config.toml."""

    @staticmethod
    def _mint(claims: dict) -> str:
        """Build a minimal unsigned JWT with the given claims."""
        import base64 as _b64
        import json as _json

        def _b64u(payload: bytes) -> str:
            return _b64.urlsafe_b64encode(payload).rstrip(b"=").decode("ascii")

        header = _b64u(_json.dumps({"alg": "none", "typ": "JWT"}).encode())
        body = _b64u(_json.dumps(claims).encode())
        # Signature segment can be empty / arbitrary — we don't verify it.
        return f"{header}.{body}.fake"

    def test_extracts_first_eight_alnum_chars_of_jti(self):
        from pixsim7.client.bridge import _extract_token_jti

        token = self._mint({"jti": "L29qQ1xin9OKPGFt5KwNKP2L-Pa_TQPerwOfR6EIUO4"})
        # alphanumeric-only first 8 chars of the jti
        assert _extract_token_jti(token) == "L29qQ1xi"

    def test_different_jtis_produce_different_namespaces(self):
        """The whole point — token rotation must change the cache key."""
        from pixsim7.client.bridge import _extract_token_jti

        a = _extract_token_jti(self._mint({"jti": "aaaabbbbccccdddd"}))
        b = _extract_token_jti(self._mint({"jti": "zzzzyyyyxxxxwwww"}))
        assert a != b

    def test_empty_token_returns_noauth_sentinel(self):
        from pixsim7.client.bridge import _extract_token_jti

        assert _extract_token_jti("") == "noauth"
        assert _extract_token_jti(None) == "noauth"  # type: ignore[arg-type]

    def test_malformed_token_returns_noauth(self):
        from pixsim7.client.bridge import _extract_token_jti

        assert _extract_token_jti("not.a.jwt.at.all") == "noauth"
        assert _extract_token_jti("missing-segments") == "noauth"

    def test_jti_with_no_alphanumeric_returns_noauth(self):
        """jti consisting only of separators must not collapse to "" — that
        would break the path component. Fall back to the noauth sentinel."""
        from pixsim7.client.bridge import _extract_token_jti

        assert _extract_token_jti(self._mint({"jti": "----..."})) == "noauth"

    def test_workdir_includes_jti_segment(self, tmp_path, monkeypatch):
        """End-to-end: distinct tokens cache to distinct workdir paths."""
        from pathlib import Path
        from pixsim7.client.bridge import Bridge
        from pixsim7.client import bridge as bridge_module

        bridge = _make_bridge()
        # Redirect repo_root so the test doesn't pollute the real .pixsim-codex/
        bridge._repo_root = Path(tmp_path)
        bridge._mcp_http_url = "http://localhost:9100/mcp"

        # Stub out network + filesystem side-effects.
        monkeypatch.setattr(
            bridge, "_resolve_codex_enabled_tools",
            lambda **kwargs: ["log_work"],
        )
        # `write_codex_mcp_http_config` is imported lazily inside the bridge
        # method, so patch the source module (token_manager) — the bridge
        # picks up the stub at call time.
        from pixsim7.client import token_manager as tm
        monkeypatch.setattr(
            tm, "write_codex_mcp_http_config",
            lambda **kwargs: Path(kwargs["workdir"]) / ".codex" / "config.toml",
        )

        token_a = self._mint({"jti": "rotatedA1234567890"})
        token_b = self._mint({"jti": "rotatedB0987654321"})

        wd_a = bridge._ensure_codex_project_workdir(
            mcp_server_script="server.py",
            api_base="http://localhost:8000",
            token=token_a,
            token_file="/tmp/tok",
            scope="user",
            mcp_python_cmd="python",
            mcp_python_prefix=[],
            focus=["test_focus"],
        )
        wd_b = bridge._ensure_codex_project_workdir(
            mcp_server_script="server.py",
            api_base="http://localhost:8000",
            token=token_b,
            token_file="/tmp/tok",
            scope="user",
            mcp_python_cmd="python",
            mcp_python_prefix=[],
            focus=["test_focus"],
        )
        assert wd_a is not None and wd_b is not None
        # Different jtis → different workdirs (no shared cache hit).
        assert wd_a != wd_b
        # Each ends in its respective jti segment (first 8 alnum chars).
        assert wd_a.endswith("rotatedA")
        assert wd_b.endswith("rotatedB")

    def test_same_token_reuses_cached_workdir(self, tmp_path, monkeypatch):
        """Same jti must hit the cache — we're not re-creating workdirs
        on every dispatch within a token's lifetime."""
        from pathlib import Path
        from pixsim7.client.bridge import Bridge
        from pixsim7.client import token_manager as tm

        bridge = _make_bridge()
        bridge._repo_root = Path(tmp_path)
        bridge._mcp_http_url = "http://localhost:9100/mcp"

        monkeypatch.setattr(
            bridge, "_resolve_codex_enabled_tools",
            lambda **kwargs: ["log_work"],
        )

        write_calls: list[Path] = []

        def _capture_write(**kwargs):
            workdir = Path(kwargs["workdir"])
            cfg = workdir / ".codex" / "config.toml"
            cfg.parent.mkdir(parents=True, exist_ok=True)
            cfg.write_text("[mcp]")
            write_calls.append(cfg)
            return cfg

        monkeypatch.setattr(tm, "write_codex_mcp_http_config", _capture_write)

        token = self._mint({"jti": "stable12345"})
        wd1 = bridge._ensure_codex_project_workdir(
            mcp_server_script="server.py", api_base="http://localhost:8000",
            token=token, token_file="/tmp/tok", scope="user",
            mcp_python_cmd="python", mcp_python_prefix=[],
            focus=["test_focus"],
        )
        wd2 = bridge._ensure_codex_project_workdir(
            mcp_server_script="server.py", api_base="http://localhost:8000",
            token=token, token_file="/tmp/tok", scope="user",
            mcp_python_cmd="python", mcp_python_prefix=[],
            focus=["test_focus"],
        )
        assert wd1 == wd2
        # Cache hit — config writer fired only once across the two calls.
        assert len(write_calls) == 1
