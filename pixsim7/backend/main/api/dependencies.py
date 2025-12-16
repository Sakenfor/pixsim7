"""
FastAPI dependencies - dependency injection for services

Provides clean dependency injection for API routes
"""
from typing import Annotated, Optional
from fastapi import Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from redis.asyncio import Redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    Redis = None  # type: ignore

from pixsim7.backend.main.domain import User
from pixsim7.backend.main.infrastructure.database.session import get_db
from pixsim7.backend.main.infrastructure.redis.client import get_redis
from pixsim7.backend.main.services.user import UserService, AuthService
from pixsim7.backend.main.services.account import AccountService
from pixsim7.backend.main.services.generation import GenerationService
from pixsim7.backend.main.services.asset import AssetService
from pixsim7.backend.main.services.provider.provider_service import ProviderService
from pixsim7.backend.main.services.analysis import AnalysisService
from pixsim7.backend.main.services.game import GameSessionService, GameLocationService, GameWorldService
from pixsim7.backend.main.services.npc import NpcExpressionService
from pixsim7.backend.main.services.plugin import PluginCatalogService

# Narrative engine imports (lazy-loaded)
from pixsim7.backend.main.domain.narrative import NarrativeEngine
from pixsim7.backend.main.domain.narrative.action_blocks import ActionEngine
from pixsim7.backend.main.domain.narrative.action_blocks.generator import DynamicBlockGenerator
from pixsim7.backend.main.services.llm import LLMService


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


def get_generation_service(
    db: AsyncSession = Depends(get_database),
    user_service: UserService = Depends(get_user_service)
) -> GenerationService:
    """Get GenerationService instance"""
    return GenerationService(db, user_service)


def get_provider_service(db: AsyncSession = Depends(get_database)) -> ProviderService:
    """Get ProviderService instance"""
    return ProviderService(db)


def get_asset_service(
    db: AsyncSession = Depends(get_database),
    user_service: UserService = Depends(get_user_service)
) -> AssetService:
    """Get AssetService instance"""
    return AssetService(db, user_service)


def get_analysis_service(db: AsyncSession = Depends(get_database)) -> AnalysisService:
    """Get AnalysisService instance"""
    return AnalysisService(db)


async def get_redis_client() -> Optional[Redis]:
    """Get Redis client instance (optional, returns None if unavailable)"""
    if not REDIS_AVAILABLE:
        return None
    try:
        return await get_redis()
    except Exception:
        # Fail gracefully if Redis is unavailable
        return None


async def get_game_session_service(
    db: AsyncSession = Depends(get_database),
    redis: Optional[Redis] = Depends(get_redis_client)
) -> GameSessionService:
    """Get GameSessionService instance with Redis support"""
    return GameSessionService(db, redis)


def get_game_location_service(db: AsyncSession = Depends(get_database)) -> GameLocationService:
    """Get GameLocationService instance"""
    return GameLocationService(db)


def get_npc_expression_service(db: AsyncSession = Depends(get_database)) -> NpcExpressionService:
    """Get NpcExpressionService instance"""
    return NpcExpressionService(db)


async def get_game_world_service(
    db: AsyncSession = Depends(get_database),
    redis: Optional[Redis] = Depends(get_redis_client)
) -> GameWorldService:
    """Get GameWorldService instance with Redis support"""
    return GameWorldService(db, redis)


def get_plugin_catalog_service(db: AsyncSession = Depends(get_database)) -> PluginCatalogService:
    """Get PluginCatalogService instance"""
    return PluginCatalogService(db)


# ===== NARRATIVE ENGINE SINGLETONS =====
# Centralized singleton management for narrative engines and action systems

_narrative_engine: Optional[NarrativeEngine] = None
_action_engine: Optional[ActionEngine] = None
_block_generator: Optional[DynamicBlockGenerator] = None
_llm_service: Optional[LLMService] = None


def get_narrative_engine() -> NarrativeEngine:
    """Get or create the narrative engine singleton."""
    global _narrative_engine
    if _narrative_engine is None:
        _narrative_engine = NarrativeEngine()
    return _narrative_engine


def get_action_engine() -> ActionEngine:
    """Get or create the action engine singleton."""
    global _action_engine
    if _action_engine is None:
        _action_engine = ActionEngine(narrative_engine=get_narrative_engine())
    return _action_engine


