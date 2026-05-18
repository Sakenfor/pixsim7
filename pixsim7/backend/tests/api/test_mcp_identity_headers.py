"""Tests for MCP _identity_headers — agent identity propagation.

Plan plan-participant-liveness / checkpoint agent-identity-attribution.

The forwarded token is not always a full agent token (bridge per-request
tokens, login fallback, refreshed tokens may lack profile_id/run_id). The
backend recovers identity from X-Agent-Id / X-Run-Id headers, so _proxy
must always send them when resolvable — otherwise distinct agents collapse
to agent_id='unknown'/run_id=null and become indistinguishable."""
from __future__ import annotations

TEST_SUITE = {
    "id": "mcp-identity-headers",
    "label": "MCP Identity Headers",
    "kind": "unit",
    "category": "backend/client",
    "subcategory": "mcp",
    "covers": [
        "pixsim7/client/mcp_server.py",
    ],
    "order": 46,
}

import pytest

try:
    import pixsim7.client.mcp_server as mcp

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


@pytest.fixture
def reset_resolved():
    saved = getattr(mcp, "_resolved_profile_id", None)
    yield
    mcp._resolved_profile_id = saved


@pytest.fixture
def reset_ctx():
    """Isolate the HTTP-mode per-request contextvars between tests."""
    pt = mcp._request_profile_id.set(None)
    st = mcp._request_session_id.set(None)
    yield
    mcp._request_profile_id.reset(pt)
    mcp._request_session_id.reset(st)


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestIdentityHeaders:
    def test_full_token_propagates_profile_and_run(self, monkeypatch, reset_resolved):
        mcp._resolved_profile_id = None
        monkeypatch.setattr(mcp, "_extract_profile_from_token", lambda _t: "profile-abc")
        monkeypatch.setattr(mcp, "_decode_token_claims", lambda _t: {"run_id": "run-1"})

        h = mcp._identity_headers("tok-abc")

        assert h["Authorization"] == "Bearer tok-abc"
        assert h["X-Agent-Id"] == "profile-abc"
        assert h["X-Run-Id"] == "run-1"

    def test_degraded_token_falls_back_to_resolved_profile(
        self, monkeypatch, reset_resolved
    ):
        # Token lacks profile_id/run_id (the bug repro: bridge/login token).
        mcp._resolved_profile_id = "profile-fallback"
        monkeypatch.setattr(mcp, "_extract_profile_from_token", lambda _t: None)
        monkeypatch.setattr(mcp, "_decode_token_claims", lambda _t: {})

        h = mcp._identity_headers("tok-xyz")

        assert h["Authorization"] == "Bearer tok-xyz"
        assert h["X-Agent-Id"] == "profile-fallback"
        assert "X-Run-Id" not in h  # no run_id anywhere -> omitted, not 'null'

    def test_distinct_tokens_yield_distinct_identity(
        self, monkeypatch, reset_resolved
    ):
        mcp._resolved_profile_id = None
        claims = {
            "tok-A": ("profile-A", "run-A"),
            "tok-B": ("profile-B", "run-B"),
        }
        monkeypatch.setattr(
            mcp, "_extract_profile_from_token", lambda t: claims[t][0]
        )
        monkeypatch.setattr(
            mcp, "_decode_token_claims", lambda t: {"run_id": claims[t][1]}
        )

        a = mcp._identity_headers("tok-A")
        b = mcp._identity_headers("tok-B")

        # The core multi-agent guarantee: two agents are distinguishable.
        assert (a["X-Agent-Id"], a["X-Run-Id"]) == ("profile-A", "run-A")
        assert (b["X-Agent-Id"], b["X-Run-Id"]) == ("profile-B", "run-B")
        assert a["X-Agent-Id"] != b["X-Agent-Id"]
        assert a["X-Run-Id"] != b["X-Run-Id"]

    def test_empty_token_has_no_auth_or_identity(self, monkeypatch, reset_resolved):
        mcp._resolved_profile_id = None
        monkeypatch.setattr(mcp, "_extract_profile_from_token", lambda _t: None)
        monkeypatch.setattr(mcp, "_decode_token_claims", lambda _t: {})

        h = mcp._identity_headers("")

        assert "Authorization" not in h
        assert "X-Agent-Id" not in h
        assert "X-Run-Id" not in h

    def test_blank_run_id_claim_is_omitted(self, monkeypatch, reset_resolved, reset_ctx):
        mcp._resolved_profile_id = None
        monkeypatch.setattr(mcp, "_extract_profile_from_token", lambda _t: "p1")
        monkeypatch.setattr(mcp, "_decode_token_claims", lambda _t: {"run_id": "   "})

        h = mcp._identity_headers("tok")

        assert h["X-Agent-Id"] == "p1"
        assert "X-Run-Id" not in h

    def test_http_mode_uses_request_contextvars(
        self, monkeypatch, reset_resolved, reset_ctx
    ):
        # HTTP/bridge: identity-less token, no STDIO global — identity
        # comes from the per-request X-Profile-Id / X-Chat-Session-Id.
        mcp._resolved_profile_id = None
        monkeypatch.setattr(mcp, "_extract_profile_from_token", lambda _t: None)
        monkeypatch.setattr(mcp, "_decode_token_claims", lambda _t: {})
        mcp._request_profile_id.set("profile-http")
        mcp._request_session_id.set("sess-http")

        h = mcp._identity_headers("tok-stripped")

        assert h["X-Agent-Id"] == "profile-http"
        # No run_id anywhere -> session id is the stable discriminator.
        assert h["X-Run-Id"] == "sess-http"

    def test_token_identity_wins_over_contextvars(
        self, monkeypatch, reset_resolved, reset_ctx
    ):
        mcp._resolved_profile_id = "profile-global"
        monkeypatch.setattr(mcp, "_extract_profile_from_token", lambda _t: "profile-tok")
        monkeypatch.setattr(mcp, "_decode_token_claims", lambda _t: {"run_id": "run-tok"})
        mcp._request_profile_id.set("profile-http")
        mcp._request_session_id.set("sess-http")

        h = mcp._identity_headers("tok-full")

        assert h["X-Agent-Id"] == "profile-tok"  # token beats contextvar/global
        assert h["X-Run-Id"] == "run-tok"  # real run_id beats session fallback

    def test_request_profile_beats_resolved_global(
        self, monkeypatch, reset_resolved, reset_ctx
    ):
        mcp._resolved_profile_id = "profile-global"
        monkeypatch.setattr(mcp, "_extract_profile_from_token", lambda _t: None)
        monkeypatch.setattr(mcp, "_decode_token_claims", lambda _t: {})
        mcp._request_profile_id.set("profile-http")

        h = mcp._identity_headers("tok")

        assert h["X-Agent-Id"] == "profile-http"
