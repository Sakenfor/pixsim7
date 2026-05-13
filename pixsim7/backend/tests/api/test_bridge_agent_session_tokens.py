"""Tests for bridge-minted per-session agent tokens.

Plan: ``mcp-http-bridge-session-resolution`` (checkpoint ``regression-tests``).

Covers ``POST /api/v1/dev/agent-tokens/bridge-session`` — the endpoint the
bridge calls at subprocess spawn time to mint a per-(chat_session_id,
agent_type) JWT. The minted token carries the claims MCP tool handlers
need to resolve identity directly, replacing the ``__bridge__`` sentinel
fallback path that the prior architecture was forced into by the static
service-token MCP config.
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "bridge-agent-session-tokens",
    "label": "Bridge-minted per-session agent tokens",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "agent-auth",
    "covers": [
        "pixsim7/backend/main/api/v1/agent_tokens.py",
        "pixsim7/backend/main/services/user/token_policy.py",
        "pixsim7/client/bridge.py",
    ],
    "order": 31,
}

from unittest.mock import AsyncMock

import pytest

try:
    import httpx
    from fastapi import FastAPI
    from pixsim7.backend.main.api.dependencies import (
        get_current_principal,
        get_database,
    )
    from pixsim7.backend.main.api.v1.agent_tokens import router as agent_token_router
    from pixsim7.backend.main.shared.actor import RequestPrincipal
    from pixsim7.backend.main.shared.auth import decode_access_token

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


# ── Helpers ──────────────────────────────────────────────────────


def _service_principal(*, user_id: int = 0, admin: bool = True) -> "RequestPrincipal":
    """A bridge-purpose principal (``principal_type=service``).

    ``user_id=0`` matches the all-tenants bridge token; non-zero matches a
    user-scoped bridge token (see ``_bridge_claims`` in token_policy.py).
    """
    return RequestPrincipal(
        id=user_id,
        principal_type="service",
        role="admin" if admin else "user",
        admin=admin,
        username="bridge" if user_id == 0 else None,
        email="bridge@service.local" if user_id == 0 else None,
        permissions=[],
    )


def _admin_principal():
    return RequestPrincipal(
        id=1, principal_type="user", role="admin", admin=True,
        username="admin", email="admin@test.local", permissions=[],
    )


def _user_principal():
    return RequestPrincipal(
        id=42, principal_type="user", role="user", admin=False,
        username="stefan", email="stefan@test.local", permissions=[],
    )


def _app_for_tokens(*, principal=None) -> "FastAPI":
    app = FastAPI()
    app.include_router(agent_token_router, prefix="/api/v1")

    class _FakeDb:
        def __init__(self):
            self.added = []
            self.commit = AsyncMock()

        def add(self, obj):
            self.added.append(obj)

    fake_db = _FakeDb()

    async def _db():
        yield fake_db

    app.dependency_overrides[get_database] = _db
    app.dependency_overrides[get_current_principal] = lambda: (principal or _service_principal())
    app.state.test_db = fake_db
    return app


def _client(app):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


# ── Happy path: claims carry full identity ────────────────────────


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestBridgeSessionTokenMinting:

    @pytest.mark.asyncio
    async def test_service_principal_can_mint_and_claims_include_chat_session(self):
        """The whole point: the minted JWT carries chat_session_id directly,
        so MCP tool handlers stop falling back to the ``__bridge__`` sentinel.
        """
        app = _app_for_tokens()
        async with _client(app) as client:
            resp = await client.post(
                "/api/v1/dev/agent-tokens/bridge-session",
                json={
                    "chat_session_id": "0a4e1c41-fe54-4c1b-9efe-9fd3d1a38c6a",
                    "agent_type": "claude",
                    "profile_id": "profile-mn4kk11k",
                    "tab_id": "tab-mp4dk6qf-7lyj",
                    "scope_key": "tab:tab-mp4dk6qf-7lyj",
                    "on_behalf_of": 1,
                    "ttl_hours": 24,
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["token_type"] == "bearer"
        assert data["chat_session_id"] == "0a4e1c41-fe54-4c1b-9efe-9fd3d1a38c6a"
        assert data["agent_type"] == "claude"
        assert data["expires_in_seconds"] > 0
        assert data["access_token"]

        claims = decode_access_token(data["access_token"])
        assert claims["purpose"] == "agent"
        assert claims["principal_type"] == "agent"
        assert claims["agent_type"] == "claude"
        assert claims["profile_id"] == "profile-mn4kk11k"
        assert claims["chat_session_id"] == "0a4e1c41-fe54-4c1b-9efe-9fd3d1a38c6a"
        assert claims["scope_key"] == "tab:tab-mp4dk6qf-7lyj"
        assert claims["tab_id"] == "tab-mp4dk6qf-7lyj"
        assert claims["on_behalf_of"] == 1

    @pytest.mark.asyncio
    async def test_admin_user_allowed_for_ops_or_test(self):
        """Admin escape hatch — ops and integration tests can still mint
        without spinning up a bridge token chain."""
        app = _app_for_tokens(principal=_admin_principal())
        async with _client(app) as client:
            resp = await client.post(
                "/api/v1/dev/agent-tokens/bridge-session",
                json={
                    "chat_session_id": "sess-123",
                    "agent_type": "codex",
                    "profile_id": "profile-x",
                    "on_behalf_of": 1,
                },
            )
        assert resp.status_code == 200
        claims = decode_access_token(resp.json()["access_token"])
        assert claims["agent_type"] == "codex"
        assert claims["chat_session_id"] == "sess-123"

    @pytest.mark.asyncio
    async def test_regular_user_rejected(self):
        """Non-admin user principals must not be able to mint agent tokens
        — the endpoint sits on the bridge→backend trust boundary."""
        app = _app_for_tokens(principal=_user_principal())
        async with _client(app) as client:
            resp = await client.post(
                "/api/v1/dev/agent-tokens/bridge-session",
                json={
                    "chat_session_id": "sess-y",
                    "agent_type": "claude",
                    "profile_id": "p",
                },
            )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_tab_id_mirrors_to_scope_key_when_only_tab_id_given(self):
        app = _app_for_tokens()
        async with _client(app) as client:
            resp = await client.post(
                "/api/v1/dev/agent-tokens/bridge-session",
                json={
                    "chat_session_id": "sess-mirror",
                    "agent_type": "claude",
                    "profile_id": "p",
                    "tab_id": "tab-abc",
                    "on_behalf_of": 1,
                    # scope_key omitted on purpose
                },
            )
        assert resp.status_code == 200
        claims = decode_access_token(resp.json()["access_token"])
        assert claims["tab_id"] == "tab-abc"
        assert claims["scope_key"] == "tab:tab-abc"

    @pytest.mark.asyncio
    async def test_user_scoped_bridge_inherits_on_behalf_of(self):
        """A user-scoped bridge token (``sub=<user_id>``) should be able to
        omit ``on_behalf_of`` — the endpoint reuses the bridge's user id."""
        app = _app_for_tokens(principal=_service_principal(user_id=42, admin=False))
        async with _client(app) as client:
            resp = await client.post(
                "/api/v1/dev/agent-tokens/bridge-session",
                json={
                    "chat_session_id": "sess-inherit",
                    "agent_type": "claude",
                    "profile_id": "p",
                    # on_behalf_of omitted
                },
            )
        assert resp.status_code == 200
        claims = decode_access_token(resp.json()["access_token"])
        assert claims["on_behalf_of"] == 42

    @pytest.mark.asyncio
    async def test_user_session_row_tracked_for_revocation(self):
        """Minted tokens are recorded in UserSession so logout cascades clean
        up the agent JWTs they spawned."""
        app = _app_for_tokens()
        async with _client(app) as client:
            resp = await client.post(
                "/api/v1/dev/agent-tokens/bridge-session",
                json={
                    "chat_session_id": "sess-track",
                    "agent_type": "claude",
                    "profile_id": "p",
                    "on_behalf_of": 7,
                },
            )
        assert resp.status_code == 200
        db = app.state.test_db
        assert len(db.added) == 1
        row = db.added[0]
        assert row.user_id == 7
        assert row.client_type == "bridge_agent_session"
        assert row.user_agent == "bridge/claude"
        # Token id matches the JWT's jti claim.
        claims = decode_access_token(resp.json()["access_token"])
        assert row.token_id == claims["jti"]
        db.commit.assert_awaited_once()


