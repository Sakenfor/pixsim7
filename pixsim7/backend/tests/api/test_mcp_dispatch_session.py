"""Tests for MCP dispatch session resolution — verifies the in-process
session identity channel used by the bridge to tell the MCP server which
chat session a log_work call belongs to."""
from __future__ import annotations

TEST_SUITE = {
    "id": "mcp-dispatch-session",
    "label": "MCP Dispatch Session Resolution",
    "kind": "unit",
    "category": "client/mcp",
    "subcategory": "session",
    "covers": [
        "pixsim7/client/mcp_server.py",
    ],
    "order": 35,
}

import os
from unittest.mock import patch

import pytest

try:
    from pixsim7.client.mcp_server import (
        _read_session_sidecar,
        set_dispatch_session,
        _request_session_id,
    )
    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="client deps not available")


class TestDispatchSessionResolution:
    """Verify the 4-level resolution order in _read_session_sidecar."""

    def setup_method(self):
        """Reset dispatch session state between tests."""
        set_dispatch_session(None)

    def teardown_method(self):
        set_dispatch_session(None)

    def test_dispatch_session_set_and_read(self):
        """set_dispatch_session value is returned by _read_session_sidecar."""
        set_dispatch_session("sess-abc-123")
        result = _read_session_sidecar()
        assert result == "sess-abc-123"

    def test_dispatch_session_none_skips_to_file(self):
        """When dispatch session is None, falls through to file-based resolution."""
        set_dispatch_session(None)
        # With no dispatch session and no PIXSIM_TOKEN_FILE, should return None
        with patch.dict(os.environ, {}, clear=False):
            # Remove PIXSIM_TOKEN_FILE if set
            os.environ.pop("PIXSIM_TOKEN_FILE", None)
            result = _read_session_sidecar()
        assert result is None

    def test_contextvar_takes_priority_over_dispatch(self):
        """HTTP contextvar (priority 1) beats dispatch session (priority 2)."""
        set_dispatch_session("dispatch-sess")
        token = _request_session_id.set("header-sess")
        try:
            result = _read_session_sidecar()
            assert result == "header-sess"
        finally:
            _request_session_id.reset(token)

    def test_dispatch_clears_stale_state(self):
        """Setting dispatch to None clears stale value from previous dispatch."""
        set_dispatch_session("old-session")
        assert _read_session_sidecar() == "old-session"

        set_dispatch_session(None)
        # Should no longer return the old session
        result = _read_session_sidecar()
        assert result != "old-session"

    def test_dispatch_session_overwrite(self):
        """Sequential dispatches overwrite correctly (no accumulation)."""
        set_dispatch_session("session-A")
        assert _read_session_sidecar() == "session-A"

        set_dispatch_session("session-B")
        assert _read_session_sidecar() == "session-B"


class TestSetDispatchSession:
    """Verify set_dispatch_session API — ContextVar-only, no module-global mirror.

    The module global was removed because it cross-attributed log_work
    calls to the most-recently-dispatched tab whenever a caller lost task
    context. These tests pin the absence of that fallback.
    """

    def teardown_method(self):
        set_dispatch_session(None)

    def test_read_in_same_task_returns_set_value(self):
        set_dispatch_session("test-id")
        assert _read_session_sidecar() == "test-id"

    def test_set_none_clears_for_same_task(self):
        set_dispatch_session("something")
        set_dispatch_session(None)
        # No PIXSIM_TOKEN_FILE → resolution falls through to None.
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("PIXSIM_TOKEN_FILE", None)
            assert _read_session_sidecar() is None

    def test_no_module_global_mirror(self):
        """Regression guard: setting from one task must not bleed into a sibling
        task that never ran set_dispatch_session itself.

        Pre-fix, set_dispatch_session also wrote a module global as a "safety
        net," and any caller whose ContextVar happened to be at its default
        (None) would silently read that global instead — cross-attributing
        log_work across tabs. The fix removed the global; this asserts the
        symbol is no longer exported."""
        import pixsim7.client.mcp_server as mod
        assert not hasattr(mod, "_dispatch_session_id"), (
            "Removed in 2026-05 to stop cross-tab log_work attribution. "
            "If you're re-adding a fallback, make sure it's keyed per-token "
            "(profile_id, scope_key) not a single global."
        )


