"""Tests for MCP 401 self-heal reachability in HTTP transport.

Durable "MCP disconnected" fix (2026-05). The per-session bridge → shared
MCP server path carries the agent's (expiring) credential in the
per-request ``Authorization`` header, surfaced as the ``_request_token``
contextvar. ``_get_expired_token_claims`` historically ignored that
contextvar and only looked at ``API_TOKEN`` / ``API_TOKEN_FILE`` /
``_refreshed_token`` — all empty for the in-process HTTP server. So the
401 self-heal extracted an empty/wrong profile and could never re-mint:
the self-heal was effectively dead code in HTTP mode, and a stale baked
token turned every MCP call into a silent 401 well before the 24h TTL.

These pin the two seams that make the (already-repaired) ``_mint_via_profile``
self-heal actually reachable in HTTP mode:

1. ``_get_expired_token_claims`` prefers ``_request_token`` (the real
   expiring credential) over the file/env sources.
2. ``_try_refresh_token`` resolves the profile from the ``X-Profile-Id``
   header (``_request_profile_id``) when the expired token's own claims
   lack it — the common case for a service/bridge token.
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "mcp-self-heal-http",
    "label": "MCP Self-Heal (HTTP transport)",
    "kind": "unit",
    "category": "backend/client",
    "subcategory": "mcp",
    "covers": [
        "pixsim7/client/mcp_server.py",
    ],
    "order": 46.5,
}

import base64
import json

import pytest

try:
    import pixsim7.client.mcp_server as mcp

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")


def _jwt(claims: dict) -> str:
    """Build an unsigned-but-well-formed JWT (mcp decodes segment[1] only)."""
    def _seg(obj: dict) -> str:
        raw = json.dumps(obj).encode()
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")

    return f"{_seg({'alg': 'none'})}.{_seg(claims)}.sig"


@pytest.fixture
def reset_ctx():
    """Isolate the HTTP-mode per-request contextvars between tests."""
    tt = mcp._request_token.set(None)
    pt = mcp._request_profile_id.set(None)
    yield
    mcp._request_token.reset(tt)
    mcp._request_profile_id.reset(pt)


@pytest.fixture
def reset_globals(monkeypatch):
    """Keep module-level token state from leaking across tests."""
    monkeypatch.setattr(mcp, "_refreshed_token", "", raising=False)
    monkeypatch.setattr(mcp, "API_TOKEN", "", raising=False)
    monkeypatch.setattr(mcp, "API_TOKEN_FILE", "", raising=False)
    yield


class TestGetExpiredTokenClaims:
    """Seam 1: the request-header token is THE expiring credential in HTTP."""

    def test_prefers_request_token_over_env(self, reset_ctx, reset_globals, monkeypatch):
        monkeypatch.setattr(mcp, "API_TOKEN", _jwt({"profile_id": "env-profile"}))
        req = _jwt({"profile_id": "header-profile", "run_id": "run-9"})
        mcp._request_token.set(req)

        token, claims = mcp._get_expired_token_claims()

        assert token == req
        assert claims["profile_id"] == "header-profile"
        assert claims["run_id"] == "run-9"

    def test_falls_back_to_env_when_no_request_token(self, reset_ctx, reset_globals, monkeypatch):
        # STDIO path: no per-request contextvar — legacy behaviour preserved.
        env_tok = _jwt({"profile_id": "env-profile"})
        monkeypatch.setattr(mcp, "API_TOKEN", env_tok)

        token, claims = mcp._get_expired_token_claims()

        assert token == env_tok
        assert claims["profile_id"] == "env-profile"


class TestTryRefreshTokenProfileResolution:
    """Seam 2: profile resolves from X-Profile-Id when token claims lack it."""

    @pytest.mark.asyncio
    async def test_uses_request_profile_id_header(self, reset_ctx, reset_globals, monkeypatch):
        # Expired header token with NO profile_id in claims (typical for a
        # service/bridge-purpose token) — identity must come from the
        # X-Profile-Id header the bridge emits.
        mcp._request_token.set(_jwt({"purpose": "bridge"}))
        mcp._request_profile_id.set("profile-from-header")
        monkeypatch.setattr(mcp, "_resolved_profile_id", None, raising=False)
        monkeypatch.setattr(mcp, "_get_login_token", lambda: "login-tok")

        seen: dict = {}

        async def _fake_mint(profile_id: str, login_token: str):
            seen["profile_id"] = profile_id
            seen["login_token"] = login_token
            return "fresh-minted-token"

        monkeypatch.setattr(mcp, "_mint_via_profile", _fake_mint)

        new_token = await mcp._try_refresh_token()

        assert new_token == "fresh-minted-token"
        assert seen["profile_id"] == "profile-from-header"
        assert seen["login_token"] == "login-tok"
        assert mcp._refreshed_token == "fresh-minted-token"

    @pytest.mark.asyncio
    async def test_token_claims_profile_still_wins(self, reset_ctx, reset_globals, monkeypatch):
        # When the expired token DOES carry profile_id, that beats the header
        # (the header is the fallback, not an override).
        mcp._request_token.set(_jwt({"profile_id": "claims-profile"}))
        mcp._request_profile_id.set("header-profile")
        monkeypatch.setattr(mcp, "_get_login_token", lambda: "login-tok")

        seen: dict = {}

        async def _fake_mint(profile_id: str, login_token: str):
            seen["profile_id"] = profile_id
            return "minted"

        monkeypatch.setattr(mcp, "_mint_via_profile", _fake_mint)

        await mcp._try_refresh_token()

        assert seen["profile_id"] == "claims-profile"

    @pytest.mark.asyncio
    async def test_no_login_token_aborts_cleanly(self, reset_ctx, reset_globals, monkeypatch):
        # Without a usable login token there's nothing to mint with — must
        # return None rather than raise (caller leaves the 401 surfaced).
        mcp._request_token.set(_jwt({"profile_id": "p"}))
        monkeypatch.setattr(mcp, "_get_login_token", lambda: "")

        assert await mcp._try_refresh_token() is None
