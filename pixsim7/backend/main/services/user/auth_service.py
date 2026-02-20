"""
AuthService - authentication and session management

Clean service for login, logout, and JWT token management
"""
import asyncio
import hashlib
from datetime import datetime, timezone
from typing import Any, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from pixsim7.backend.main.domain import User, UserSession
from pixsim7.backend.main.shared.auth import (
    verify_password,
    create_access_token,
    decode_access_token,
    get_token_jti,
)
from pixsim7.backend.main.shared.errors import (
    AuthenticationError,
    ResourceNotFoundError,
)
from pixsim7.backend.main.services.user.user_service import UserService
import logging

logger = logging.getLogger(__name__)


class AuthService:
    """
    Authentication service

    Handles:
    - User login (password verification + JWT generation)
    - Logout (session revocation)
    - Token verification
    - Session management
    """

    def __init__(self, db: AsyncSession, user_service: UserService):
        self.db = db
        self.users = user_service

    # Short-lived in-memory cache for token claim introspection.
    # Keyed by sha256(token) + verification mode, invalidated on revocation.
    _claims_cache: dict[str, tuple[float, dict[str, Any], str]] = {}
    _claims_cache_by_jti: dict[str, set[str]] = {}
    _claims_cache_lock = asyncio.Lock()

    @staticmethod
    def _claims_cache_digest(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    @staticmethod
    def _exp_to_datetime(exp_claim: Any) -> datetime | None:
        if isinstance(exp_claim, (int, float)):
            return datetime.fromtimestamp(exp_claim, tz=timezone.utc)
        if isinstance(exp_claim, datetime):
            return exp_claim if exp_claim.tzinfo else exp_claim.replace(tzinfo=timezone.utc)
        return None

    @classmethod
    def _is_payload_expired(cls, payload: dict[str, Any]) -> bool:
        exp = cls._exp_to_datetime(payload.get("exp"))
        if exp is None:
            return False
        return exp <= datetime.now(timezone.utc)

    @classmethod
    def _evict_claims_cache_key_locked(cls, cache_key: str) -> None:
        entry = cls._claims_cache.pop(cache_key, None)
        if not entry:
            return

        _, _, jti = entry
        jti_keys = cls._claims_cache_by_jti.get(jti)
        if not jti_keys:
            return
        jti_keys.discard(cache_key)
        if not jti_keys:
            cls._claims_cache_by_jti.pop(jti, None)

    @classmethod
    async def _cache_get_claims(cls, cache_key: str) -> dict[str, Any] | None:
        now_monotonic = asyncio.get_running_loop().time()
        async with cls._claims_cache_lock:
            entry = cls._claims_cache.get(cache_key)
            if not entry:
                return None
            expires_monotonic, payload, _ = entry
            if expires_monotonic <= now_monotonic or cls._is_payload_expired(payload):
                cls._evict_claims_cache_key_locked(cache_key)
                return None
            return dict(payload)

    @classmethod
    async def _cache_set_claims(
        cls,
        *,
        cache_key: str,
        payload: dict[str, Any],
        jti: str,
        ttl_seconds: float,
    ) -> None:
        ttl = float(ttl_seconds)
        if ttl <= 0:
            return

        expires_monotonic = asyncio.get_running_loop().time() + ttl
        async with cls._claims_cache_lock:
            cls._evict_claims_cache_key_locked(cache_key)
            cls._claims_cache[cache_key] = (expires_monotonic, dict(payload), jti)
            cls._claims_cache_by_jti.setdefault(jti, set()).add(cache_key)

    @classmethod
    async def evict_claims_cache_for_jti(cls, jti: str) -> None:
        async with cls._claims_cache_lock:
            keys = list(cls._claims_cache_by_jti.get(jti, set()))
            for cache_key in keys:
                cls._evict_claims_cache_key_locked(cache_key)

    @classmethod
    async def clear_claims_cache(cls) -> None:
        async with cls._claims_cache_lock:
            cls._claims_cache.clear()
            cls._claims_cache_by_jti.clear()

    # ===== LOGIN / LOGOUT =====

    async def login(
        self,
        email_or_username: str,
        password: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        client_id: Optional[str] = None,
        client_type: Optional[str] = None,
        client_name: Optional[str] = None
    ) -> Tuple[User, str]:
        """
        Authenticate user and create session

        Args:
            email_or_username: Email or username
            password: Plain text password
            ip_address: Client IP address (for logging)
            user_agent: Client user agent (for logging)
            client_id: Persistent device/client identifier (optional)
            client_type: Type of client (e.g., "chrome_extension", "web_app") (optional)
            client_name: Human-readable client name (optional)

        Returns:
            Tuple of (User, JWT token)

        Raises:
            AuthenticationError: Invalid credentials or inactive account
        """
        # Get user by email or username
        identifier = (email_or_username or "").strip()
        by_email = "@" in identifier

        # Primary lookup (case-sensitive)
        user = await (
            self.users.get_user_by_email(identifier)
            if by_email else
            self.users.get_user_by_username(identifier)
        )

        # Fallback: case-insensitive lookup
        if not user:
            lowered = identifier.lower()
            if by_email:
                result = await self.db.execute(
                    select(User).where(func.lower(User.email) == lowered)
                )
            else:
                result = await self.db.execute(
                    select(User).where(func.lower(User.username) == lowered)
                )
            user = result.scalar_one_or_none()
        logger.debug(
            "Auth login lookup: ident=%s, by_email=%s, found=%s",
            email_or_username,
            by_email,
            bool(user),
        )
        if not user:
            raise AuthenticationError("Invalid credentials")

        # Verify password
        if not await verify_password(password, user.password_hash):
            raise AuthenticationError("Invalid credentials")

        # Check if user is active
        if not user.is_active:
            raise AuthenticationError("Account is inactive")

        # Create JWT token
        token = create_access_token(
            data={
                "sub": str(user.id),
                "email": user.email,
                "username": user.username,
                "role": user.role,
                "is_admin": user.is_admin(),
                "permissions": list(user.permissions or []),
                "is_active": user.is_active,
            }
        )

        # Decode token to get jti and expiration
        payload = decode_access_token(token)
        jti = payload["jti"]
        exp = self._exp_to_datetime(payload.get("exp"))
        if exp is None:
            raise AuthenticationError("Token missing valid exp claim")

        # Create session record
        session = UserSession(
            user_id=user.id,
            token_id=jti,
            created_at=datetime.now(timezone.utc),
            expires_at=exp,
            ip_address=ip_address,
            user_agent=user_agent,
            client_id=client_id,
            client_type=client_type,
            client_name=client_name,
        )
        self.db.add(session)

        # Update last login
        user.last_login_at = datetime.now(timezone.utc)

        await self.db.commit()
        await self.db.refresh(user)

        return user, token

    async def logout(self, token: str) -> None:
        """
        Revoke user session

        Args:
            token: JWT token

        Raises:
            ResourceNotFoundError: Session not found
        """
        # Get jti from token
        jti = get_token_jti(token)

        # Find and revoke session
        result = await self.db.execute(
            select(UserSession).where(UserSession.token_id == jti)
        )
        session = result.scalar_one_or_none()

        if not session:
            raise ResourceNotFoundError("Session", jti)

        # Revoke session
        session.is_revoked = True
        session.revoked_at = datetime.now(timezone.utc)
        session.revoke_reason = "user_logout"

        await self.db.commit()
        await self.evict_claims_cache_for_jti(jti)

    async def logout_all(self, user_id: int) -> int:
        """
        Revoke all sessions for user

        Args:
            user_id: User ID

        Returns:
            Number of sessions revoked
        """
        result = await self.db.execute(
            select(UserSession).where(
                UserSession.user_id == user_id,
                UserSession.is_revoked == False
            )
        )
        sessions = result.scalars().all()

        count = 0
        revoked_token_ids: list[str] = []
        for session in sessions:
            session.is_revoked = True
            session.revoked_at = datetime.now(timezone.utc)
            session.revoke_reason = "logout_all"
            revoked_token_ids.append(session.token_id)
            count += 1

        await self.db.commit()
        for token_id in revoked_token_ids:
            await self.evict_claims_cache_for_jti(token_id)
        return count

    # ===== TOKEN VERIFICATION =====

    async def verify_token_claims(
        self,
        token: str,
        *,
        require_session: bool | None = None,
        update_last_used: bool = False,
        use_cache: bool = False,
        cache_ttl_seconds: float | None = None,
    ) -> dict:
        """
        Verify token signature/expiry and optional session revocation state.

        Returns decoded claims without loading the User row. This is used by
        claims-based auth dependencies for game endpoints.
        """
        from pixsim7.backend.main.shared.config import settings

        if require_session is None:
            require_session = settings.jwt_require_session

        cache_key: str | None = None
        if use_cache and not update_last_used:
            token_digest = self._claims_cache_digest(token)
            cache_key = f"{int(require_session)}:{token_digest}"
            cached = await self._cache_get_claims(cache_key)
            if cached is not None:
                return cached

        try:
            payload = decode_access_token(token)
            jti = str(payload["jti"])
        except (ValueError, KeyError) as e:
            raise AuthenticationError(f"Invalid token: {e}")

        result = await self.db.execute(
            select(UserSession).where(UserSession.token_id == jti)
        )
        session = result.scalar_one_or_none()

        if require_session and not session:
            raise AuthenticationError("Session not found (token may have been logged out)")

        if session and not session.is_valid():
            raise AuthenticationError("Token has been revoked or expired")

        if update_last_used and session:
            session.last_used_at = datetime.now(timezone.utc)
            await self.db.commit()

        if use_cache and not update_last_used and cache_key is not None:
            effective_ttl = (
                cache_ttl_seconds
                if cache_ttl_seconds is not None
                else settings.jwt_introspection_cache_ttl_seconds
            )
            await self._cache_set_claims(
                cache_key=cache_key,
                payload=payload,
                jti=jti,
                ttl_seconds=effective_ttl,
            )

        return payload

    async def verify_token(self, token: str) -> User:
        """
        Verify JWT token and return user

        Args:
            token: JWT token

        Returns:
            User associated with token

        Raises:
            AuthenticationError: Invalid or revoked token
            ResourceNotFoundError: User not found
        """
        try:
            payload = await self.verify_token_claims(
                token,
                update_last_used=True,
            )
            user_id = int(payload["sub"])
        except (ValueError, KeyError) as e:
            raise AuthenticationError(f"Invalid token: {e}")

        # Get user
        user = await self.users.get_user(user_id)

        # Check if user is active
        if not user.is_active:
            raise AuthenticationError("Account is inactive")

        return user

    async def get_current_user(self, token: str) -> User:
        """
        Alias for verify_token (for FastAPI dependency)

        Args:
            token: JWT token

        Returns:
            Current user
        """
        return await self.verify_token(token)

    # ===== SESSION MANAGEMENT =====

    async def get_user_sessions(
        self,
        user_id: int,
        active_only: bool = True
    ) -> list[UserSession]:
        """
        Get all sessions for user

        Args:
            user_id: User ID
            active_only: Only return active (non-revoked) sessions

        Returns:
            List of sessions
        """
        query = select(UserSession).where(UserSession.user_id == user_id)

        if active_only:
            query = query.where(UserSession.is_revoked == False)

        query = query.order_by(UserSession.created_at.desc())

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def revoke_session(
        self,
        session_id: int,
        reason: str = "manual_revocation"
    ) -> UserSession:
        """
        Revoke specific session

        Args:
            session_id: Session ID
            reason: Revocation reason

        Returns:
            Revoked session

        Raises:
            ResourceNotFoundError: Session not found
        """
        session = await self.db.get(UserSession, session_id)
        if not session:
            raise ResourceNotFoundError("Session", session_id)

        session.is_revoked = True
        session.revoked_at = datetime.now(timezone.utc)
        session.revoke_reason = reason

        await self.db.commit()
        await self.db.refresh(session)
        await self.evict_claims_cache_for_jti(session.token_id)

        return session

    async def cleanup_expired_sessions(self) -> int:
        """
        Clean up expired sessions (cron job)

        Returns:
            Number of sessions cleaned up
        """
        now = datetime.now(timezone.utc)

        result = await self.db.execute(
            select(UserSession).where(
                UserSession.expires_at < now,
                UserSession.is_revoked == False
            )
        )
        sessions = result.scalars().all()

        count = 0
        expired_token_ids: list[str] = []
        for session in sessions:
            session.is_revoked = True
            session.revoked_at = now
            session.revoke_reason = "expired"
            expired_token_ids.append(session.token_id)
            count += 1

        await self.db.commit()
        for token_id in expired_token_ids:
            await self.evict_claims_cache_for_jti(token_id)
        return count
