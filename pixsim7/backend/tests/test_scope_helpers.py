"""Tests for pixsim7.backend.main.shared.scope_helpers."""
import pytest

from pixsim7.common.scope_helpers import (
    normalize_scope_value,
    normalize_profile_id,
    derive_scope_key,
    parse_scope_key,
    extract_scope,
)


# ── normalize_scope_value ────────────────────────────────────────


class TestNormalizeScopeValue:
    def test_valid_string(self):
        assert normalize_scope_value("plan:foo") == "plan:foo"

    def test_strips_whitespace(self):
        assert normalize_scope_value("  plan:foo  ") == "plan:foo"

    def test_empty_string(self):
        assert normalize_scope_value("") is None

    def test_whitespace_only(self):
        assert normalize_scope_value("   ") is None

    def test_none(self):
        assert normalize_scope_value(None) is None

    def test_non_string_int(self):
        assert normalize_scope_value(42) is None

    def test_non_string_dict(self):
        assert normalize_scope_value({}) is None


# ── normalize_profile_id ─────────────────────────────────────────


class TestNormalizeProfileId:
    def test_valid_id(self):
        assert normalize_profile_id("profile-abc") == "profile-abc"

    def test_strips_whitespace(self):
        assert normalize_profile_id("  profile-abc  ") == "profile-abc"

    def test_none(self):
        assert normalize_profile_id(None) is None

    def test_empty_string(self):
        assert normalize_profile_id("") is None

    @pytest.mark.parametrize("sentinel", ["unknown", "Unknown", "UNKNOWN", "none", "None", "null", "Null"])
    def test_base_sentinels(self, sentinel):
        assert normalize_profile_id(sentinel) is None

    def test_extra_sentinels(self):
        assert normalize_profile_id("agent", extra_sentinels=frozenset({"agent"})) is None

    def test_extra_sentinels_case_insensitive(self):
        assert normalize_profile_id("Agent", extra_sentinels=frozenset({"agent"})) is None

    def test_extra_sentinels_does_not_affect_normal(self):
        assert normalize_profile_id("profile-abc", extra_sentinels=frozenset({"agent"})) == "profile-abc"

    def test_no_extra_sentinels_allows_agent(self):
        assert normalize_profile_id("agent") == "agent"


# ── derive_scope_key ─────────────────────────────────────────────


class TestDeriveScopeKey:
    def test_explicit_scope_key(self):
        assert derive_scope_key({}, "tab:tab-123") == "tab:tab-123"

    def test_explicit_overrides_context(self):
        assert derive_scope_key({"plan_id": "p1"}, "tab:tab-123") == "tab:tab-123"

    def test_context_scope_key(self):
        assert derive_scope_key({"scope_key": "custom:abc"}, None) == "custom:abc"

    def test_context_camel_case_scope_key(self):
        assert derive_scope_key({"scopeKey": "custom:abc"}, None) == "custom:abc"

    def test_plan_id_from_context(self):
        assert derive_scope_key({"plan_id": "my-plan"}, None) == "plan:my-plan"

    def test_plan_id_camel_case(self):
        assert derive_scope_key({"planId": "my-plan"}, None) == "plan:my-plan"

    def test_plan_id_x_prefix(self):
        assert derive_scope_key({"x_plan_id": "my-plan"}, None) == "plan:my-plan"

    def test_contract_id_from_context(self):
        assert derive_scope_key({"contract_id": "c1"}, None) == "contract:c1"

    def test_contract_alias(self):
        assert derive_scope_key({"contract": "c1"}, None) == "contract:c1"

    def test_plan_takes_priority_over_contract(self):
        assert derive_scope_key({"plan_id": "p1", "contract_id": "c1"}, None) == "plan:p1"

    def test_empty_context_returns_none(self):
        assert derive_scope_key({}, None) is None

    def test_empty_string_explicit_falls_through(self):
        assert derive_scope_key({"plan_id": "p1"}, "") == "plan:p1"

    def test_whitespace_only_explicit_falls_through(self):
        assert derive_scope_key({"plan_id": "p1"}, "   ") == "plan:p1"


# ── parse_scope_key ─────────────────────────────────────────��────


class TestParseScopeKey:
    def test_plan_scope(self):
        assert parse_scope_key("plan:my-plan") == ("my-plan", None)

    def test_contract_scope(self):
        assert parse_scope_key("contract:my-contract") == (None, "my-contract")

    def test_tab_scope(self):
        assert parse_scope_key("tab:tab-123") == (None, None)

    def test_none(self):
        assert parse_scope_key(None) == (None, None)

    def test_empty(self):
        assert parse_scope_key("") == (None, None)

    def test_plan_with_whitespace(self):
        assert parse_scope_key("plan:  my-plan  ") == ("my-plan", None)

    def test_plan_empty_after_colon(self):
        assert parse_scope_key("plan:") == (None, None)

    def test_plan_whitespace_after_colon(self):
        assert parse_scope_key("plan:   ") == (None, None)


# ── extract_scope ────────────────────────────────────────────────


class TestExtractScope:
    def test_explicit_plan_scope_key(self):
        scope_key, plan_id, contract_id = extract_scope({}, "plan:my-plan")
        assert scope_key == "plan:my-plan"
        assert plan_id == "my-plan"
        assert contract_id is None

    def test_plan_from_context(self):
        scope_key, plan_id, contract_id = extract_scope({"plan_id": "my-plan"})
        assert scope_key == "plan:my-plan"
        assert plan_id == "my-plan"

    def test_contract_from_context(self):
        scope_key, plan_id, contract_id = extract_scope({"contract_id": "c1"})
        assert scope_key == "contract:c1"
        assert contract_id == "c1"

    def test_scope_key_reverse_fills_plan(self):
        """Explicit scope_key 'plan:X' fills in plan_id when not in context."""
        scope_key, plan_id, contract_id = extract_scope({}, "plan:agent-profiles-v1")
        assert plan_id == "agent-profiles-v1"

    def test_scope_key_reverse_fills_contract(self):
        scope_key, plan_id, contract_id = extract_scope({}, "contract:c1")
        assert contract_id == "c1"

    def test_context_plan_id_takes_priority(self):
        """Context plan_id is preferred over reverse-parsed scope_key."""
        scope_key, plan_id, contract_id = extract_scope(
            {"plan_id": "from-context"}, "plan:from-scope"
        )
        assert plan_id == "from-context"
        assert scope_key == "plan:from-scope"

    def test_tab_scope_key_no_ids(self):
        scope_key, plan_id, contract_id = extract_scope({}, "tab:tab-abc")
        assert scope_key == "tab:tab-abc"
        assert plan_id is None
        assert contract_id is None

    def test_empty_context_no_scope(self):
        scope_key, plan_id, contract_id = extract_scope({})
        assert scope_key is None
        assert plan_id is None
        assert contract_id is None

    def test_mid_conversation_plan_link(self):
        """Simulates adding @plan: reference mid-conversation.

        The scope_key changes from tab:X to plan:Y.
        """
        scope_key, plan_id, contract_id = extract_scope(
            {"plan_id": "agent-profiles-v1"},
            "plan:agent-profiles-v1",
        )
        assert scope_key == "plan:agent-profiles-v1"
        assert plan_id == "agent-profiles-v1"
        assert contract_id is None