class TestSysPathBootstrap:
    """Verify the MCP server prepends the repo root to sys.path at module load.

    Regression guard: the MCP server is launched as a raw script
    (`python path/to/mcp_server.py`), not as a module. Without this
    bootstrap, `from pixsim7.common.scope_helpers import ...` inside
    ``_normalize_profile_id`` blows up with ModuleNotFoundError whenever
    the MCP client is started from a cwd other than the repo root —
    which is what caused `log_work` to fail for users.
    """

    def test_repo_root_attribute_present_and_correct(self):
        import pathlib
        import pixsim7.client.mcp_server as mod

        expected_root = pathlib.Path(mod.__file__).resolve().parents[2]
        assert hasattr(mod, "_repo_root"), (
            "mcp_server.py must define _repo_root at module load for sys.path bootstrap"
        )
        assert pathlib.Path(mod._repo_root).resolve() == expected_root

    def test_repo_root_is_on_sys_path_after_import(self):
        import pathlib
        import sys
        import pixsim7.client.mcp_server as mod

        assert pathlib.Path(mod._repo_root).resolve() == pathlib.Path(mod._repo_root).resolve()
        # Either the literal string or any path resolving to the same dir.
        root = pathlib.Path(mod._repo_root).resolve()
        on_path = any(
            pathlib.Path(p).resolve() == root for p in sys.path if p
        )
        assert on_path, (
            f"_repo_root ({root}) must be on sys.path after mcp_server import "
            f"so `from pixsim7.*` imports resolve regardless of cwd."
        )

    def test_lazy_pixsim_import_resolves(self):
        """Calling _normalize_profile_id exercises the lazy
        `from pixsim7.common.scope_helpers import normalize_profile_id`
        that originally failed. Must not raise ModuleNotFoundError.
        """
        from pixsim7.client.mcp_server import _normalize_profile_id

        assert _normalize_profile_id("profile-123") == "profile-123"
        assert _normalize_profile_id(None) is None


class TestAutoRegisterIdempotency:
    """Cover _auto_register_if_needed re-entry guards. These are elusive
    because failure manifests as duplicate ChatSession rows on the backend
    — only visible when a user inspects the sessions list and sees two
    entries for what should be one session.
    """

    def _reset_module_state(self):
        import pixsim7.client.mcp_server as mod
        mod._registered_session_id = None
        mod._resolved_profile_id = None
        mod._bridge_session_cache.clear()

    def setup_method(self):
        self._reset_module_state()

    def teardown_method(self):
        self._reset_module_state()
        os.environ.pop("PIXSIM_BRIDGE_MANAGED", None)

    @pytest.mark.asyncio
    async def test_skips_when_bridge_managed_env_set(self):
        """PIXSIM_BRIDGE_MANAGED means ws_chat owns ChatSession creation —
        MCP auto-register must NOT fire a POST that would create a second
        ChatSession row competing with the bridge-owned one."""
        import pixsim7.client.mcp_server as mod

        proxy_calls = []

        async def fake_proxy(**kwargs):
            proxy_calls.append(kwargs)
            return []

        os.environ["PIXSIM_BRIDGE_MANAGED"] = "1"
        with patch.object(mod, "_proxy", fake_proxy):
            await mod._auto_register_if_needed()

        assert mod._registered_session_id == "__bridge__"
        assert proxy_calls == [], "bridge-managed must not POST register-chat-session"

    @pytest.mark.asyncio
    async def test_short_circuits_when_already_registered(self):
        """Second tool call must not re-register. Duplicate registration
        would generate a duplicate heartbeat task and a second ChatSession
        upsert — both masking the real state on the backend."""
        import pixsim7.client.mcp_server as mod

        mod._registered_session_id = "preset-sess"

        proxy_calls = []

        async def fake_proxy(**kwargs):
            proxy_calls.append(kwargs)
            return []

        with patch.object(mod, "_proxy", fake_proxy):
            await mod._auto_register_if_needed()

        assert mod._registered_session_id == "preset-sess"
        assert proxy_calls == []

    @pytest.mark.asyncio
    async def test_skips_when_no_token_available(self):
        """No token = no auth = no registration. Previously this silently
        left `_registered_session_id` unset and tool calls proceeded as
        unregistered; pinning the behavior prevents a regression where a
        register call fires with an empty Authorization header."""
        import pixsim7.client.mcp_server as mod

        proxy_calls = []

        async def fake_proxy(**kwargs):
            proxy_calls.append(kwargs)
            return []

        with patch.object(mod, "_get_token", lambda: ""), \
             patch.object(mod, "_proxy", fake_proxy):
            await mod._auto_register_if_needed()

        assert mod._registered_session_id is None
        assert proxy_calls == []