# ── Sentinel-never-appears regression ─────────────────────────────


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestSentinelRegression:
    """Direct guard that the minted token claims will satisfy the MCP server's
    ``_extract_chat_session_id_from_token`` extractor, so ``_handle_log_work``
    short-circuits before ever falling into the ``__bridge__`` sentinel
    resolution path (mcp_server.py:1085).
    """

    @pytest.mark.asyncio
    async def test_minted_token_yields_chat_session_id_via_client_extractor(self):
        app = _app_for_tokens()
        async with _client(app) as client:
            resp = await client.post(
                "/api/v1/dev/agent-tokens/bridge-session",
                json={
                    "chat_session_id": "real-uuid-not-sentinel",
                    "agent_type": "claude",
                    "profile_id": "p",
                    "on_behalf_of": 1,
                },
            )
        assert resp.status_code == 200
        token = resp.json()["access_token"]

        # Import the client-side extractor and assert it pulls the claim out
        # — this is the exact code path the MCP server takes at runtime.
        from pixsim7.client.mcp_server import (
            _extract_chat_session_id_from_token,
            _extract_scope_key_from_token,
        )
        extracted = _extract_chat_session_id_from_token(token)
        assert extracted == "real-uuid-not-sentinel", (
            "Minted token must expose chat_session_id via the same extractor "
            "the MCP server uses; otherwise resolution falls back to __bridge__."
        )
        # And it must NEVER yield the sentinel literal.
        assert extracted != "__bridge__"
        assert extracted != "unregistered"
        # scope_key extractor too — covers the tab-scoped resolution hint.
        assert _extract_scope_key_from_token(token) is None  # none supplied
