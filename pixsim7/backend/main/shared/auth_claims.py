"""
Auth Claims - Shared authentication types for cross-domain use

This module provides lightweight auth context types that can be used
across different domains (game, content, etc.) without tight coupling
to the full User domain model.

Benefits:
- Reduces coupling between domains
- Makes domain boundaries explicit
- Simplifies game service signatures
- Easier to split services later if needed
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field


def _parse_exp(value) -> Optional[datetime]:
    """Normalize JWT exp claim to timezone-aware datetime."""
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc)
    return None


class AuthClaims(BaseModel):
    """
    Decoded JWT token claims

    Lightweight representation of authenticated user from JWT payload.
    Use this when you only need basic identity info without hitting the database.
    """
    user_id: int
    token_id: str  # jti - unique token identifier
    email: Optional[str] = None
    username: Optional[str] = None
    is_admin: bool = False
    exp: Optional[datetime] = None  # token expiration

    @classmethod
    def from_jwt_payload(cls, payload: dict) -> "AuthClaims":
        """
        Create AuthClaims from decoded JWT payload

        Args:
            payload: Decoded JWT payload from decode_access_token()

        Returns:
            AuthClaims instance
        """
        return cls(
            user_id=int(payload["sub"]),
            token_id=payload["jti"],
            email=payload.get("email"),
            username=payload.get("username"),
            is_admin=payload.get("is_admin", False),
            exp=_parse_exp(payload.get("exp")),
        )


class AuthPrincipal(BaseModel):
    """
    Claims-based request principal for game-facing routes.

    This avoids loading full ORM user records when only identity and role data
    are needed.
    """

    id: int
    token_id: str
    email: Optional[str] = None
    username: Optional[str] = None
    role: Optional[str] = None
    admin: bool = False
    permissions: list[str] = Field(default_factory=list)
    is_active: bool = True
    exp: Optional[datetime] = None

    @classmethod
    def from_jwt_payload(cls, payload: dict) -> "AuthPrincipal":
        def _safe_int(value, default: int = 0) -> int:
            try:
                return int(value)
            except (TypeError, ValueError):
                return default

        purpose = str(payload.get("purpose") or "").lower()
        principal_type = str(payload.get("principal_type") or "").lower()
        is_agent = purpose == "agent" or principal_type == "agent"

        # For agent tokens, game APIs should scope to delegated owner.
        # Fall back to ``sub`` when delegation is absent.
        resolved_id = _safe_int(payload.get("sub"), default=0)
        if is_agent and payload.get("on_behalf_of") is not None:
            resolved_id = _safe_int(payload.get("on_behalf_of"), default=0)
        if resolved_id < 0:
            resolved_id = 0

        role = payload.get("role")
        is_admin_claim = bool(payload.get("is_admin", False))
        role_is_admin = str(role).lower() in {"admin", "super_admin"} if role is not None else False
        return cls(
            id=resolved_id,
            token_id=payload["jti"],
            email=payload.get("email"),
            username=payload.get("username"),
            role=role,
            admin=is_admin_claim or role_is_admin,
            permissions=list(payload.get("permissions") or []),
            is_active=bool(payload.get("is_active", True)),
            exp=_parse_exp(payload.get("exp")),
        )

    @property
    def user_id(self) -> int:
        return self.id

    def is_admin(self) -> bool:
        return self.admin

    def has_permission(self, permission: str) -> bool:
        return self.is_admin() or permission in self.permissions


class UserContext(BaseModel):
    """
    Minimal user context for domain services

    Use this instead of the full User ORM model when services only need
    basic user identity. Reduces coupling to the user domain.

    Example:
        # Instead of:
        async def create_session(self, user: User, scene_id: int) -> GameSession:
            session = GameSession(user_id=user.id, ...)

        # Use:
        async def create_session(self, user_id: int, scene_id: int) -> GameSession:
            session = GameSession(user_id=user_id, ...)
    """
    user_id: int
    is_admin: bool = False

    @classmethod
    def from_user(cls, user) -> "UserContext":
        """
        Create UserContext from User domain model

        Args:
            user: User ORM model

        Returns:
            UserContext instance
        """
        return cls(
            user_id=user.id,
            is_admin=user.is_admin(),
        )

    @classmethod
    def from_claims(cls, claims: AuthClaims) -> "UserContext":
        """
        Create UserContext from AuthClaims

        Args:
            claims: AuthClaims from JWT

        Returns:
            UserContext instance
        """
        return cls(
            user_id=claims.user_id,
            is_admin=claims.is_admin,
        )
