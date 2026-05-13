"""Tests for the bridge's per-session HTTP MCP config plumbing.

Plan: ``mcp-http-bridge-session-resolution`` (checkpoint ``regression-tests``).

Covers the bridge-side machinery that makes the ``__bridge__`` sentinel
unreachable in HTTP MCP transport:

- feature-flag env-var parsing (``PIXSIM_BRIDGE_PER_SESSION_SUBPROCESS``);
- per-(chat_session_id, agent_type, focus) cache keying;
- proactive refresh when the cached JWT is within 1h of expiry;
- graceful fallback to ``None`` when minting fails (cutover seam — bridge
  dispatch should then drop back to the legacy ``_ensure_mcp_config`` path).

Mints itself are mocked; the on-disk config writer is real so the test
also covers the wiring into ``write_claude_mcp_http_config`` (the renderer
that previously got called without ``session_id`` / ``profile_id``).
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "bridge-per-session-mcp",
    "label": "Bridge per-session HTTP MCP config",
    "kind": "unit",
    "category": "client",
    "subcategory": "mcp-reliability",
    "covers": [
        "pixsim7/client/bridge.py",
        "pixsim7/client/token_manager.py",
    ],
    "order": 37,
}

import json
import os
import time
from unittest.mock import AsyncMock, patch

import pytest

from pixsim7.client.bridge import Bridge
from pixsim7.client.agent_pool import AgentPool


# ── Test isolation ───────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _isolated_mcp_config_dir(tmp_path, monkeypatch):
    """Redirect ``pixsim_mcp_config_dir()`` per-test so stable-path writes
    land in ``tmp_path`` instead of the developer's real ``~/.pixsim/mcp/``.

    Plan: launcher-health-probe-stability / stable-config-location.
    """
    monkeypatch.setenv("PIXSIM_MCP_CONFIG_DIR", str(tmp_path / "mcp"))
    yield


# ── Helpers ──────────────────────────────────────────────────────


def _make_bridge() -> Bridge:
    """Build a Bridge with the minimum state the per-session helpers touch."""
    pool = AgentPool(command="claude")
    bridge = Bridge(pool=pool, url="ws://localhost:8000/api/v1/ws/agent-cmd")
    bridge._mcp_http_url = "http://127.0.0.1:9100/mcp"
    bridge._service_token = "test-bridge-service-token"
    return bridge


def _read_config_jwt(path: str) -> str | None:
    """Pull the bearer JWT back out of a written MCP HTTP config."""
    with open(path) as f:
        cfg = json.load(f)
    headers = cfg["mcpServers"]["pixsim"].get("headers", {})
    auth = headers.get("Authorization", "")
    return auth.split(" ", 1)[1] if auth.startswith("Bearer ") else None


# ── Feature flag ─────────────────────────────────────────────────


class TestFeatureFlag:
    """``PIXSIM_BRIDGE_PER_SESSION_SUBPROCESS`` is the cutover switch.

    Default off keeps the bridge on the legacy ``_ensure_mcp_config`` path
    so a backend that hasn't shipped the bridge-session endpoint stays
    functional.
    """

    def test_default_off(self, monkeypatch):
        monkeypatch.delenv("PIXSIM_BRIDGE_PER_SESSION_SUBPROCESS", raising=False)
        assert Bridge._per_session_subprocess_enabled() is False

    @pytest.mark.parametrize("val", ["1", "true", "yes", "on", "TRUE", "On"])
    def test_truthy_values(self, monkeypatch, val):
        monkeypatch.setenv("PIXSIM_BRIDGE_PER_SESSION_SUBPROCESS", val)
        assert Bridge._per_session_subprocess_enabled() is True

    @pytest.mark.parametrize("val", ["0", "false", "no", "off", "", "maybe"])
    def test_non_truthy_values(self, monkeypatch, val):
        monkeypatch.setenv("PIXSIM_BRIDGE_PER_SESSION_SUBPROCESS", val)
        assert Bridge._per_session_subprocess_enabled() is False


# ── Per-session MCP config writer ────────────────────────────────


class TestEnsurePerSessionMcpConfig:

    @pytest.mark.asyncio
    async def test_writes_config_with_minted_jwt(self, tmp_path, monkeypatch):
        """Happy path: minted JWT lands in the Authorization header of the
        written HTTP config — this is precisely the gap the bug rested on.
        """
        bridge = _make_bridge()
        bridge._mint_agent_session_token = AsyncMock(
            return_value=("minted-jwt-abc", time.time() + 24 * 3600)
        )

        path = await bridge._ensure_per_session_mcp_config(
            chat_session_id="sess-1",
            agent_type="claude",
            profile_id="profile-x",
            tab_id="tab-1",
            scope_key="tab:tab-1",
            on_behalf_of=42,
        )
        assert path is not None
        assert os.path.exists(path)
        assert _read_config_jwt(path) == "minted-jwt-abc"
        # Cache should remember the result keyed by (session, agent, focus).
        assert ("sess-1", "claude", frozenset({"__default__"})) in bridge._per_session_mcp_cache

    @pytest.mark.asyncio
    async def test_returns_none_when_http_url_unset(self):
        """STDIO transport (no _mcp_http_url) has its own per-session
        isolation via PIXSIM_TOKEN_FILE; the helper must opt out cleanly."""
        bridge = _make_bridge()
        bridge._mcp_http_url = None
        bridge._mint_agent_session_token = AsyncMock(return_value=("x", 1))

        path = await bridge._ensure_per_session_mcp_config(
            chat_session_id="sess-stdio",
            agent_type="claude",
            profile_id="p",
        )
        assert path is None
        bridge._mint_agent_session_token.assert_not_called()

    @pytest.mark.asyncio
    async def test_different_chat_sessions_get_different_cache_entries(self):
        """Two tabs with the same focus must NOT share an MCP config — that
        was the precise mechanism behind the cross-tab __bridge__ bug."""
        bridge = _make_bridge()
        bridge._mint_agent_session_token = AsyncMock(
            side_effect=[
                ("jwt-a", time.time() + 24 * 3600),
                ("jwt-b", time.time() + 24 * 3600),
            ]
        )

        path_a = await bridge._ensure_per_session_mcp_config(
            chat_session_id="sess-A", agent_type="claude", profile_id="p",
        )
        path_b = await bridge._ensure_per_session_mcp_config(
            chat_session_id="sess-B", agent_type="claude", profile_id="p",
        )
        assert path_a != path_b
        assert _read_config_jwt(path_a) == "jwt-a"
        assert _read_config_jwt(path_b) == "jwt-b"
        assert bridge._mint_agent_session_token.call_count == 2

    @pytest.mark.asyncio
    async def test_different_agents_get_different_cache_entries(self):
        """One tab + Claude is a different subprocess from same tab + Codex.
        Cache key must include agent_type so they don't collide."""
        bridge = _make_bridge()
        bridge._mint_agent_session_token = AsyncMock(
            side_effect=[
                ("jwt-claude", time.time() + 24 * 3600),
                ("jwt-codex", time.time() + 24 * 3600),
            ]
        )

        path_claude = await bridge._ensure_per_session_mcp_config(
            chat_session_id="sess-1", agent_type="claude", profile_id="p",
        )
        path_codex = await bridge._ensure_per_session_mcp_config(
            chat_session_id="sess-1", agent_type="codex", profile_id="p",
        )
        assert path_claude != path_codex
        assert _read_config_jwt(path_claude) == "jwt-claude"
        assert _read_config_jwt(path_codex) == "jwt-codex"

    @pytest.mark.asyncio
    async def test_cache_hit_does_not_remint(self):
        """Second call with the same key reuses the cached path."""
        bridge = _make_bridge()
        bridge._mint_agent_session_token = AsyncMock(
            return_value=("jwt-once", time.time() + 24 * 3600)
        )

        path1 = await bridge._ensure_per_session_mcp_config(
            chat_session_id="sess-cached", agent_type="claude", profile_id="p",
        )
        path2 = await bridge._ensure_per_session_mcp_config(
            chat_session_id="sess-cached", agent_type="claude", profile_id="p",
        )
        assert path1 == path2
        bridge._mint_agent_session_token.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_remints_when_within_one_hour_of_expiry(self):
        """A near-expiry cached JWT must trigger a re-mint — otherwise MCP
        calls start 401'ing once the bearer expires mid-session."""
        bridge = _make_bridge()
        # First mint: expires in 30 minutes (inside the 1h refresh window).
        bridge._mint_agent_session_token = AsyncMock(
            side_effect=[
                ("jwt-stale", time.time() + 30 * 60),
                ("jwt-fresh", time.time() + 24 * 3600),
            ]
        )

        await bridge._ensure_per_session_mcp_config(
            chat_session_id="sess-refresh", agent_type="claude", profile_id="p",
        )
        path2 = await bridge._ensure_per_session_mcp_config(
            chat_session_id="sess-refresh", agent_type="claude", profile_id="p",
        )
        assert _read_config_jwt(path2) == "jwt-fresh"
        assert bridge._mint_agent_session_token.call_count == 2

    @pytest.mark.asyncio
    async def test_mint_failure_propagates_for_caller_fallback(self):
        """When minting fails (backend hasn't shipped endpoint, network blip,
        etc.) the helper must raise — the dispatch wrapper catches and falls
        back to ``_ensure_mcp_config(focus=...)``. Swallowing here would hide
        the cutover state from the surrounding fallback path."""
        bridge = _make_bridge()
        bridge._mint_agent_session_token = AsyncMock(
            side_effect=RuntimeError("backend 404: endpoint not deployed")
        )

        with pytest.raises(RuntimeError, match="backend 404"):
            await bridge._ensure_per_session_mcp_config(
                chat_session_id="sess-fail",
                agent_type="claude",
                profile_id="p",
            )
        # Nothing cached on failure.
        assert not bridge._per_session_mcp_cache


