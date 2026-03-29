"""Token policy — centralized token types, TTLs, and claims builders.

This module sits between the JWT primitives (``shared/auth.py``) and the
endpoints/services that mint tokens.  It encodes the *policy* decisions
(what claims, what TTL, whether to track sessions) in one place rather
than scattering them across call sites.

Usage::

    from pixsim7.backend.main.shared.token_policy import TokenKind, mint_token

    token = mint_token(TokenKind.BRIDGE, user_id=1)
    token = mint_token(TokenKind.AGENT, agent_id="profile-abc", agent_type="claude", on_behalf_of=42)
    token = mint_token(TokenKind.USER, user=user_obj)
"""
from __future__ import annotations

from datetime import timedelta
from enum import Enum
from typing import Any, Optional


# ═══════════════════════════════════════════════════════════════════
# Token kinds and TTL constants
# ═══════════════════════════════════════════════════════════════════


class TokenKind(str, Enum):
    """All token types in the system."""

    USER = "user"
    BRIDGE = "bridge"
    AGENT = "agent"
    PASSWORD_RESET = "password_reset"
    EMAIL_VERIFICATION = "email_verification"


# Default TTLs — override via ttl_hours param when minting
DEFAULT_TTL: dict[TokenKind, timedelta] = {
    TokenKind.USER: timedelta(days=30),           # from settings, this is the fallback
    TokenKind.BRIDGE: timedelta(hours=24),
    TokenKind.AGENT: timedelta(hours=8),
    TokenKind.PASSWORD_RESET: timedelta(hours=1),
    TokenKind.EMAIL_VERIFICATION: timedelta(days=7),
}

# Tokens with these purposes skip UserSession revocation checks
SKIP_SESSION_TRACKING: set[TokenKind] = {TokenKind.BRIDGE}


# ═══════════════════════════════════════════════════════════════════
# Claims builders — one per token kind
# ═══════════════════════════════════════════════════════════════════


def _user_claims(
    *,
    user_id: int,
    email: str = "",
    username: str = "",
    role: str = "user",
    is_admin: bool = False,
    permissions: list[str] | None = None,
    is_active: bool = True,
) -> dict[str, Any]:
    return {
        "sub": str(user_id),
        "email": email,
        "username": username,
        "role": role,
        "is_admin": is_admin,
        "permissions": list(permissions or []),
        "is_active": is_active,
    }


def _bridge_claims(
    *,
    user_id: int | None = None,
) -> dict[str, Any]:
    if user_id is not None:
        return {
            "sub": str(user_id),
            "purpose": "bridge",
            "role": "user",
            "is_admin": False,
            "permissions": [],
            "is_active": True,
        }
    # Shared/admin bridge — sub=0 signals service identity
    return {
        "sub": "0",
        "purpose": "bridge",
        "role": "admin",
        "is_admin": True,
        "permissions": [],
        "is_active": True,
    }


def _agent_claims(
    *,
    agent_id: str,
    agent_type: str = "unknown",
    scopes: list[str] | None = None,
    on_behalf_of: int | None = None,
    run_id: str | None = None,
    plan_id: str | None = None,
    profile_id: str | None = None,
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "sub": "0",
        "purpose": "agent",
        "principal_type": "agent",
        "profile_id": profile_id or agent_id,
        "agent_type": agent_type,
        "role": "agent",
        "is_admin": False,
        "is_active": True,
        "permissions": [],
    }
    if scopes:
        data["scopes"] = scopes
    if on_behalf_of is not None:
        data["on_behalf_of"] = on_behalf_of
    if run_id:
        data["run_id"] = run_id
    if plan_id:
        data["plan_id"] = plan_id
    return data


def _password_reset_claims(*, user_id: int) -> dict[str, Any]:
    return {
        "sub": str(user_id),
        "type": "password_reset",
    }


def _email_verification_claims(*, user_id: int) -> dict[str, Any]:
    return {
        "sub": str(user_id),
        "type": "email_verification",
    }


_CLAIMS_BUILDERS = {
    TokenKind.USER: _user_claims,
    TokenKind.BRIDGE: _bridge_claims,
    TokenKind.AGENT: _agent_claims,
    TokenKind.PASSWORD_RESET: _password_reset_claims,
    TokenKind.EMAIL_VERIFICATION: _email_verification_claims,
}


# ═══════════════════════════════════════════════════════════════════
# Unified minting
# ═══════════════════════════════════════════════════════════════════


def mint_token(
    kind: TokenKind,
    *,
    ttl: timedelta | None = None,
    **claims_kwargs,
) -> str:
    """Mint a token of the given kind with the appropriate claims and TTL.

    Args:
        kind: Token type (determines claims shape, default TTL, session policy).
        ttl: Override TTL. If None, uses the default for this kind.
        **claims_kwargs: Passed to the claims builder for this kind.

    Returns:
        Signed JWT string.
    """
    from pixsim7.backend.main.shared.auth import create_access_token

    builder = _CLAIMS_BUILDERS.get(kind)
    if not builder:
        raise ValueError(f"Unknown token kind: {kind}")

    claims = builder(**claims_kwargs)
    expires = ttl or DEFAULT_TTL.get(kind, timedelta(hours=8))

    return create_access_token(data=claims, expires_delta=expires)


def get_default_ttl(kind: TokenKind) -> timedelta:
    """Get the default TTL for a token kind."""
    return DEFAULT_TTL.get(kind, timedelta(hours=8))


def should_track_session(kind: TokenKind) -> bool:
    """Whether tokens of this kind should create UserSession records."""
    return kind not in SKIP_SESSION_TRACKING
