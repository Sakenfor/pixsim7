"""Tests for pixsim7.common.scope_grants — the scoped-authorization resolver.

Checkpoint 1 of plan ``scoped-agent-authorization``. These pin the core
semantics (NULL = unrestricted, [] = deny-all, additive union, admin bypass,
kind-level always-pass) so that wiring it into chokepoints (checkpoint 2) and
adding new grant sources (membership / delegation / capability) can't silently
drift the contract.
"""
import pytest
from fastapi import HTTPException

from pixsim7.common.scope_grants import (
    ResourceScope,
    ScopeGrant,
    assert_can_access,
    build_grants_from_profile,
    can_access,
    grants_from_scope_strings,
    merge_grants,
)


# ── Test doubles ─────────────────────────────────────────────────


class _Principal:
    """Duck-typed principal: ``is_admin`` as a callable, like RequestPrincipal."""

    def __init__(self, admin: bool = False):
        self._admin = admin

    def is_admin(self) -> bool:
        return self._admin


class _AttrAdminPrincipal:
    """Principal exposing ``is_admin`` as a bare attribute, not a method."""

    def __init__(self, admin: bool):
        self.is_admin = admin


class _Profile:
    def __init__(self, assigned_plans=None, allowed_contracts=None, default_scopes=None):
        self.assigned_plans = assigned_plans
        self.allowed_contracts = allowed_contracts
        self.default_scopes = default_scopes


USER = _Principal(admin=False)
ADMIN = _Principal(admin=True)


# ── ResourceScope normalization ──────────────────────────────────


class TestResourceScope:
    def test_int_id_normalized_to_str(self):
        assert ResourceScope("world", 42).id == "42"

    def test_str_id_unchanged(self):
        assert ResourceScope("plan", "p1").id == "p1"

    def test_none_id_preserved(self):
        assert ResourceScope("plan").id is None


# ── can_access: principal gating ─────────────────────────────────


class TestPrincipalGating:
    def test_none_principal_denied(self):
        assert can_access(None, ResourceScope("plan", "p1")) is False

    def test_admin_always_passes_even_when_restricted(self):
        grants = [ScopeGrant.restricted("plan", ["other"])]
        assert can_access(ADMIN, ResourceScope("plan", "p1"), grants=grants) is True

    def test_attribute_admin_bypass(self):
        grants = [ScopeGrant.restricted("plan", ["other"])]
        assert can_access(_AttrAdminPrincipal(True), ResourceScope("plan", "p1"), grants=grants) is True

    def test_attribute_non_admin_evaluated(self):
        grants = [ScopeGrant.restricted("plan", ["other"])]
        assert can_access(_AttrAdminPrincipal(False), ResourceScope("plan", "p1"), grants=grants) is False


# ── can_access: NULL = unrestricted, [] = deny-all ───────────────


class TestUnrestrictedVsDenyAll:
    def test_no_grants_means_unrestricted(self):
        # Legacy open behaviour: nothing narrows this kind.
        assert can_access(USER, ResourceScope("plan", "p1"), grants=()) is True

    def test_grant_for_other_kind_does_not_narrow_this_kind(self):
        grants = [ScopeGrant.restricted("contract", ["c1"])]
        assert can_access(USER, ResourceScope("plan", "p1"), grants=grants) is True

    def test_unrestricted_grant_passes(self):
        grants = [ScopeGrant.unrestricted("plan")]
        assert can_access(USER, ResourceScope("plan", "p1"), grants=grants) is True

    def test_restricted_grant_allows_listed_id(self):
        grants = [ScopeGrant.restricted("plan", ["p1", "p2"])]
        assert can_access(USER, ResourceScope("plan", "p1"), grants=grants) is True

    def test_restricted_grant_denies_unlisted_id(self):
        grants = [ScopeGrant.restricted("plan", ["p1", "p2"])]
        assert can_access(USER, ResourceScope("plan", "p3"), grants=grants) is False

    def test_empty_grant_is_deny_all(self):
        grants = [ScopeGrant.restricted("plan", [])]
        assert can_access(USER, ResourceScope("plan", "p1"), grants=grants) is False


# ── can_access: kind-level questions ─────────────────────────────


class TestKindLevel:
    def test_kind_level_always_passes_even_when_restricted(self):
        grants = [ScopeGrant.restricted("plan", ["p1"])]
        assert can_access(USER, ResourceScope("plan", None), grants=grants) is True

    def test_kind_level_passes_for_deny_all(self):
        grants = [ScopeGrant.restricted("plan", [])]
        assert can_access(USER, ResourceScope("plan"), grants=grants) is True


# ── can_access: int/str id coercion at the boundary ──────────────


class TestIdCoercion:
    def test_int_scope_id_matches_str_grant(self):
        grants = [ScopeGrant.restricted("world", [42])]  # restricted() str-izes ids
        assert can_access(USER, ResourceScope("world", 42), grants=grants) is True


# ── Additive union across multiple grants ────────────────────────


class TestAdditiveUnion:
    def test_two_restricted_grants_union(self):
        grants = [
            ScopeGrant.restricted("plan", ["p1"]),
            ScopeGrant.restricted("plan", ["p2"]),
        ]
        assert can_access(USER, ResourceScope("plan", "p2"), grants=grants) is True

    def test_unrestricted_wins_over_restricted(self):
        grants = [
            ScopeGrant.restricted("plan", ["p1"]),
            ScopeGrant.unrestricted("plan"),
        ]
        assert can_access(USER, ResourceScope("plan", "anything"), grants=grants) is True


