"""
AuthService - authentication and session management

Clean service for login, logout, and JWT token management
"""
from datetime import datetime, timedelta
from typing import Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7_backend.domain import User, UserSession
from pixsim7_backend.shared.auth import (
    verify_password,
    create_access_token,
    decode_access_token,
    get_token_jti,
    get_token_user_id,
)
from pixsim7_backend.shared.errors import (
    AuthenticationError,
    ResourceNotFoundError,
)
from pixsim7_backend.services.user.user_service import UserService


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

    # ===== LOGIN / LOGOUT =====

    async def login(
        self,
        email: str,
        password: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Tuple[User, str]:
        """
        Authenticate user and create session

        Args:
            email: User email
            password: Plain text password
            ip_address: Client IP address (for logging)
            user_agent: Client user agent (for logging)

        Returns:
            Tuple of (User, JWT token)

        Raises:
            AuthenticationError: Invalid credentials or inactive account
        """
        # Get user by email
        user = await self.users.get_user_by_email(email)
        if not user:
            raise AuthenticationError("Invalid email or password")

        # Verify password
        if not verify_password(password, user.password_hash):
            raise AuthenticationError("Invalid email or password")

        # Check if user is active
        if not user.is_active:
            raise AuthenticationError("Account is inactive")

        # Create JWT token
        token = create_access_token(
            data={
                "sub": str(user.id),
                "email": user.email,
                "role": user.role,
            }
        )

        # Decode token to get jti and expiration
        payload = decode_access_token(token)
        jti = payload["jti"]
        exp = datetime.fromtimestamp(payload["exp"])

        # Create session record
        session = UserSession(
            user_id=user.id,
            token_id=jti,
            created_at=datetime.utcnow(),
            expires_at=exp,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        self.db.add(session)

        # Update last login
        user.last_login_at = datetime.utcnow()

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
        session.revoked_at = datetime.utcnow()
        session.revoke_reason = "user_logout"

        await self.db.commit()

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
        for session in sessions:
            session.is_revoked = True
            session.revoked_at = datetime.utcnow()
            session.revoke_reason = "logout_all"
            count += 1

        await self.db.commit()
        return count

    # ===== TOKEN VERIFICATION =====

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
        from pixsim7_backend.shared.config import settings
        
        try:
            # Decode token
            payload = decode_access_token(token)
            user_id = int(payload["sub"])
            jti = payload["jti"]
        except (ValueError, KeyError) as e:
            raise AuthenticationError(f"Invalid token: {e}")

        # Check session in DB if strict mode is enabled
        if settings.jwt_require_session:
            # Strict mode: require session record
            result = await self.db.execute(
                select(UserSession).where(UserSession.token_id == jti)
            )
            session = result.scalar_one_or_none()

            if not session:
                raise AuthenticationError("Session not found (token may have been logged out)")

            # Session exists - check if valid
            if not session.is_valid():
                raise AuthenticationError("Token has been revoked or expired")

            # Update last used
            session.last_used_at = datetime.utcnow()
            await self.db.commit()
        else:
            # Stateless mode: check if session exists, but don't require it
            result = await self.db.execute(
                select(UserSession).where(UserSession.token_id == jti)
            )
            session = result.scalar_one_or_none()

            if session:
                # Session exists - check if valid
                if not session.is_valid():
                    raise AuthenticationError("Token has been revoked or expired")

                # Update last used
                session.last_used_at = datetime.utcnow()
                await self.db.commit()
            # If no session found, continue (stateless accepts valid JWTs without session record)

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
        session.revoked_at = datetime.utcnow()
        session.revoke_reason = reason

        await self.db.commit()
        await self.db.refresh(session)

        return session

    async def cleanup_expired_sessions(self) -> int:
        """
        Clean up expired sessions (cron job)

        Returns:
            Number of sessions cleaned up
        """
        now = datetime.utcnow()

        result = await self.db.execute(
            select(UserSession).where(
                UserSession.expires_at < now,
                UserSession.is_revoked == False
            )
        )
        sessions = result.scalars().all()

        count = 0
        for session in sessions:
            session.is_revoked = True
            session.revoked_at = now
            session.revoke_reason = "expired"
            count += 1

        await self.db.commit()
        return count
