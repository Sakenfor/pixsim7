"""Tests for token_policy — centralized token types, TTLs, and claims builders."""
from __future__ import annotations

TEST_SUITE = {
    "id": "token-policy",
    "label": "Token Policy",
    "kind": "unit",
    "category": "backend/api",
    "subcategory": "auth-policy",
    "covers": [
        "pixsim7/backend/main/services/user/token_policy.py",
    ],
    "order": 36,
}

import time
from datetime import timedelta

import pytest

try:
    from pixsim7.backend.main.services.user.token_policy import (
        DEFAULT_TTL,
        SKIP_SESSION_TRACKING,
        TokenKind,
        get_default_ttl,
        mint_token,
        should_track_session,
    )
    from pixsim7.backend.main.shared.auth import decode_access_token

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="backend deps not available")


# ═══════════════════════════════════════════════════════════════════
# TokenKind enum
# ═══════════════════════════════════════════════════════════════════


class TestTokenKind:

    def test_all_kinds_have_default_ttl(self):
        for kind in TokenKind:
            assert kind in DEFAULT_TTL, f"{kind} missing from DEFAULT_TTL"

    def test_kind_values_are_strings(self):
        for kind in TokenKind:
            assert isinstance(kind.value, str)

    def test_bridge_skips_session_tracking(self):
        assert TokenKind.BRIDGE in SKIP_SESSION_TRACKING

    def test_user_tracks_sessions(self):
        assert TokenKind.USER not in SKIP_SESSION_TRACKING

    def test_agent_tracks_sessions(self):
        assert TokenKind.AGENT not in SKIP_SESSION_TRACKING


# ═══════════════════════════════════════════════════════════════════
# TTL defaults
# ═══════════════════════════════════════════════════════════════════


class TestDefaultTTL:

    def test_bridge_is_24h(self):
        assert get_default_ttl(TokenKind.BRIDGE) == timedelta(hours=24)

    def test_agent_is_8h(self):
        assert get_default_ttl(TokenKind.AGENT) == timedelta(hours=8)

    def test_password_reset_is_1h(self):
        assert get_default_ttl(TokenKind.PASSWORD_RESET) == timedelta(hours=1)

    def test_email_verification_is_7d(self):
        assert get_default_ttl(TokenKind.EMAIL_VERIFICATION) == timedelta(days=7)


# ═══════════════════════════════════════════════════════════════════
# Session tracking policy
# ═══════════════════════════════════════════════════════════════════


class TestSessionPolicy:

    def test_should_track_user(self):
        assert should_track_session(TokenKind.USER) is True

    def test_should_track_agent(self):
        assert should_track_session(TokenKind.AGENT) is True

    def test_should_not_track_bridge(self):
        assert should_track_session(TokenKind.BRIDGE) is False


# ═══════════════════════════════════════════════════════════════════
# mint_token — bridge
# ═══════════════════════════════════════════════════════════════════


class TestMintBridge:

    def test_user_scoped_bridge(self):
        token = mint_token(TokenKind.BRIDGE, user_id=42)
        payload = decode_access_token(token)
        assert payload["sub"] == "42"
        assert payload["purpose"] == "bridge"
        assert payload["role"] == "user"
        assert payload["is_admin"] is False

    def test_shared_bridge(self):
        token = mint_token(TokenKind.BRIDGE, user_id=None)
        payload = decode_access_token(token)
        assert payload["sub"] == "0"
        assert payload["purpose"] == "bridge"
        assert payload["role"] == "admin"
        assert payload["is_admin"] is True

    def test_bridge_default_ttl_is_24h(self):
        token = mint_token(TokenKind.BRIDGE, user_id=1)
        payload = decode_access_token(token)
        remaining = payload["exp"] - time.time()
        assert 23 * 3600 < remaining < 25 * 3600

    def test_bridge_custom_ttl(self):
        token = mint_token(TokenKind.BRIDGE, user_id=1, ttl=timedelta(hours=1))
        payload = decode_access_token(token)
        remaining = payload["exp"] - time.time()
        assert 0.9 * 3600 < remaining < 1.1 * 3600


# ═══════════════════════════════════════════════════════════════════
# mint_token — agent
# ═══════════════════════════════════════════════════════════════════


class TestMintAgent:

    def test_basic_agent_token(self):
        token = mint_token(TokenKind.AGENT, agent_id="profile-abc", agent_type="claude")
        payload = decode_access_token(token)
        assert payload["sub"] == "0"
        assert payload["purpose"] == "agent"
        assert payload["principal_type"] == "agent"
        assert payload["profile_id"] == "profile-abc"
        assert payload["agent_type"] == "claude"

    def test_agent_with_delegation(self):
        token = mint_token(
            TokenKind.AGENT,
            agent_id="profile-abc",
            agent_type="codex",
            on_behalf_of=42,
            run_id="run-123",
            plan_id="my-plan",
        )
        payload = decode_access_token(token)
        assert payload["on_behalf_of"] == 42
        assert payload["run_id"] == "run-123"
        assert payload["plan_id"] == "my-plan"

    def test_agent_with_scopes(self):
        token = mint_token(
            TokenKind.AGENT,
            agent_id="p1",
            scopes=["read", "write"],
        )
        payload = decode_access_token(token)
        assert payload["scopes"] == ["read", "write"]

    def test_agent_without_optional_fields(self):
        token = mint_token(TokenKind.AGENT, agent_id="p1")
        payload = decode_access_token(token)
        assert "on_behalf_of" not in payload
        assert "run_id" not in payload
        assert "plan_id" not in payload
        assert "scopes" not in payload

    def test_agent_default_ttl_is_8h(self):
        token = mint_token(TokenKind.AGENT, agent_id="p1")
        payload = decode_access_token(token)
        remaining = payload["exp"] - time.time()
        assert 7 * 3600 < remaining < 9 * 3600