class TestDispatchSessionContextVar:
    """ContextVar isolation — concurrent dispatches in the same bridge process
    must not stomp on each other's session id. Without per-task scoping, two
    chat tabs running their agents in parallel would race on the module global
    and tool calls from either turn could resolve to either id."""

    def teardown_method(self):
        set_dispatch_session(None)

    @pytest.mark.asyncio
    async def test_parallel_dispatches_keep_separate_ids(self):
        """Two parallel tasks each call set_dispatch_session(); each task's
        own _read_session_sidecar() must return its own id, not the other's.
        This is the regression guard for the concurrent-tabs case."""
        import asyncio

        from pixsim7.client.mcp_server import _read_session_sidecar, set_dispatch_session

        observed: dict[str, str | None] = {}

        async def dispatch(name: str, session_id: str) -> None:
            set_dispatch_session(session_id)
            # Yield to let the other task interleave its set_dispatch_session.
            await asyncio.sleep(0)
            await asyncio.sleep(0)
            observed[name] = _read_session_sidecar()

        await asyncio.gather(
            dispatch("A", "session-A"),
            dispatch("B", "session-B"),
        )

        # Each task's own read returns its own id — no cross-contamination.
        assert observed["A"] == "session-A"
        assert observed["B"] == "session-B"

    @pytest.mark.asyncio
    async def test_no_cross_task_leak_after_dispatch_exit(self):
        """Regression for the mis-attributed-work_summary bug: tab A dispatches,
        its task exits, then tab B (which never set its own dispatch session)
        runs log_work. Tab B must NOT inherit tab A's session id.

        Pre-fix this leaked via `_dispatch_session_id` (module global) — the
        ContextVar correctly returned None in B's task, but the fallback read
        whatever A had written. Result: B's log_work landed on A's session.
        Now the fallback is gone, so B's _read_session_sidecar returns None
        and resolution falls through to the bridge API lookup."""
        import asyncio
        from pixsim7.client.mcp_server import _read_session_sidecar, set_dispatch_session

        async def tab_a_dispatch() -> None:
            set_dispatch_session("session-A")
            # Simulate A's dispatch returning. ContextVar is unwound when the
            # task ends; module global (now removed) used to persist past this.
            assert _read_session_sidecar() == "session-A"

        async def tab_b_log_work() -> str | None:
            # B never calls set_dispatch_session. Must not see A's value.
            with patch.dict(os.environ, {}, clear=False):
                os.environ.pop("PIXSIM_TOKEN_FILE", None)
                return _read_session_sidecar()

        await asyncio.create_task(tab_a_dispatch())
        result = await asyncio.create_task(tab_b_log_work())
        assert result is None, (
            f"Expected None (no cross-task leak), got {result!r} — the module "
            "global is back."
        )