def get_block_generator() -> DynamicBlockGenerator:
    """Get or create the block generator singleton."""
    global _block_generator
    if _block_generator is None:
        _block_generator = DynamicBlockGenerator(use_claude_api=False)
    return _block_generator


async def get_llm_service() -> LLMService:
    """Get or create the LLM service singleton."""
    global _llm_service
    if _llm_service is None:
        redis_client = await get_redis()
        _llm_service = LLMService(redis_client, provider="anthropic")
    return _llm_service


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


async def get_current_user_ws(
    token: Optional[str] = None,
    auth_service: AuthService = Depends(get_auth_service)
) -> Optional[User]:
    """
    Get current authenticated user from WebSocket token (query parameter).

    For WebSocket connections, token is typically passed as query parameter:
        ws://host/ws/endpoint?token=JWT_TOKEN

    Returns:
        User if token is valid, None if token is missing/invalid.

    Note: Returns None instead of raising exception to allow graceful
          WebSocket connection handling by the endpoint.
    """
    if not token:
        return None

    try:
        user = await auth_service.verify_token(token)
        return user
    except Exception:
        # Return None for invalid tokens instead of raising
        # WebSocket endpoints should handle None gracefully
        return None


async def get_current_user_optional(
    authorization: Annotated[str | None, Header()] = None,
    auth_service: AuthService = Depends(get_auth_service)
) -> Optional[User]:
    """
    Get current authenticated user from JWT token (optional).

    Similar to get_current_user but returns None instead of raising
    exceptions. Useful for endpoints that provide different behavior
    for authenticated vs unauthenticated users.

    Returns:
        User if token is valid, None if token is missing/invalid.
    """
    if not authorization:
        return None

    # Extract token from "Bearer <token>"
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None

    token = parts[1]

    try:
        user = await auth_service.verify_token(token)
        return user
    except Exception:
        return None


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

# ─────────────────────────────────────────────────────────────────────────
# USAGE CONVENTIONS FOR CURRENT*USER TYPE ALIASES
# ─────────────────────────────────────────────────────────────────────────
#
# These type aliases already include Depends(), so do NOT add another
# Depends() call when using them in route signatures.
#
# ✅ CORRECT:
#     @router.get("/me")
#     async def get_me(user: CurrentUser):
#         return user
#
#     @router.post("/admin/action")
#     async def admin_action(admin: CurrentAdminUser):
#         return {"status": "ok"}
#
# ❌ INCORRECT (will raise FastAPI error):
#     async def get_me(user: CurrentUser = Depends()):  # Double Depends!
#     async def admin_action(admin: CurrentAdminUser = Depends(get_current_admin_user)):  # Redundant!
#
# For optional authentication, use get_current_user_optional explicitly:
#     async def optional_route(user: Optional[User] = Depends(get_current_user_optional)):
#         if user:
#             # authenticated behavior
#         else:
#             # unauthenticated behavior
#
# ─────────────────────────────────────────────────────────────────────────

DatabaseSession = Annotated[AsyncSession, Depends(get_database)]

# Service type aliases
UserSvc = Annotated[UserService, Depends(get_user_service)]
AuthSvc = Annotated[AuthService, Depends(get_auth_service)]
AccountSvc = Annotated[AccountService, Depends(get_account_service)]
GenerationSvc = Annotated[GenerationService, Depends(get_generation_service)]
ProviderSvc = Annotated[ProviderService, Depends(get_provider_service)]
AssetSvc = Annotated[AssetService, Depends(get_asset_service)]
AnalysisSvc = Annotated[AnalysisService, Depends(get_analysis_service)]
GameSessionSvc = Annotated[GameSessionService, Depends(get_game_session_service)]
GameLocationSvc = Annotated[GameLocationService, Depends(get_game_location_service)]
NpcExpressionSvc = Annotated[NpcExpressionService, Depends(get_npc_expression_service)]
GameWorldSvc = Annotated[GameWorldService, Depends(get_game_world_service)]
PluginCatalogSvc = Annotated[PluginCatalogService, Depends(get_plugin_catalog_service)]

# Narrative engine type aliases
NarrativeEng = Annotated[NarrativeEngine, Depends(get_narrative_engine)]
ActionEng = Annotated[ActionEngine, Depends(get_action_engine)]
BlockGenerator = Annotated[DynamicBlockGenerator, Depends(get_block_generator)]
LLMSvc = Annotated[LLMService, Depends(get_llm_service)]
