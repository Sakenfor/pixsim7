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
    MEDIA = "media"
    PASSWORD_RESET = "password_reset"
    EMAIL_VERIFICATION = "email_verification"


# Default TTLs — override via ttl_hours param when minting
DEFAULT_TTL: dict[TokenKind, timedelta] = {
    TokenKind.USER: timedelta(days=30),           # from settings, this is the fallback
    TokenKind.BRIDGE: timedelta(hours=24),
    TokenKind.AGENT: timedelta(hours=8),
    # Short-lived, read-only token carried in <video>/<img> src query strings
    # (browsers can't set an Authorization header on media element requests).
    # Kept brief because a query-string token can leak into logs/history.
    TokenKind.MEDIA: timedelta(minutes=15),
    TokenKind.PASSWORD_RESET: timedelta(hours=1),
    TokenKind.EMAIL_VERIFICATION: timedelta(days=7),
}

# Tokens with these purposes skip UserSession revocation checks. Media tokens
# are short-lived and minted on demand, so per-token revocation isn't worth a
# session row — they simply expire.
SKIP_SESSION_TRACKING: set[TokenKind] = {TokenKind.BRIDGE, TokenKind.MEDIA}


# Permissions an agent may inherit from the user it acts on behalf of
# (the "agent can do what the user who spawned it can do" model). This is a
# deliberately narrow allowlist: agent tokens must NOT silently inherit a
# user's full grant set. Add a permission here only when an agent is meant to
# wield it on the user's behalf. ``is_admin`` is never inherited.
AGENT_INHERITABLE_PERMISSIONS: frozenset[str] = frozenset({"devtools.diagnostics"})


def filter_inheritable_permissions(permissions: Optional[list[str]]) -> list[str]:
    """Narrow a user's permission set to those an agent may inherit.

    Order-preserving and de-duplicated. Used when minting an on-behalf agent
    token so the agent can wield a capability the spawning user holds (e.g.
    ``devtools.diagnostics``) without inheriting the rest.
    """
    if not permissions:
        return []
    seen: set[str] = set()
    out: list[str] = []
    for perm in permissions:
        if perm in AGENT_INHERITABLE_PERMISSIONS and perm not in seen:
            seen.add(perm)
            out.append(perm)
    return out


async def resolve_inheritable_agent_permissions(db, user_id: Optional[int]) -> list[str]:
    """Load the on-behalf user's agent-inheritable permissions.

    Returns ``[]`` for headless tokens (no user), unknown users, or on any
    lookup failure — token minting must never hard-fail on this best-effort
    inheritance step. ``db`` is an ``AsyncSession`` (duck-typed to avoid an
    import cycle).
    """
    if user_id is None:
        return []
    try:
        from pixsim7.backend.main.domain import User

        user = await db.get(User, int(user_id))
    except Exception:
        return []
    if user is None:
        return []
    return filter_inheritable_permissions(getattr(user, "permissions", None))


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
    permissions: list[str] | None = None,
    run_id: str | None = None,
    plan_id: str | None = None,
    profile_id: str | None = None,
    scope_key: str | None = None,
    chat_session_id: str | None = None,
    tab_id: str | None = None,
    is_admin: bool = False,
) -> dict[str, Any]:
    # `is_admin` defaults False — the safe agent invariant. It is set True ONLY
    # for an explicitly admin-elevated profile token, and only when the minting
    # caller is themselves an admin (gate in mint_profile_token). The decode
    # side (actor.from_jwt_payload) likewise honors this claim only for agent
    # tokens that carry it, so existing/basic tokens stay non-admin.
    data: dict[str, Any] = {
        "sub": "0",
        "purpose": "agent",
        "principal_type": "agent",
        "profile_id": profile_id or agent_id,
        "agent_type": agent_type,
        "role": "agent",
        "is_admin": bool(is_admin),
        "is_active": True,
        # Permissions inherited from the on-behalf user, narrowed to the
        # agent-inheritable allowlist by the caller (see
        # filter_inheritable_permissions). Empty for headless / unscoped agents.
        "permissions": list(permissions or []),
    }
    if scopes:
        data["scopes"] = scopes
    if on_behalf_of is not None:
        data["on_behalf_of"] = on_behalf_of
    if run_id:
        data["run_id"] = run_id
    if plan_id:
        data["plan_id"] = plan_id
    if scope_key:
        data["scope_key"] = scope_key
    if chat_session_id:
        data["chat_session_id"] = chat_session_id
    if tab_id:
        data["tab_id"] = tab_id
    return data


def _media_claims(*, user_id: int) -> dict[str, Any]:
    """Read-only media-streaming token. Resolves to the owning user so the
    existing ``u/{user.id}/`` ownership check on media routes still gates
    access — it grants nothing beyond serving that user's own files."""
    return {
        "sub": str(user_id),
        "purpose": "media",
        "role": "user",
        "is_admin": False,
        "permissions": [],
        "is_active": True,
    }


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
    TokenKind.MEDIA: _media_claims,
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