# ═══════════════════════════════════════════════════════════════════
# mint_token — user
# ═══════════════════════════════════════════════════════════════════


class TestMintUser:

    def test_user_token_claims(self):
        token = mint_token(
            TokenKind.USER,
            user_id=1,
            email="test@example.com",
            username="testuser",
            role="admin",
            is_admin=True,
            permissions=["devtools.codegen"],
        )
        payload = decode_access_token(token)
        assert payload["sub"] == "1"
        assert payload["email"] == "test@example.com"
        assert payload["username"] == "testuser"
        assert payload["role"] == "admin"
        assert payload["is_admin"] is True
        assert "devtools.codegen" in payload["permissions"]

    def test_user_token_defaults(self):
        token = mint_token(TokenKind.USER, user_id=1)
        payload = decode_access_token(token)
        assert payload["role"] == "user"
        assert payload["is_admin"] is False
        assert payload["permissions"] == []

    def test_no_purpose_field_on_user_token(self):
        """User tokens should NOT have a purpose field (distinguishes from bridge/agent)."""
        token = mint_token(TokenKind.USER, user_id=1)
        payload = decode_access_token(token)
        assert "purpose" not in payload


# ═══════════════════════════════════════════════════════════════════
# mint_token — password reset / email verification
# ═══════════════════════════════════════════════════════════════════


class TestMintSpecialPurpose:

    def test_password_reset_claims(self):
        token = mint_token(TokenKind.PASSWORD_RESET, user_id=1)
        payload = decode_access_token(token)
        assert payload["sub"] == "1"
        assert payload["type"] == "password_reset"

    def test_password_reset_ttl_is_1h(self):
        token = mint_token(TokenKind.PASSWORD_RESET, user_id=1)
        payload = decode_access_token(token)
        remaining = payload["exp"] - time.time()
        assert 0.9 * 3600 < remaining < 1.1 * 3600

    def test_email_verification_claims(self):
        token = mint_token(TokenKind.EMAIL_VERIFICATION, user_id=1)
        payload = decode_access_token(token)
        assert payload["sub"] == "1"
        assert payload["type"] == "email_verification"

    def test_email_verification_ttl_is_7d(self):
        token = mint_token(TokenKind.EMAIL_VERIFICATION, user_id=1)
        payload = decode_access_token(token)
        remaining = payload["exp"] - time.time()
        assert 6.9 * 86400 < remaining < 7.1 * 86400


# ═══════════════════════════════════════════════════════════════════
# Parity — mint_token produces same claims as existing functions
# ═══════════════════════════════════════════════════════════════════


class TestParityWithExisting:
    """Verify mint_token produces tokens compatible with existing code."""

    def test_bridge_token_matches_mint_bridge_token(self):
        """Policy bridge token has same claims shape as _mint_bridge_token."""
        from pixsim7.backend.main.services.llm.remote_cmd_bridge import _mint_bridge_token

        old = decode_access_token(_mint_bridge_token(user_id=1))
        new = decode_access_token(mint_token(TokenKind.BRIDGE, user_id=1))

        # Same claims (ignore jti/exp which are unique per token)
        for key in ("sub", "purpose", "role", "is_admin", "is_active"):
            assert old[key] == new[key], f"Mismatch on {key}: {old[key]} vs {new[key]}"

    def test_bridge_shared_token_matches(self):
        from pixsim7.backend.main.services.llm.remote_cmd_bridge import _mint_bridge_token

        old = decode_access_token(_mint_bridge_token(user_id=None))
        new = decode_access_token(mint_token(TokenKind.BRIDGE, user_id=None))

        for key in ("sub", "purpose", "role", "is_admin"):
            assert old[key] == new[key], f"Mismatch on {key}"

    def test_agent_token_has_expected_claims(self):
        """Agent token has the canonical claims shape."""
        payload = decode_access_token(mint_token(
            TokenKind.AGENT, agent_id="p1", agent_type="claude", on_behalf_of=42, run_id="r1",
        ))
        assert payload["sub"] == "0"
        assert payload["purpose"] == "agent"
        assert payload["principal_type"] == "agent"
        assert payload["profile_id"] == "p1"
        assert payload["agent_type"] == "claude"
        assert payload["on_behalf_of"] == 42
        assert payload["run_id"] == "r1"
