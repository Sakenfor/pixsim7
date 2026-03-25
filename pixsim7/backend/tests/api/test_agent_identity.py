"""Tests for agent/service identity — token minting, RequestPrincipal, audit recording."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

try:
    import httpx
    from fastapi import FastAPI, HTTPException
    from pixsim7.backend.main.api.dependencies import (
        get_current_principal,
        get_database,
    )
    from pixsim7.backend.main.api.v1.agent_tokens import router as agent_token_router
    from pixsim7.backend.main.api.v1.dev_plans import router as plans_router
    from pixsim7.backend.main.api.v1.ws_agent_cmd import _resolve_user_id, _resolve_user_id_strict
    from pixsim7.backend.main.shared.actor import RequestPrincipal
    from pixsim7.backend.main.shared.auth import (
        create_agent_token,
        decode_access_token,
    )

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


# ── Helpers ──────────────────────────────────────────────────────


def _admin_principal():
    return RequestPrincipal(
        id=1, principal_type="user", role="admin", admin=True,
        username="admin", display_name="Admin User",
        email="admin@test.local", permissions=[],
    )


def _user_principal():
    return RequestPrincipal(
        id=42, principal_type="user", role="user", admin=False,
        username="stefan", display_name="Stefan",
        email="stefan@test.local", permissions=[],
    )


def _app_for_tokens(*, principal=None) -> "FastAPI":
    from fastapi import FastAPI
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
    app.dependency_overrides[get_current_principal] = lambda: (principal or _admin_principal())
    app.state.test_db = fake_db
    return app


def _client(app):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


# ── Token minting tests ─────────────────────────────────────────


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestAgentTokenMinting:

    @pytest.mark.asyncio
    async def test_mint_agent_token_returns_valid_jwt(self):
        app = _app_for_tokens()
        async with _client(app) as client:
            resp = await client.post("/api/v1/dev/agent-tokens", json={
                "agent_id": "claude-session-abc",
                "agent_type": "claude-cli",
                "ttl_hours": 4,
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["token_type"] == "bearer"
        assert data["agent_id"] == "claude-session-abc"
        assert data["expires_in_hours"] == 4
        assert data["access_token"]
        assert len(app.state.test_db.added) == 1
        app.state.test_db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_mint_agent_token_non_admin_rejected(self):
        app = _app_for_tokens(principal=_user_principal())
        async with _client(app) as client:
            resp = await client.post("/api/v1/dev/agent-tokens", json={
                "agent_id": "agent-x",
            })
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_mint_agent_token_with_delegation(self):
        app = _app_for_tokens()
        async with _client(app) as client:
            resp = await client.post("/api/v1/dev/agent-tokens", json={
                "agent_id": "delegate-agent",
                "on_behalf_of": 42,
                "run_id": "run-123",
                "plan_id": "my-plan",
            })
        assert resp.status_code == 200
        data = resp.json()

        claims = decode_access_token(data["access_token"])
        assert claims["purpose"] == "agent"
        assert claims["principal_type"] == "agent"
        assert claims["agent_id"] == "delegate-agent"
        assert claims["on_behalf_of"] == 42
        assert claims["run_id"] == "run-123"
        assert claims["plan_id"] == "my-plan"


# ── create_agent_token unit tests ────────────────────────────────


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestCreateAgentTokenDirect:

    def test_creates_token_with_agent_claims(self):
        token = create_agent_token(agent_id="test-agent", agent_type="codex")
        claims = decode_access_token(token)
        assert claims["sub"] == "0"
        assert claims["purpose"] == "agent"
        assert claims["principal_type"] == "agent"
        assert claims["agent_id"] == "test-agent"
        assert claims["agent_type"] == "codex"
        assert claims["role"] == "agent"

    def test_optional_fields_omitted_when_not_provided(self):
        token = create_agent_token(agent_id="minimal")
        claims = decode_access_token(token)
        assert "on_behalf_of" not in claims
        assert "run_id" not in claims
        assert "plan_id" not in claims
        assert "scopes" not in claims

    def test_optional_fields_present_when_provided(self):
        token = create_agent_token(
            agent_id="full",
            scopes=["plans.write"],
            on_behalf_of=99,
            run_id="r-1",
            plan_id="p-1",
        )
        claims = decode_access_token(token)
        assert claims["on_behalf_of"] == 99
        assert claims["run_id"] == "r-1"
        assert claims["plan_id"] == "p-1"
        assert claims["scopes"] == ["plans.write"]


# ── RequestPrincipal model tests ─────────────────────────────────


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestRequestPrincipal:

    def test_user_principal(self):
        p = RequestPrincipal(id=42, username="stefan", display_name="Stefan")
        assert p.is_user
        assert not p.is_agent
        assert p.source == "user:42"
        assert p.actor_display_name == "Stefan"
        assert p.user_id == 42

    def test_agent_principal(self):
        p = RequestPrincipal(
            id=0, principal_type="agent",
            agent_id="claude-abc", run_id="run-1",
            plan_id="my-plan", on_behalf_of=42,
        )
        assert p.is_agent
        assert not p.is_user
        assert p.source == "agent:claude-abc"
        assert p.user_id == 42  # on_behalf_of
        ad = p.audit_dict()
        assert ad["agent_id"] == "claude-abc"
        assert ad["run_id"] == "run-1"
        assert ad["user_id"] == 42

    def test_user_compat_methods(self):
        p = RequestPrincipal(id=1, admin=True, permissions=["devtools.codegen"])
        assert p.is_admin()
        assert p.has_permission("devtools.codegen")
        assert p.has_permission("anything")  # admin has all
        assert p.is_active

    def test_from_jwt_agent_token(self):
        claims = {
            "sub": "0", "purpose": "agent", "principal_type": "agent",
            "agent_id": "test-a", "agent_type": "codex",
            "on_behalf_of": 42, "run_id": "run-x",
            "permissions": [], "role": "agent",
        }
        p = RequestPrincipal.from_jwt_payload(claims)
        assert p.is_agent
        assert p.agent_id == "test-a"
        assert p.on_behalf_of == 42

    def test_from_jwt_user_with_agent_headers(self):
        claims = {
            "sub": "42", "username": "stefan",
            "role": "user", "is_admin": False,
            "permissions": [], "is_active": True,
        }
        p = RequestPrincipal.from_jwt_payload(
            claims, x_agent_id="my-cli", x_run_id="run-99",
        )
        assert p.is_agent
        assert p.agent_id == "my-cli"
        assert p.on_behalf_of == 42
        assert p.run_id == "run-99"

    def test_from_jwt_bridge_token(self):
        claims = {
            "sub": "0", "purpose": "bridge",
            "role": "admin", "is_admin": True, "permissions": [],
        }
        p = RequestPrincipal.from_jwt_payload(claims)
        assert p.is_service
        assert p.source == "service:bridge"
        assert p.is_admin()

    def test_from_jwt_bridge_token_user_scoped(self):
        claims = {
            "sub": "42", "purpose": "bridge",
            "role": "user", "is_admin": False, "permissions": [],
        }
        p = RequestPrincipal.from_jwt_payload(claims)
        assert p.is_service
        assert p.id == 42
        assert p.user_id == 42
        assert p.source == "service:bridge"
        assert not p.is_admin()

    def test_from_jwt_regular_user(self):
        claims = {
            "sub": "7", "username": "alice", "email": "a@b.com",
            "role": "user", "is_admin": False,
            "permissions": ["devtools.codegen"], "is_active": True,
        }
        p = RequestPrincipal.from_jwt_payload(claims)
        assert p.is_user
        assert p.id == 7
        assert p.username == "alice"
        assert not p.is_admin()
        assert p.has_permission("devtools.codegen")


# ── Plan progress with agent context ────────────────────────────


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestWsBridgeIdentity:

    @pytest.mark.asyncio
    async def test_resolve_user_id_from_agent_token_on_behalf_of(self, monkeypatch):
        fake_auth = SimpleNamespace(
            verify_token_claims=AsyncMock(
                return_value={
                    "sub": "0",
                    "purpose": "agent",
                    "principal_type": "agent",
                    "agent_id": "assistant:code-helper",
                    "on_behalf_of": 1,
                    "permissions": [],
                    "role": "agent",
                }
            )
        )

        monkeypatch.setattr(
            "pixsim7.backend.main.api.dependencies.get_auth_service",
            lambda: fake_auth,
        )

        user_id = await _resolve_user_id("fake-token")
        assert user_id == 1
        fake_auth.verify_token_claims.assert_awaited_once_with(
            "fake-token",
            update_last_used=False,
        )

    @pytest.mark.asyncio
    async def test_resolve_user_id_invalid_token_non_strict_returns_none(self, monkeypatch):
        fake_auth = SimpleNamespace(
            verify_token_claims=AsyncMock(side_effect=RuntimeError("invalid token"))
        )
        monkeypatch.setattr(
            "pixsim7.backend.main.api.dependencies.get_auth_service",
            lambda: fake_auth,
        )

        user_id = await _resolve_user_id("bad-token")
        assert user_id is None

    @pytest.mark.asyncio
    async def test_resolve_user_id_invalid_token_strict_raises(self, monkeypatch):
        fake_auth = SimpleNamespace(
            verify_token_claims=AsyncMock(side_effect=RuntimeError("invalid token"))
        )
        monkeypatch.setattr(
            "pixsim7.backend.main.api.dependencies.get_auth_service",
            lambda: fake_auth,
        )

        with pytest.raises(RuntimeError):
            await _resolve_user_id_strict("bad-token")


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestPlanProgressAgentContext:

    @pytest.mark.asyncio
    async def test_progress_records_agent_metadata_in_checkpoint(self):
        """Agent principal => checkpoint.last_update.actor populated."""
        app = FastAPI()
        app.include_router(plans_router, prefix="/api/v1")

        async def _db():
            yield SimpleNamespace()

        # Provide an agent principal (in production, get_current_principal
        # reads X-Agent-Id headers from the request and builds this)
        agent_principal = RequestPrincipal(
            id=1, principal_type="agent", admin=True,
            agent_id="claude-abc", run_id="run-42",
            on_behalf_of=1, username="admin",
        )

        app.dependency_overrides[get_database] = _db
        app.dependency_overrides[get_current_principal] = lambda: agent_principal

        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[
                    {"id": "p1", "label": "Phase 1", "status": "pending", "points_total": 5, "points_done": 0}
                ]
            )
        )
        update_result = SimpleNamespace(
            plan_id="test-plan",
            changes=[{"field": "checkpoints"}],
            commit_sha=None,
            new_scope=None,
        )

        with patch(
            "pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
            new_callable=AsyncMock,
            return_value=bundle,
        ), patch(
            "pixsim7.backend.main.api.v1.dev_plans.update_plan",
            new_callable=AsyncMock,
            return_value=update_result,
        ):
            async with _client(app) as client:
                resp = await client.post(
                    "/api/v1/dev/plans/progress/test-plan",
                    json={
                        "checkpoint_id": "p1",
                        "points_delta": 1,
                        "note": "automated step",
                    },
                )

            assert resp.status_code == 200
            data = resp.json()
            last_update = data["checkpoint"]["last_update"]
            assert "actor" in last_update
            assert last_update["actor"]["agent_id"] == "claude-abc"
            assert last_update["actor"]["run_id"] == "run-42"
            assert last_update["actor"]["principal_type"] == "agent"

    @pytest.mark.asyncio
    async def test_progress_user_token_no_agent_in_last_update(self):
        """Normal user => checkpoint.last_update has no actor block."""
        app = FastAPI()
        app.include_router(plans_router, prefix="/api/v1")

        async def _db():
            yield SimpleNamespace()

        app.dependency_overrides[get_database] = _db
        app.dependency_overrides[get_current_principal] = lambda: _admin_principal()

        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[
                    {"id": "p1", "label": "Phase 1", "status": "pending", "points_total": 5, "points_done": 0}
                ]
            )
        )
        update_result = SimpleNamespace(
            plan_id="test-plan",
            changes=[{"field": "checkpoints"}],
            commit_sha=None,
            new_scope=None,
        )

        with patch(
            "pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
            new_callable=AsyncMock,
            return_value=bundle,
        ), patch(
            "pixsim7.backend.main.api.v1.dev_plans.update_plan",
            new_callable=AsyncMock,
            return_value=update_result,
        ):
            async with _client(app) as client:
                resp = await client.post(
                    "/api/v1/dev/plans/progress/test-plan",
                    json={
                        "checkpoint_id": "p1",
                        "points_delta": 1,
                    },
                )
            assert resp.status_code == 200
            last_update = resp.json()["checkpoint"]["last_update"]
            assert "actor" not in last_update
            assert last_update["by"] == "Admin User"


# ── update_plan service function ─────────────────────────────────


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestUpdatePlanPrincipalArg:

    @pytest.mark.asyncio
    async def test_update_plan_passes_principal_not_tuple(self):
        """update_plan_endpoint passes principal= kwarg (not 3 loose args)."""
        app = FastAPI()
        app.include_router(plans_router, prefix="/api/v1")

        async def _db():
            yield SimpleNamespace()

        app.dependency_overrides[get_database] = _db
        app.dependency_overrides[get_current_principal] = lambda: _admin_principal()

        update_result = SimpleNamespace(
            plan_id="plan-x", changes=[], commit_sha=None, new_scope=None,
        )

        with patch(
            "pixsim7.backend.main.api.v1.dev_plans.update_plan",
            new_callable=AsyncMock,
            return_value=update_result,
        ) as mock_update:
            async with _client(app) as client:
                resp = await client.patch(
                    "/api/v1/dev/plans/plan-x",
                    json={"status": "active"},
                )
            assert resp.status_code == 200
            call_kwargs = mock_update.call_args
            # Should be called with principal= keyword
            assert "principal" in call_kwargs.kwargs
            p = call_kwargs.kwargs["principal"]
            assert hasattr(p, "source")
            assert hasattr(p, "is_agent")