# ── Mint helper: HTTP request shape ──────────────────────────────


class TestMintAgentSessionToken:
    """Exercises the actual HTTP call to the bridge-session endpoint.

    Uses httpx's mock transport so we verify the on-wire shape (URL, auth
    header, body fields) without standing up a backend.
    """

    @pytest.mark.asyncio
    async def test_posts_to_bridge_session_endpoint_with_service_token(self):
        import httpx

        captured: dict = {}

        def _handler(request: httpx.Request) -> httpx.Response:
            captured["url"] = str(request.url)
            captured["auth"] = request.headers.get("Authorization", "")
            captured["body"] = json.loads(request.content.decode())
            return httpx.Response(
                200,
                json={
                    "access_token": "minted",
                    "expires_in_seconds": 86400,
                    "chat_session_id": captured["body"]["chat_session_id"],
                    "agent_type": captured["body"]["agent_type"],
                },
            )

        bridge = _make_bridge()
        # Patch httpx.AsyncClient to use a MockTransport. This is messier than
        # injecting a client, but the bridge currently constructs its own —
        # mirror the production code path rather than refactor the seam.
        original_async_client = httpx.AsyncClient

        def _client_factory(*args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(_handler)
            return original_async_client(*args, **kwargs)

        with patch.object(httpx, "AsyncClient", _client_factory):
            token, exp = await bridge._mint_agent_session_token(
                chat_session_id="sess-wire",
                agent_type="claude",
                profile_id="profile-1",
                scope_key="tab:t1",
                tab_id="t1",
                on_behalf_of=7,
            )

        assert token == "minted"
        assert exp > time.time()
        assert captured["url"].endswith("/api/v1/dev/agent-tokens/bridge-session")
        assert captured["auth"] == "Bearer test-bridge-service-token"
        assert captured["body"]["chat_session_id"] == "sess-wire"
        assert captured["body"]["agent_type"] == "claude"
        assert captured["body"]["profile_id"] == "profile-1"
        assert captured["body"]["scope_key"] == "tab:t1"
        assert captured["body"]["tab_id"] == "t1"
        assert captured["body"]["on_behalf_of"] == 7

    @pytest.mark.asyncio
    async def test_non_200_raises(self):
        import httpx

        def _handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(403, text="forbidden")

        bridge = _make_bridge()
        original_async_client = httpx.AsyncClient

        def _client_factory(*args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(_handler)
            return original_async_client(*args, **kwargs)

        with patch.object(httpx, "AsyncClient", _client_factory):
            with pytest.raises(RuntimeError, match="403"):
                await bridge._mint_agent_session_token(
                    chat_session_id="sess-x",
                    agent_type="claude",
                    profile_id="p",
                )


# ── Stable MCP config location ───────────────────────────────────


class TestStableMcpConfigLocation:
    """Plan: launcher-health-probe-stability / stable-config-location.

    Config files now land in ``pixsim_mcp_config_dir()`` (overridden to
    ``tmp_path/mcp`` for tests by the autouse fixture) with deterministic
    names. This:

    - survives ``%TEMP%`` sweeps (Storage Sense / Disk Cleanup);
    - avoids the perf cost of regenerating after a sweep;
    - makes ``mcp_config_missing`` warnings disappear from logs;
    - keeps the bridge's caches pointed at paths that still exist.
    """

    @pytest.mark.asyncio
    async def test_writes_to_stable_dir_not_tempfile(self, tmp_path):
        """File path is inside pixsim_mcp_config_dir() — not %TEMP%."""
        bridge = _make_bridge()
        bridge._mint_agent_session_token = AsyncMock(
            return_value=("jwt-stable", time.time() + 24 * 3600)
        )

        path = await bridge._ensure_per_session_mcp_config(
            chat_session_id="sess-stable",
            agent_type="claude",
            profile_id="p",
        )
        assert path is not None
        # The autouse fixture points the stable dir at tmp_path / "mcp".
        assert str(tmp_path / "mcp") in path
        # The previous tempfile prefix shouldn't appear in the path now.
        assert "pixsim-mcp-http-" not in os.path.basename(path)

    @pytest.mark.asyncio
    async def test_rewrite_reuses_same_path(self, tmp_path):
        """A re-mint after the file is swept reuses the same filename — that's
        what the cache-stable contract is about. The bridge can keep its
        cached path forever; the underlying file gets overwritten in place
        rather than ending up at a fresh tempfile location.
        """
        from pixsim7.client.token_manager import write_claude_mcp_http_config

        p1 = write_claude_mcp_http_config(
            mcp_url="http://x", api_token="t1", name="rewrite.json"
        )
        p2 = write_claude_mcp_http_config(
            mcp_url="http://x", api_token="t2", name="rewrite.json"
        )
        assert p1 == p2
        with open(p2) as f:
            cfg = json.load(f)
        assert (
            cfg["mcpServers"]["pixsim"]["headers"]["Authorization"]
            == "Bearer t2"
        )

    @pytest.mark.asyncio
    async def test_session_filename_encodes_session_and_agent(self):
        """The deterministic name embeds the chat_session_id + agent_type so
        a quick ls of ~/.pixsim/mcp/ tells you which sessions are alive.
        """
        bridge = _make_bridge()
        bridge._mint_agent_session_token = AsyncMock(
            return_value=("jwt", time.time() + 24 * 3600)
        )

        path_claude = await bridge._ensure_per_session_mcp_config(
            chat_session_id="tab-mp4-847c", agent_type="claude", profile_id="p",
        )
        path_codex = await bridge._ensure_per_session_mcp_config(
            chat_session_id="tab-mp4-847c", agent_type="codex", profile_id="p",
        )
        name_claude = os.path.basename(path_claude)
        name_codex = os.path.basename(path_codex)
        assert "tab-mp4-847c" in name_claude
        assert "claude" in name_claude
        assert "codex" in name_codex
        assert name_claude != name_codex

    def test_sweep_removes_old_files_only(self, tmp_path):
        """sweep_old_mcp_configs deletes files older than the threshold and
        leaves fresh ones alone. Never raises."""
        from pixsim7.client.token_manager import (
            pixsim_mcp_config_dir,
            sweep_old_mcp_configs,
        )

        d = pixsim_mcp_config_dir()
        old = d / "old.json"
        fresh = d / "fresh.json"
        old.write_text("{}")
        fresh.write_text("{}")
        # Backdate ``old`` to 3 days ago — beyond the 48h sweep threshold.
        three_days_ago = time.time() - 3 * 24 * 3600
        os.utime(old, (three_days_ago, three_days_ago))

        removed = sweep_old_mcp_configs(max_age_seconds=48 * 3600)
        assert removed == 1
        assert not old.exists()
        assert fresh.exists()

    def test_sweep_survives_empty_dir(self, tmp_path):
        """A bridge starting on a fresh install has an empty (or missing)
        stable dir. Sweep must not raise — it's called unconditionally at
        startup."""
        from pixsim7.client.token_manager import sweep_old_mcp_configs

        assert sweep_old_mcp_configs() == 0


# ── Hook confirm routing (cross-tab fan-out fix) ─────────────────


class TestHookConfirmRouting:
    """Plan: agent-confirmation-hooks / cross-tab-fanout-fix.

    Before the fix, hook-originated /confirm calls (from
    ``hook_pretool.py``) reached the bridge without a ``task_id``, so
    ``_hook_confirm`` synthesized one that didn't match anything in
    ``agent.current_task_ids`` on the backend — falling through to
    broadcast and showing the prompt in *every* in-flight chat tab.

    The fix reverse-looks-up ``task_id`` from ``cli_session_id`` (Claude's
    own session UUID, forwarded by ``hook_pretool.py`` from its stdin
    payload). These tests pin the resolution ladder:

    1. Explicit ``payload['task_id']`` wins (preserves the internal
       tool-gate path at ``bridge.py:1432``).
    2. Fall back to ``cli_session_id`` lookup against
       ``_cli_session_to_task``.
    3. Last resort: synthetic ``hook-<uuid>`` id, logged loudly as
       ``hook_confirm_unrouted`` so the historical silent fan-out is
       at least audible.
    """

    def _make_ws_connected_bridge(self) -> tuple[Bridge, list[tuple[str, dict]]]:
        """Bridge with mocked WS + request_confirmation captures.

        Returns the bridge and a list that captures
        ``(task_id, payload)`` for every ``request_confirmation`` call.
        """
        bridge = _make_bridge()
        bridge._connected = True
        # Sentinel — we never actually await on ws.send because
        # request_confirmation is mocked out below.
        bridge._active_ws = object()

        captured: list[tuple[str, dict]] = []

        async def _fake_request_confirmation(ws, task_id, payload):
            captured.append((task_id, payload))
            return {"approved": True, "choice": "0"}

        bridge.request_confirmation = _fake_request_confirmation  # type: ignore[assignment]
        return bridge, captured

    @pytest.mark.asyncio
    async def test_explicit_task_id_wins(self):
        """The tool-gate path at bridge.py:1432 passes task_id explicitly.
        That must take precedence over any cli_session_id lookup, even
        when the cli_session would resolve to a different task."""
        bridge, captured = self._make_ws_connected_bridge()
        bridge._cli_session_to_task["sess-X"] = "task-from-lookup"

        result = await bridge._hook_confirm({
            "task_id": "task-from-explicit",
            "cli_session_id": "sess-X",
            "tool_name": "Bash",
        })

        assert result["approved"] is True
        assert len(captured) == 1
        passed_task_id, _ = captured[0]
        assert passed_task_id == "task-from-explicit"

    @pytest.mark.asyncio
    async def test_cli_session_id_routes_to_mapped_task(self):
        """When the PreToolUse hook forwards cli_session_id and that
        session is mapped to an in-flight task, the heartbeat goes to
        exactly that task — the whole point of the fix."""
        bridge, captured = self._make_ws_connected_bridge()
        bridge._cli_session_to_task["claude-sess-abc"] = "task-originator"
        # Add a noise mapping so we know it's not just picking the first.
        bridge._cli_session_to_task["claude-sess-xyz"] = "task-other"

        await bridge._hook_confirm({
            "cli_session_id": "claude-sess-abc",
            "tool_name": "AskUserQuestion",
        })

        assert len(captured) == 1
        passed_task_id, _ = captured[0]
        assert passed_task_id == "task-originator"

    @pytest.mark.asyncio
    async def test_unknown_cli_session_logs_warning_and_uses_synthetic(self, capsys):
        """If the bridge has no entry for the forwarded cli_session_id
        (race: task finished and was cleared, or stale hook firing after
        process death), we fall back to a synthetic 'hook-' id AND log
        ``hook_confirm_unrouted`` so the regression isn't silent.

        structlog writes directly to stdout (bypassing stdlib caplog),
        so we use capsys to assert the warning surfaced.
        """
        bridge, captured = self._make_ws_connected_bridge()
        # Empty reverse map deliberately — simulate the race.

        await bridge._hook_confirm({
            "cli_session_id": "vanished-session",
            "tool_name": "Bash",
        })

        assert len(captured) == 1
        passed_task_id, _ = captured[0]
        assert passed_task_id.startswith("hook-")
        # Warning surfaces via structlog's stdout pipeline.
        stdout = capsys.readouterr().out
        assert "hook_confirm_unrouted" in stdout
        assert "vanished-session" in stdout

    @pytest.mark.asyncio
    async def test_no_ws_fail_open(self):
        """When the bridge isn't connected to the backend, hook /confirm
        must fail-open (approve) rather than block on a never-arriving WS
        response. Behavior preserved from before the fix."""
        bridge = _make_bridge()
        bridge._connected = False
        bridge._active_ws = None

        result = await bridge._hook_confirm({
            "cli_session_id": "anything",
            "tool_name": "Bash",
        })

        assert result == {"approved": True}

    @pytest.mark.asyncio
    async def test_cli_session_lookup_does_not_consume_mapping(self):
        """The reverse map is owned by _handle_task's lifecycle (cleared
        in finally), not by _hook_confirm. A confirmation lookup must
        leave the entry intact so subsequent hook calls during the same
        task continue to route correctly."""
        bridge, captured = self._make_ws_connected_bridge()
        bridge._cli_session_to_task["sess-stable"] = "task-A"

        for _ in range(3):
            await bridge._hook_confirm({
                "cli_session_id": "sess-stable",
                "tool_name": "AskUserQuestion",
            })

        # Mapping intact after multiple lookups.
        assert bridge._cli_session_to_task.get("sess-stable") == "task-A"
        # All three routed to task-A.
        assert [tid for tid, _ in captured] == ["task-A", "task-A", "task-A"]
