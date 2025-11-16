"""
FastAPI dependencies - dependency injection for services

Provides clean dependency injection for API routes
"""
from typing import Annotated
from fastapi import Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7_backend.domain import User
from pixsim7_backend.infrastructure.database.session import get_db
from pixsim7_backend.services.user import UserService, AuthService
from pixsim7_backend.services.account import AccountService
from pixsim7_backend.services.job import JobService
from pixsim7_backend.services.asset import AssetService
from pixsim7_backend.services.provider.provider_service import ProviderService
from pixsim7_backend.services.game import GameSessionService


# ===== DATABASE DEPENDENCY =====

async def get_database() -> AsyncSession:
    """Get database session"""
    async for session in get_db():
        yield session


# ===== SERVICE DEPENDENCIES =====

def get_user_service(db: AsyncSession = Depends(get_database)) -> UserService:
    """Get UserService instance"""
    return UserService(db)


def get_auth_service(
    db: AsyncSession = Depends(get_database),
    user_service: UserService = Depends(get_user_service)
) -> AuthService:
    """Get AuthService instance"""
    return AuthService(db, user_service)


def get_account_service(db: AsyncSession = Depends(get_database)) -> AccountService:
    """Get AccountService instance"""
    return AccountService(db)


def get_job_service(
    db: AsyncSession = Depends(get_database),
    user_service: UserService = Depends(get_user_service)
) -> JobService:
    """Get JobService instance"""
    return JobService(db, user_service)


def get_provider_service(db: AsyncSession = Depends(get_database)) -> ProviderService:
    """Get ProviderService instance"""
    return ProviderService(db)


def get_asset_service(
    db: AsyncSession = Depends(get_database),
    user_service: UserService = Depends(get_user_service)
) -> AssetService:
    """Get AssetService instance"""
    return AssetService(db, user_service)


def get_game_session_service(db: AsyncSession = Depends(get_database)) -> GameSessionService:
    """Get GameSessionService instance"""
    return GameSessionService(db)


# ===== AUTHENTICATION DEPENDENCY =====

async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    auth_service: AuthService = Depends(get_auth_service)
) -> User:
    """
    Get current authenticated user from JWT token

    Usage in routes:
        @router.get("/me")
        async def get_me(user: User = Depends(get_current_user)):
            return user

    Raises:
        HTTPException: 401 if token is invalid or missing
    """
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Missing authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Extract token from "Bearer <token>"
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization header format (expected: Bearer <token>)",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = parts[1]

    try:
        user = await auth_service.verify_token(token)
        return user
    except Exception as e:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid or expired token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_active_user(
    user: User = Depends(get_current_user)
) -> User:
    """
    Get current user and ensure they're active

    Raises:
        HTTPException: 403 if user is inactive
    """
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Inactive user")
    return user


async def get_current_admin_user(
    user: User = Depends(get_current_user)
) -> User:
    """
    Get current user and ensure they're admin

    Raises:
        HTTPException: 403 if user is not admin
    """
    if not user.is_admin():
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ===== TYPE ALIASES (for cleaner route signatures) =====

CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentActiveUser = Annotated[User, Depends(get_current_active_user)]
CurrentAdminUser = Annotated[User, Depends(get_current_admin_user)]

# Alias for admin access (used by admin endpoints)
require_admin = get_current_admin_user

DatabaseSession = Annotated[AsyncSession, Depends(get_database)]

# Service type aliases
UserSvc = Annotated[UserService, Depends(get_user_service)]
AuthSvc = Annotated[AuthService, Depends(get_auth_service)]
AccountSvc = Annotated[AccountService, Depends(get_account_service)]
JobSvc = Annotated[JobService, Depends(get_job_service)]
ProviderSvc = Annotated[ProviderService, Depends(get_provider_service)]
AssetSvc = Annotated[AssetService, Depends(get_asset_service)]
GameSessionSvc = Annotated[GameSessionService, Depends(get_game_session_service)]
