"""Tests for the scope-authorization DB bridge (services/ownership/scope_authz).

Checkpoint 2 of plan ``scoped-agent-authorization``: prove the bridge between
the pure resolver and the live AgentProfile source — grant assembly per
principal type, and the 403 gate. HTTP-level endpoint enforcement tests are
checkpoint 6.
"""
import pytest
from fastapi import HTTPException

from pixsim7.backend.main.services.ownership.scope_authz import (
    ResourceScope,
    assert_scope_access,
    load_scope_grants,
)


# ── Test doubles ─────────────────────────────────────────────────


class _Principal:
    def __init__(self, *, is_agent=False, profile_id=None, admin=False):
        self._is_agent = is_agent
        self.profile_id = profile_id
        self._admin = admin

    @property
    def is_agent(self) -> bool:
        return self._is_agent

    def is_admin(self) -> bool:
        return self._admin


class _Profile:
    def __init__(self, assigned_plans=None, allowed_contracts=None, default_scopes=None):
        self.assigned_plans = assigned_plans
        self.allowed_contracts = allowed_contracts
        self.default_scopes = default_scopes


class _FakeDB:
    """Minimal async stand-in for AsyncSession: only ``get`` is exercised."""

    def __init__(self, profile=None):
        self._profile = profile
        self.get_calls = 0

    async def get(self, _model, _pk):
        self.get_calls += 1
        return self._profile


AGENT_PLAN_P1 = _Principal(is_agent=True, profile_id="prof-1")


# ── load_scope_grants: source assembly per principal type ────────


class TestLoadScopeGrants:
    @pytest.mark.asyncio
    async def test_none_principal(self):
        assert await load_scope_grants(_FakeDB(), None) == ()

    @pytest.mark.asyncio
    async def test_non_agent_skips_fetch(self):
        db = _FakeDB(profile=_Profile(assigned_plans=["p1"]))
        grants = await load_scope_grants(db, _Principal(is_agent=False))
        assert grants == ()
        assert db.get_calls == 0  # humans/admins never trigger a profile fetch

    @pytest.mark.asyncio
    async def test_agent_without_profile_id(self):
        db = _FakeDB(profile=_Profile(assigned_plans=["p1"]))
        grants = await load_scope_grants(db, _Principal(is_agent=True, profile_id=None))
        assert grants == ()
        assert db.get_calls == 0

    @pytest.mark.asyncio
    async def test_agent_missing_profile_row(self):
        db = _FakeDB(profile=None)  # db.get returns None
        grants = await load_scope_grants(db, AGENT_PLAN_P1)
        assert grants == ()
        assert db.get_calls == 1

    @pytest.mark.asyncio
    async def test_agent_with_assigned_plans(self):
        db = _FakeDB(profile=_Profile(assigned_plans=["p1", "p2"]))
        grants = await load_scope_grants(db, AGENT_PLAN_P1)
        kinds = {g.kind for g in grants}
        assert "plan" in kinds


# ── assert_scope_access: the 403 gate ───────────────────────────


class TestAssertScopeAccess:
    @pytest.mark.asyncio
    async def test_in_scope_plan_passes(self):
        db = _FakeDB(profile=_Profile(assigned_plans=["p1"]))
        await assert_scope_access(db, AGENT_PLAN_P1, ResourceScope("plan", "p1"))  # no raise

    @pytest.mark.asyncio
    async def test_out_of_scope_plan_denied(self):
        db = _FakeDB(profile=_Profile(assigned_plans=["p1"]))
        with pytest.raises(HTTPException) as exc:
            await assert_scope_access(db, AGENT_PLAN_P1, ResourceScope("plan", "p99"))
        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_null_assigned_plans_unrestricted(self):
        # The default for every existing agent: assigned_plans=None ⇒ open.
        db = _FakeDB(profile=_Profile(assigned_plans=None))
        await assert_scope_access(db, AGENT_PLAN_P1, ResourceScope("plan", "anything"))  # no raise

    @pytest.mark.asyncio
    async def test_empty_assigned_plans_denies_all_plans(self):
        db = _FakeDB(profile=_Profile(assigned_plans=[]))
        with pytest.raises(HTTPException) as exc:
            await assert_scope_access(db, AGENT_PLAN_P1, ResourceScope("plan", "p1"))
        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_admin_human_passes_without_fetch(self):
        db = _FakeDB(profile=_Profile(assigned_plans=[]))
        admin = _Principal(is_agent=False, admin=True)
        await assert_scope_access(db, admin, ResourceScope("plan", "p1"))  # no raise
        assert db.get_calls == 0

    @pytest.mark.asyncio
    async def test_other_kind_not_narrowed_by_plan_grant(self):
        db = _FakeDB(profile=_Profile(assigned_plans=["p1"]))
        # A plan restriction must not bleed into contract access.
        await assert_scope_access(db, AGENT_PLAN_P1, ResourceScope("contract", "c1"))  # no raise