class TestLogWorkMcpStarFallback:
    """Defensive fallback in `_handle_log_work`: if `_registered_session_id`
    starts with `mcp-` (auto-registered orphan) but a per-dispatch chat
    session is set, prefer the dispatch id. Covers the bug where work_summary
    entries got attributed to a parallel `mcp-{hash}` row instead of the
    actual chat session the agent was answering for."""

    def setup_method(self):
        import pixsim7.client.mcp_server as mod
        mod._registered_session_id = None
        set_dispatch_session(None)

    def teardown_method(self):
        import pixsim7.client.mcp_server as mod
        mod._registered_session_id = None
        set_dispatch_session(None)

    @pytest.mark.asyncio
    async def test_mcp_star_prefers_dispatch_session(self):
        """When _registered_session_id is mcp-* AND a real chat session is
        on the dispatch ContextVar, log_work routes to the chat session."""
        import pixsim7.client.mcp_server as mod

        mod._registered_session_id = "mcp-deadbeef12345678"
        set_dispatch_session("019df49e-real-chat-session")

        captured: dict[str, object] = {}

        class _Resp:
            status_code = 200
            def json(self):  # noqa: D401 — match httpx interface
                return {"ok": True}

        async def fake_post(path, headers=None, json=None):  # noqa: A002 — match httpx
            captured["path"] = path
            captured["json"] = json
            return _Resp()

        class _Client:
            post = staticmethod(fake_post)

        # Token with no chat_session_id claim — forces the resolution chain
        # into _registered_session_id territory.
        fake_token = "header.eyJzdWIiOiIxIn0.sig"  # base64 of {"sub":"1"}

        with patch.object(mod, "_get_token", lambda: fake_token), \
             patch.object(mod, "_get_client", lambda: _Client()):
            await mod._handle_log_work({"summary": "test"})

        assert captured.get("path") == "/api/v1/meta/agents/heartbeat"
        body = captured.get("json") or {}
        assert body.get("session_id") == "019df49e-real-chat-session", (
            "log_work must route to the dispatch chat session, not the mcp-* orphan"
        )

    @pytest.mark.asyncio
    async def test_mcp_star_keeps_orphan_when_no_dispatch(self):
        """When no dispatch session is set, the mcp-* id is still used —
        the fallback only fires when a better id is available."""
        import pixsim7.client.mcp_server as mod

        mod._registered_session_id = "mcp-deadbeef12345678"
        set_dispatch_session(None)

        captured: dict[str, object] = {}

        class _Resp:
            status_code = 200
            def json(self):
                return {"ok": True}

        async def fake_post(path, headers=None, json=None):  # noqa: A002
            captured["json"] = json
            return _Resp()

        class _Client:
            post = staticmethod(fake_post)

        fake_token = "header.eyJzdWIiOiIxIn0.sig"

        with patch.object(mod, "_get_token", lambda: fake_token), \
             patch.object(mod, "_get_client", lambda: _Client()):
            await mod._handle_log_work({"summary": "test"})

        body = captured.get("json") or {}
        # No dispatch, no override — keeps the mcp-* id (existing behavior).
        assert body.get("session_id") == "mcp-deadbeef12345678"

    @pytest.mark.asyncio
    async def test_explicit_session_id_wins_over_fallback(self):
        """Caller-provided session_id always wins, even when an mcp-* id and
        a dispatch id are both present."""
        import pixsim7.client.mcp_server as mod

        mod._registered_session_id = "mcp-deadbeef12345678"
        set_dispatch_session("dispatch-sess")

        captured: dict[str, object] = {}

        class _Resp:
            status_code = 200
            def json(self):
                return {"ok": True}

        async def fake_post(path, headers=None, json=None):  # noqa: A002
            captured["json"] = json
            return _Resp()

        class _Client:
            post = staticmethod(fake_post)

        fake_token = "header.eyJzdWIiOiIxIn0.sig"

        with patch.object(mod, "_get_token", lambda: fake_token), \
             patch.object(mod, "_get_client", lambda: _Client()):
            await mod._handle_log_work({"summary": "test", "session_id": "explicit-id"})

        body = captured.get("json") or {}
        assert body.get("session_id") == "explicit-id"


