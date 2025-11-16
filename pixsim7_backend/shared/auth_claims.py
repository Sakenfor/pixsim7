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
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


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
            exp=payload.get("exp"),
        )


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
