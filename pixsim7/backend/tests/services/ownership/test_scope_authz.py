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
    filter_allowed_contracts,
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


# ── cp3: WORLD scope via default_scopes ("world:<id>") ───────────


class TestWorldScopeViaDefaultScopes:
    @pytest.mark.asyncio
    async def test_in_scope_world_passes(self):
        db = _FakeDB(profile=_Profile(default_scopes=["world:42"]))
        # int world id is coerced to str at the ResourceScope boundary.
        await assert_scope_access(db, AGENT_PLAN_P1, ResourceScope("world", 42))  # no raise

    @pytest.mark.asyncio
    async def test_out_of_scope_world_denied(self):
        db = _FakeDB(profile=_Profile(default_scopes=["world:42"]))
        with pytest.raises(HTTPException) as exc:
            await assert_scope_access(db, AGENT_PLAN_P1, ResourceScope("world", 99))
        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_null_default_scopes_unrestricted(self):
        db = _FakeDB(profile=_Profile(default_scopes=None))
        await assert_scope_access(db, AGENT_PLAN_P1, ResourceScope("world", 7))  # no raise

    @pytest.mark.asyncio
    async def test_world_grant_does_not_narrow_plans(self):
        # default_scopes restricting worlds must leave plan access unrestricted.
        db = _FakeDB(profile=_Profile(default_scopes=["world:42"]))
        await assert_scope_access(db, AGENT_PLAN_P1, ResourceScope("plan", "any-plan"))  # no raise

    @pytest.mark.asyncio
    async def test_wildcard_world_scope_allows_any_world(self):
        db = _FakeDB(profile=_Profile(default_scopes=["world:*"]))
        await assert_scope_access(db, AGENT_PLAN_P1, ResourceScope("world", 123))  # no raise


# ── project scope via default_scopes ("project:<id>") ────────────


class TestProjectScopeViaDefaultScopes:
    @pytest.mark.asyncio
    async def test_in_scope_project_passes(self):
        db = _FakeDB(profile=_Profile(default_scopes=["project:12"]))
        await assert_scope_access(db, AGENT_PLAN_P1, ResourceScope("project", 12))  # no raise

    @pytest.mark.asyncio
    async def test_out_of_scope_project_denied(self):
        db = _FakeDB(profile=_Profile(default_scopes=["project:12"]))
        with pytest.raises(HTTPException) as exc:
            await assert_scope_access(db, AGENT_PLAN_P1, ResourceScope("project", 99))
        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_world_scope_does_not_narrow_projects(self):
        # A world grant must leave project access unrestricted (distinct kinds).
        db = _FakeDB(profile=_Profile(default_scopes=["world:42"]))
        await assert_scope_access(db, AGENT_PLAN_P1, ResourceScope("project", 7))  # no raise


# ── cp4: contract discovery filtering (allowed_contracts) ────────


ALL_CONTRACTS = ["plans.management", "prompts.authoring", "devtools.codegen"]


class TestFilterAllowedContracts:
    @pytest.mark.asyncio
    async def test_restricted_agent_sees_only_allowed(self):
        db = _FakeDB(profile=_Profile(allowed_contracts=["plans.management"]))
        allowed = await filter_allowed_contracts(db, AGENT_PLAN_P1, ALL_CONTRACTS)
        assert allowed == {"plans.management"}

    @pytest.mark.asyncio
    async def test_null_allowed_contracts_sees_all(self):
        db = _FakeDB(profile=_Profile(allowed_contracts=None))
        allowed = await filter_allowed_contracts(db, AGENT_PLAN_P1, ALL_CONTRACTS)
        assert allowed == set(ALL_CONTRACTS)

    @pytest.mark.asyncio
    async def test_empty_allowed_contracts_sees_none(self):
        db = _FakeDB(profile=_Profile(allowed_contracts=[]))
        allowed = await filter_allowed_contracts(db, AGENT_PLAN_P1, ALL_CONTRACTS)
        assert allowed == set()

    @pytest.mark.asyncio
    async def test_human_sees_all_without_fetch(self):
        db = _FakeDB(profile=_Profile(allowed_contracts=[]))
        human = _Principal(is_agent=False)
        allowed = await filter_allowed_contracts(db, human, ALL_CONTRACTS)
        assert allowed == set(ALL_CONTRACTS)
        assert db.get_calls == 0

    @pytest.mark.asyncio
    async def test_none_principal_sees_all(self):
        # Unauthenticated /meta/contracts callers (no principal) are unfiltered.
        db = _FakeDB(profile=_Profile(allowed_contracts=["plans.management"]))
        allowed = await filter_allowed_contracts(db, None, ALL_CONTRACTS)
        assert allowed == set(ALL_CONTRACTS)