class TestResolveBridgeSessionCache:
    """Cache hygiene in `_resolve_bridge_session_id`.

    The cache is keyed by `(engine, profile_id, scope_key)`. When `scope_key`
    is `None`, multiple tabs/sessions sharing `(engine, profile)` would collide
    on a single cache entry and the first-resolved session would win for all
    of them (cross-attribution — the same bug class as the global we removed).
    The fix: skip the cache entirely when `scope_key is None`."""

    def setup_method(self):
        import pixsim7.client.mcp_server as mod
        mod._bridge_session_cache.clear()

    def teardown_method(self):
        import pixsim7.client.mcp_server as mod
        mod._bridge_session_cache.clear()

    @pytest.mark.asyncio
    async def test_does_not_cache_when_scope_key_is_none(self):
        """Scope-less resolves must not populate the cache. Otherwise tab A's
        result becomes tab B's first read on the same (engine, profile)."""
        import pixsim7.client.mcp_server as mod

        sessions_payload = {
            "sessions": [
                {"id": "session-A", "scope_key": "tab:tab-A", "profile_id": "profile-x"},
            ]
        }

        class _Resp:
            status_code = 200
            def json(self):
                return sessions_payload

        async def fake_get(path, headers=None, params=None):  # noqa: A002
            return _Resp()

        class _Client:
            get = staticmethod(fake_get)

        with patch.object(mod, "_get_client", lambda: _Client()):
            resolved = await mod._resolve_bridge_session_id(
                token="ignored",
                profile_id="profile-x",
                agent_type="claude",
                scope_key=None,  # <-- the case we're guarding
            )

        assert resolved == "session-A"
        assert mod._bridge_session_cache == {}, (
            "Scope-less resolves must not populate the cache. "
            f"Got entries: {mod._bridge_session_cache}"
        )

    @pytest.mark.asyncio
    async def test_does_cache_when_scope_key_is_set(self):
        """Sanity: with a scope key, caching is the right behavior — repeat
        calls for the same scope should short-circuit the API."""
        import pixsim7.client.mcp_server as mod

        call_count = 0

        async def fake_get(path, headers=None, params=None):  # noqa: A002
            nonlocal call_count
            call_count += 1

            class _Resp:
                status_code = 200
                def json(self):
                    return {
                        "sessions": [
                            {"id": "session-A", "scope_key": "tab:tab-A", "profile_id": "profile-x"},
                        ]
                    }
            return _Resp()

        class _Client:
            get = staticmethod(fake_get)

        with patch.object(mod, "_get_client", lambda: _Client()):
            r1 = await mod._resolve_bridge_session_id(
                token="ignored", profile_id="profile-x",
                agent_type="claude", scope_key="tab:tab-A",
            )
            r2 = await mod._resolve_bridge_session_id(
                token="ignored", profile_id="profile-x",
                agent_type="claude", scope_key="tab:tab-A",
            )

        assert r1 == "session-A"
        assert r2 == "session-A"
        assert call_count == 1, "Second scoped call should hit the cache"


