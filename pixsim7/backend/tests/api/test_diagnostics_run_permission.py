"""API + gate tests for the agent-runnable diagnostics surface.

Covers the permission gate added so non-admin agents can run allowlisted
tools/scripts via the MCP `diagnostics` contract, and the attribution wiring
that records the caller's `source` (e.g. ``agent:<profile_id>``) as the run's
``started_by``.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

try:
    import httpx
    from fastapi import FastAPI, HTTPException

    from pixsim7.backend.main.api.dependencies import (
        DIAGNOSTICS_PERMISSION,
        get_current_diagnostics_principal,
    )
    from pixsim7.backend.main.api.v1.dev_testing_diagnostics import router
    from pixsim7.backend.main.shared.actor import RequestPrincipal

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

TEST_SUITE = {
    "id": "diagnostics-run-permission",
    "label": "Diagnostics Run Permission + Attribution",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "diagnostics",
    "covers": [
        "pixsim7/backend/main/api/v1/dev_testing_diagnostics.py",
        "pixsim7/backend/main/api/dependencies.py",
    ],
    "order": 26,
}


pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")


# ── Gate unit tests (the admin-OR-permission logic) ──────────────────────


class TestDiagnosticsGate:
    @pytest.mark.asyncio
    async def test_admin_passes_without_permission(self):
        admin = RequestPrincipal(id=1, principal_type="user", admin=True)
        assert await get_current_diagnostics_principal(admin) is admin

    @pytest.mark.asyncio
    async def test_agent_with_permission_passes(self):
        agent = RequestPrincipal(
            principal_type="agent",
            profile_id="profile-x",
            permissions=[DIAGNOSTICS_PERMISSION],
        )
        assert await get_current_diagnostics_principal(agent) is agent

    @pytest.mark.asyncio
    async def test_agent_without_permission_403(self):
        agent = RequestPrincipal(principal_type="agent", profile_id="profile-x")
        with pytest.raises(HTTPException) as exc:
            await get_current_diagnostics_principal(agent)
        assert exc.value.status_code == 403
        assert DIAGNOSTICS_PERMISSION in exc.value.detail


# ── Endpoint tests (gating wiring + attribution) ─────────────────────────


def _app(principal: RequestPrincipal | None) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    if principal is None:
        async def _deny():
            raise HTTPException(status_code=401, detail="Not authenticated")

        app.dependency_overrides[get_current_diagnostics_principal] = _deny
    else:
        app.dependency_overrides[get_current_diagnostics_principal] = lambda: principal
    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    )


def _fake_diagnostic():
    # spec.params empty -> _coerce_params returns {} for any body.params.
    # get_spec() mirrors the real Diagnostic interface — coercion reads it so
    # dynamically-built specs (e.g. ShellScriptDiagnostic) stay in sync.
    spec = SimpleNamespace(id="shell-script", params=[])
    return SimpleNamespace(spec=spec, get_spec=lambda: spec)


def _select_diagnostic():
    # A diagnostic whose get_spec() carries a select with a fixed option set —
    # stands in for ShellScriptDiagnostic's dynamic script options. Coercion
    # must validate the chosen value against get_spec() (the dynamic source).
    param = SimpleNamespace(
        name="script",
        kind="select",
        default="tools/a.py",
        options=["tools/a.py", "tools/b.py"],
        required=True,
    )
    spec = SimpleNamespace(id="shell-script", params=[param])
    return SimpleNamespace(spec=spec, get_spec=lambda: spec)


class TestDiagnosticsRunEndpoint:
    @pytest.mark.asyncio
    async def test_agent_run_attributes_started_by_to_agent_source(self):
        agent = RequestPrincipal(
            principal_type="agent",
            profile_id="profile-abc",
            permissions=[DIAGNOSTICS_PERMISSION],
        )
        app = _app(agent)

        fake_run = SimpleNamespace(
            run_id="run-1",
            diagnostic_id="shell-script",
            started_at=datetime.now(timezone.utc),
            started_by="agent:profile-abc",
        )
        start_mock = AsyncMock(return_value=fake_run)

        with (
            patch(
                "pixsim7.backend.main.api.v1.dev_testing_diagnostics.diagnostic_registry.get_or_none",
                return_value=_fake_diagnostic(),
            ),
            patch(
                "pixsim7.backend.main.api.v1.dev_testing_diagnostics.diagnostic_run_manager.start",
                start_mock,
            ),
        ):
            async with _client(app) as c:
                resp = await c.post(
                    "/api/v1/dev/testing/diagnostics/shell-script/run",
                    json={"params": {}},
                )

        assert resp.status_code == 200
        assert resp.json()["run_id"] == "run-1"
        # Attribution: started_by is the agent source, not a generic id.
        assert start_mock.await_args.kwargs["started_by"] == "agent:profile-abc"

    @pytest.mark.asyncio
    async def test_unauthenticated_run_401(self):
        app = _app(None)
        async with _client(app) as c:
            resp = await c.post(
                "/api/v1/dev/testing/diagnostics/shell-script/run",
                json={"params": {}},
            )
        assert resp.status_code == 401


class TestParamCoercionAgainstDynamicSpec:
    """Coercion validates select values against get_spec() — the dynamic source.
    Guards the regression where switching from .spec to .get_spec() in
    _coerce_params would silently reject (or accept) the wrong options."""

    @pytest.mark.asyncio
    async def test_unknown_select_option_is_rejected(self):
        agent = RequestPrincipal(
            principal_type="agent", profile_id="p", permissions=[DIAGNOSTICS_PERMISSION]
        )
        app = _app(agent)
        with patch(
            "pixsim7.backend.main.api.v1.dev_testing_diagnostics.diagnostic_registry.get_or_none",
            return_value=_select_diagnostic(),
        ):
            async with _client(app) as c:
                resp = await c.post(
                    "/api/v1/dev/testing/diagnostics/shell-script/run",
                    json={"params": {"script": "tools/NOT_REAL.py"}},
                )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_known_select_option_passes_through_coerced(self):
        agent = RequestPrincipal(
            principal_type="agent", profile_id="p", permissions=[DIAGNOSTICS_PERMISSION]
        )
        app = _app(agent)
        fake_run = SimpleNamespace(
            run_id="run-2",
            diagnostic_id="shell-script",
            started_at=datetime.now(timezone.utc),
            started_by="agent:p",
        )
        start_mock = AsyncMock(return_value=fake_run)
        with (
            patch(
                "pixsim7.backend.main.api.v1.dev_testing_diagnostics.diagnostic_registry.get_or_none",
                return_value=_select_diagnostic(),
            ),
            patch(
                "pixsim7.backend.main.api.v1.dev_testing_diagnostics.diagnostic_run_manager.start",
                start_mock,
            ),
        ):
            async with _client(app) as c:
                resp = await c.post(
                    "/api/v1/dev/testing/diagnostics/shell-script/run",
                    json={"params": {"script": "tools/b.py"}},
                )
        assert resp.status_code == 200
        # The coerced params (start's 2nd positional arg) carry the valid choice.
        assert start_mock.await_args.args[1]["script"] == "tools/b.py"