# ── grants_from_scope_strings ────────────────────────────────────


class TestGrantsFromScopeStrings:
    def test_none_yields_nothing(self):
        assert grants_from_scope_strings(None) == ()

    def test_empty_yields_nothing(self):
        assert grants_from_scope_strings([]) == ()

    def test_bare_kind_is_unrestricted(self):
        grants = grants_from_scope_strings(["world"])
        assert grants == (ScopeGrant.unrestricted("world"),)

    def test_wildcard_is_unrestricted(self):
        grants = grants_from_scope_strings(["world:*"])
        assert grants == (ScopeGrant.unrestricted("world"),)

    def test_kind_id_is_restricted(self):
        grants = grants_from_scope_strings(["world:42"])
        assert grants == (ScopeGrant.restricted("world", ["42"]),)

    def test_multiple_ids_same_kind_union(self):
        grants = grants_from_scope_strings(["world:42", "world:43"])
        assert grants == (ScopeGrant.restricted("world", ["42", "43"]),)

    def test_unrestricted_absorbs_restricted_same_kind(self):
        grants = grants_from_scope_strings(["world:42", "world"])
        assert grants == (ScopeGrant.unrestricted("world"),)

    def test_blank_and_nonstring_entries_skipped(self):
        grants = grants_from_scope_strings(["", "  ", 7, None, "plan:p1"])
        assert grants == (ScopeGrant.restricted("plan", ["p1"]),)


# ── build_grants_from_profile ────────────────────────────────────


class TestBuildGrantsFromProfile:
    def test_none_profile(self):
        assert build_grants_from_profile(None) == ()

    def test_all_null_fields_unrestricted(self):
        # NULL everywhere ⇒ no grants ⇒ unrestricted everywhere.
        grants = build_grants_from_profile(_Profile())
        assert grants == ()
        assert can_access(USER, ResourceScope("plan", "p1"), grants=grants) is True

    def test_assigned_plans_maps_to_plan_kind(self):
        grants = build_grants_from_profile(_Profile(assigned_plans=["p1"]))
        assert can_access(USER, ResourceScope("plan", "p1"), grants=grants) is True
        assert can_access(USER, ResourceScope("plan", "p2"), grants=grants) is False

    def test_empty_assigned_plans_is_deny_all_plans(self):
        grants = build_grants_from_profile(_Profile(assigned_plans=[]))
        assert can_access(USER, ResourceScope("plan", "p1"), grants=grants) is False
        # but other kinds remain unrestricted
        assert can_access(USER, ResourceScope("contract", "c1"), grants=grants) is True

    def test_allowed_contracts_maps_to_contract_kind(self):
        grants = build_grants_from_profile(_Profile(allowed_contracts=["c1"]))
        assert can_access(USER, ResourceScope("contract", "c1"), grants=grants) is True
        assert can_access(USER, ResourceScope("contract", "c2"), grants=grants) is False

    def test_default_scopes_cover_other_kinds(self):
        grants = build_grants_from_profile(_Profile(default_scopes=["world:42"]))
        assert can_access(USER, ResourceScope("world", "42"), grants=grants) is True
        assert can_access(USER, ResourceScope("world", "99"), grants=grants) is False

    def test_default_scopes_and_assigned_plans_union_per_kind(self):
        # default_scopes also narrows plan; should union with assigned_plans.
        profile = _Profile(assigned_plans=["p1"], default_scopes=["plan:p2"])
        grants = build_grants_from_profile(profile)
        assert can_access(USER, ResourceScope("plan", "p1"), grants=grants) is True
        assert can_access(USER, ResourceScope("plan", "p2"), grants=grants) is True
        assert can_access(USER, ResourceScope("plan", "p3"), grants=grants) is False


# ── merge_grants ─────────────────────────────────────────────────


class TestMergeGrants:
    def test_one_per_kind(self):
        merged = merge_grants(
            [
                ScopeGrant.restricted("plan", ["p1"]),
                ScopeGrant.restricted("plan", ["p2"]),
                ScopeGrant.restricted("world", ["42"]),
            ]
        )
        kinds = [g.kind for g in merged]
        assert kinds == ["plan", "world"]
        plan_grant = next(g for g in merged if g.kind == "plan")
        assert plan_grant.allowed_ids == frozenset({"p1", "p2"})

    def test_unrestricted_absorbs(self):
        merged = merge_grants(
            [ScopeGrant.restricted("plan", ["p1"]), ScopeGrant.unrestricted("plan")]
        )
        assert merged == (ScopeGrant.unrestricted("plan"),)


# ── assert_can_access ────────────────────────────────────────────


class TestAssertCanAccess:
    def test_passes_silently(self):
        assert_can_access(USER, ResourceScope("plan", "p1"), grants=())  # no raise

    def test_raises_403_when_denied(self):
        grants = [ScopeGrant.restricted("plan", ["p1"])]
        with pytest.raises(HTTPException) as exc:
            assert_can_access(USER, ResourceScope("plan", "p2"), grants=grants)
        assert exc.value.status_code == 403

    def test_admin_never_raises(self):
        grants = [ScopeGrant.restricted("plan", [])]  # deny-all for non-admin
        assert_can_access(ADMIN, ResourceScope("plan", "p1"), grants=grants)  # no raise