class TestLogWorkBridgeResolutionFallback:
    """Regression for the `__bridge__`-stamped activity log row: when
    `log_work` is called with `plan_id`, the resolver used to look ONLY for
    a chat session with `scope_key="plan:foo"`. Real chat sessions are
    tab-scoped (`scope_key="tab:tab-X"`), so the lookup missed, session_id
    fell through to the literal `"__bridge__"` sentinel, and the heartbeat
    POST wrote that string into `agent_activity_log.session_id`. Fix: try
    plan-scope first (for plan-bound `mcp-*` sessions), then fall back to
    the token's tab-scope. Also: refuse to POST when the resolved id is
    still a sentinel — better to surface the failure than to write garbage."""

    def setup_method(self):
        import pixsim7.client.mcp_server as mod
        mod._registered_session_id = None
        mod._bridge_session_cache.clear()
        set_dispatch_session(None)

    def teardown_method(self):
        import pixsim7.client.mcp_server as mod
        mod._registered_session_id = None
        mod._bridge_session_cache.clear()
        set_dispatch_session(None)

    @pytest.mark.asyncio
    async def test_plan_scope_falls_back_to_token_tab_scope(self):
        """When `plan_id` is set but no chat session has `scope_key="plan:foo"`,
        the resolver must try the token's tab scope before giving up."""
        import pixsim7.client.mcp_server as mod

        mod._registered_session_id = "__bridge__"

        # Token claims include profile_id and scope_key="tab:tab-XYZ".
        # Base64({"profile_id":"profile-x","scope_key":"tab:tab-xyz"})
        fake_token = (
            "header."
            "eyJwcm9maWxlX2lkIjoicHJvZmlsZS14Iiwic2NvcGVfa2V5IjoidGFiOnRhYi14eXoifQ"
            ".sig"
        )

        # No session exists for plan:foo, but session-T exists for tab:tab-xyz.
        captured_lookups: list[dict] = []

        class _Resp:
            status_code = 200
            def json(self):
                return {
                    "sessions": [
                        {"id": "session-T", "scope_key": "tab:tab-xyz", "profile_id": "profile-x"},
                    ]
                }

        async def fake_get(path, headers=None, params=None):  # noqa: A002
            captured_lookups.append({"path": path, "params": params})
            return _Resp()

        captured_post: dict[str, object] = {}

        class _PostResp:
            status_code = 200
            def json(self):
                return {"ok": True}

        async def fake_post(path, headers=None, json=None):  # noqa: A002
            captured_post["json"] = json
            return _PostResp()

        class _Client:
            get = staticmethod(fake_get)
            post = staticmethod(fake_post)

        with patch.object(mod, "_get_token", lambda: fake_token), \
             patch.object(mod, "_get_client", lambda: _Client()):
            await mod._handle_log_work({
                "summary": "test summary",
                "plan_id": "foo",
            })

        body = captured_post.get("json") or {}
        assert body.get("session_id") == "session-T", (
            "log_work must fall back to the token's tab scope when plan-scoped "
            f"lookup misses. Got session_id={body.get('session_id')!r}"
        )

    @pytest.mark.asyncio
    async def test_sentinel_session_id_blocks_heartbeat_post(self):
        """When resolution exhausts every hint and session_id is still a
        sentinel, the heartbeat POST must NOT fire — better to surface the
        failure than to write '__bridge__' as a literal session id."""
        import pixsim7.client.mcp_server as mod

        mod._registered_session_id = "__bridge__"

        # Token has no scope_key — exhausts every hint.
        fake_token = "header.eyJwcm9maWxlX2lkIjoicHJvZmlsZS14In0.sig"

        # API returns no sessions at all — every lookup misses.
        class _Resp:
            status_code = 200
            def json(self):
                return {"sessions": []}

        async def fake_get(path, headers=None, params=None):  # noqa: A002
            return _Resp()

        post_called = False

        async def fake_post(path, headers=None, json=None):  # noqa: A002
            nonlocal post_called
            post_called = True

            class _R:
                status_code = 200
                def json(self):
                    return {"ok": True}
            return _R()

        class _Client:
            get = staticmethod(fake_get)
            post = staticmethod(fake_post)

        result = None
        with patch.object(mod, "_get_token", lambda: fake_token), \
             patch.object(mod, "_get_client", lambda: _Client()):
            result = await mod._handle_log_work({
                "summary": "test summary",
                "plan_id": "no-such-plan",
            })

        assert not post_called, "Sentinel session_id must not reach the heartbeat POST"
        text = result[0].text if result else ""
        assert "skipped" in text.lower() or "sentinel" in text.lower(), (
            f"Caller should see a 'skipped/sentinel' message, got: {text!r}"
        )
