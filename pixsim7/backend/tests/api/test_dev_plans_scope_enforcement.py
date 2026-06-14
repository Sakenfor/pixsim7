"""HTTP-level enforcement tests for scoped-agent authorization on plan writes.

cp6 of plan ``scoped-agent-authorization``. Drives the real dev_plans endpoint
dependency chain (get_current_principal → assert_scope_access → load_scope_grants
→ db.get(AgentProfile)) to prove the gate denies out-of-scope writes and lets
in-scope / unrestricted / admin through. Fills the gap left by
test_dev_plans_destructive_permissions (which only covered the admin role gate,
never assigned_plans).

Trick: the 403 path short-circuits before update_plan, so it's shape-free. For
pass-through we patch update_plan to raise HTTPException(418) as a sentinel —
reaching it (418) means the scope gate passed; 403 means it blocked.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

try:
    import httpx
    from fastapi import FastAPI, HTTPException
    from pixsim7.backend.main.api.dependencies import get_current_principal, get_database
    from pixsim7.backend.main.api.v1.dev_plans import router

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="backend imports unavailable")

GATE_PASSED = 418  # sentinel: control reached update_plan (i.e. scope gate allowed)

_DEV_PLANS = "pixsim7.backend.main.api.v1.dev_plans"


def _agent(*, profile_id: str = "collab", admin: bool = False, is_agent: bool = True):
    return SimpleNamespace(
        id=7,
        user_id=7,
        on_behalf_of=7,
        role="agent" if is_agent else "admin",
        profile_id=profile_id,
        is_agent=is_agent,
        is_admin=(lambda: admin),
        source="agent:collab",
        actor_display_name="collab",
    )


def _profile(**kw):
    base = dict(assigned_plans=None, default_scopes=None, allowed_contracts=None)
    base.update(kw)
    return SimpleNamespace(**base)


def _app(principal, profile) -> "FastAPI":
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def _db():
        yield SimpleNamespace(get=AsyncMock(return_value=profile))

    app.dependency_overrides[get_database] = _db
    app.dependency_overrides[get_current_principal] = lambda: principal
    return app


def _client(app: "FastAPI"):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t")


def _update_patches():
    """Bypass the authoring-policy gate and turn update_plan into the sentinel."""
    return (
        patch(f"{_DEV_PLANS}.evaluate_plan_update_policy", return_value=([], [])),
        patch(f"{_DEV_PLANS}.update_plan", new=AsyncMock(side_effect=HTTPException(status_code=GATE_PASSED))),
    )


async def _patch_plan(app, plan_id):
    async with _client(app) as c:
        return await c.patch(f"/api/v1/dev/plans/{plan_id}", json={"summary": "x"})


# ── update endpoint: the assigned_plans matrix ───────────────────


@pytest.mark.asyncio
async def test_restricted_agent_denied_out_of_scope_plan():
    app = _app(_agent(), _profile(assigned_plans=["allowed-plan"]))
    p1, p2 = _update_patches()
    with p1, p2:
        resp = await _patch_plan(app, "forbidden-plan")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_restricted_agent_allowed_in_scope_plan():
    app = _app(_agent(), _profile(assigned_plans=["allowed-plan"]))
    p1, p2 = _update_patches()
    with p1, p2:
        resp = await _patch_plan(app, "allowed-plan")
    assert resp.status_code == GATE_PASSED  # gate passed → reached update_plan


@pytest.mark.asyncio
async def test_unrestricted_agent_allowed_any_plan():
    # assigned_plans=None ⇒ unrestricted; every existing agent's default.
    app = _app(_agent(), _profile(assigned_plans=None))
    p1, p2 = _update_patches()
    with p1, p2:
        resp = await _patch_plan(app, "any-plan")
    assert resp.status_code == GATE_PASSED


@pytest.mark.asyncio
async def test_admin_bypasses_scope_gate():
    # Admin (non-agent) is never narrowed — the agent can never exceed the
    # granting admin, but the admin themselves is unrestricted.
    app = _app(_agent(admin=True, is_agent=False), _profile(assigned_plans=["something-else"]))
    p1, p2 = _update_patches()
    with p1, p2:
        resp = await _patch_plan(app, "forbidden-plan")
    assert resp.status_code == GATE_PASSED


@pytest.mark.asyncio
async def test_empty_assigned_plans_denies_all():
    # [] = deny-all (distinct from NULL = unrestricted).
    app = _app(_agent(), _profile(assigned_plans=[]))
    p1, p2 = _update_patches()
    with p1, p2:
        resp = await _patch_plan(app, "any-plan")
    assert resp.status_code == 403


# ── progress endpoint: second chokepoint, denial path ────────────


@pytest.mark.asyncio
async def test_progress_denied_out_of_scope_plan():
    app = _app(_agent(), _profile(assigned_plans=["allowed-plan"]))
    # Gate fires right after the bundle 404 check, before checkpoint logic,
    # so a truthy bundle is all that's needed to reach it.
    with patch(f"{_DEV_PLANS}.get_plan_bundle", new=AsyncMock(return_value=SimpleNamespace())):
        async with _client(app) as c:
            resp = await c.post(
                "/api/v1/dev/plans/progress/forbidden-plan",
                json={"checkpoint_id": "c", "note": "x"},
            )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_progress_allowed_in_scope_plan_passes_gate():
    app = _app(_agent(), _profile(assigned_plans=["allowed-plan"]))
    # Truthy bundle with no checkpoints → after the gate passes, the endpoint
    # rejects with 400 "no checkpoints". Not 403 ⇒ the gate allowed it.
    with patch(f"{_DEV_PLANS}.get_plan_bundle", new=AsyncMock(return_value=SimpleNamespace(plan=SimpleNamespace(checkpoints=[])))):
        async with _client(app) as c:
            resp = await c.post(
                "/api/v1/dev/plans/progress/allowed-plan",
                json={"checkpoint_id": "c", "note": "x"},
            )
    assert resp.status_code != 403
    assert resp.status_code == 400  # reached the post-gate "no checkpoints" guard
