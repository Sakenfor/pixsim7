"""
FastAPI dependencies - dependency injection for services

Provides clean dependency injection for API routes
"""
import asyncio
from functools import lru_cache
from typing import Annotated, Optional
from fastapi import Depends, HTTPException, Header, Query
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
from pixsim7.backend.main.services.generation import GenerationService, GenerationTrackingService
from pixsim7.backend.main.services.asset import AssetService
from pixsim7.backend.main.services.provider.provider_service import ProviderService
from pixsim7.backend.main.services.analysis import AnalysisService
from pixsim7.backend.main.services.game import (
    GameSessionService,
    GameLocationService,
    GameWorldService,
    GameTriggerService,
)
from pixsim7.backend.main.services.npc import NpcExpressionService
from pixsim7.backend.main.services.plugin import PluginCatalogService
from pixsim7.backend.main.services.refs import EntityRefResolver
from pixsim7.backend.main.shared.auth_claims import AuthPrincipal
from pixsim7.backend.main.shared.actor import RequestPrincipal
from pixsim7.backend.main.shared.auth import decode_access_token

# Narrative engine imports (lazy-loaded)
from pixsim7.backend.main.domain.narrative import NarrativeEngine
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


def get_generation_tracking_service(
    db: AsyncSession = Depends(get_database),
) -> GenerationTrackingService:
    """Get GenerationTrackingService instance (read-only facade)"""
    return GenerationTrackingService(db)




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


def get_game_trigger_service(db: AsyncSession = Depends(get_database)) -> GameTriggerService:
    """Get GameTriggerService instance"""
    return GameTriggerService(db)


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


def get_entity_ref_resolver(db: AsyncSession = Depends(get_database)) -> EntityRefResolver:
    """Get EntityRefResolver instance for resolving EntityRef to entities"""
    return EntityRefResolver(db)


# ===== NARRATIVE ENGINE SINGLETONS =====
# Thread-safe lazy initialization using @lru_cache (sync) and async lock (async)
# These are auto-initialized on first use - no explicit startup required


@lru_cache(maxsize=1)
def get_narrative_engine() -> NarrativeEngine:
    """Get or create the narrative engine singleton (thread-safe via lru_cache)."""
    return NarrativeEngine()


# Async singleton needs a lock for thread-safety
_llm_service: Optional[LLMService] = None
_llm_service_lock = asyncio.Lock()


async def get_llm_service() -> LLMService:
    """Get or create the LLM service singleton (thread-safe via async lock)."""
    global _llm_service
    if _llm_service is None:
        async with _llm_service_lock:
            # Double-check after acquiring lock
            if _llm_service is None:
                redis_client = await get_redis()
                _llm_service = LLMService(redis_client, provider="anthropic")
    return _llm_service


# ===== AUTHENTICATION DEPENDENCY =====

CODEGEN_PERMISSION = "devtools.codegen"
DIAGNOSTICS_PERMISSION = "devtools.diagnostics"


def _extract_bearer_token(authorization: str | None) -> str:
    """Extract token from an Authorization header."""
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Missing authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization header format (expected: Bearer <token>)",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return parts[1]

async def get_current_principal(
    authorization: Annotated[str | None, Header()] = None,
    auth_service: AuthService = Depends(get_auth_service),
    x_agent_id: Annotated[str | None, Header()] = None,
    x_run_id: Annotated[str | None, Header()] = None,
    x_plan_id: Annotated[str | None, Header()] = None,
    x_scope_key: Annotated[str | None, Header()] = None,
    x_chat_session_id: Annotated[str | None, Header()] = None,
) -> RequestPrincipal:
    """
    Single auth dependency — validates JWT, returns a ``RequestPrincipal``.

    Handles user tokens, agent tokens, bridge tokens, and user tokens with
    agent headers.  One decode, one object, no synthetic Users.

    ``X-Scope-Key`` / ``X-Chat-Session-Id`` recover the tab/session binding
    for bridge per-request tokens (which carry no such JWT claims), so
    self-targeting tools (set_tab_identity, plan claim) can resolve the
    caller's own tab. Endpoints stay owner-scoped, so a forwarded binding
    can only ever address the caller's own resources. Plan ``tab-identity-mode``.
    """
    token = _extract_bearer_token(authorization)

    try:
        payload = await auth_service.verify_token_claims(token, update_last_used=True)
    except Exception as e:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid or expired token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    principal = RequestPrincipal.from_jwt_payload(
        payload,
        x_agent_id=x_agent_id,
        x_run_id=x_run_id,
        x_plan_id=x_plan_id,
        x_scope_key=x_scope_key,
        x_chat_session_id=x_chat_session_id,
    )

    if not principal.is_active:
        raise HTTPException(status_code=403, detail="Inactive user")

    # Enrich user principals with DB data (display_name, preferences)
    if principal.is_user and principal.id != 0:
        try:
            user = await auth_service.users.get_user(principal.id)
            if not user.is_active:
                raise HTTPException(status_code=403, detail="Inactive user")
            principal.display_name = getattr(user, "display_name", None)
            principal.preferences = getattr(user, "preferences", None) or {}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=401,
                detail=f"User not found: {e}",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # Enrich agent principals with profile label + delegating user name
    if principal.is_agent:
        if principal.profile_id:
            profile = None
            try:
                from pixsim7.backend.main.domain.platform.agent_profile import AgentProfile
                profile = await auth_service.db.get(AgentProfile, principal.profile_id)
            except Exception:
                profile = None
            # Defense-in-depth for hard revocation: reject a token whose
            # profile is no longer active even if its session check was
            # bypassed (e.g. jwt_require_session off). Fail-open on a fetch
            # error, fail-closed on an explicit non-active status. Plan
            # ``scoped-agent-authorization`` (session-kill hard revocation).
            if profile is not None:
                if profile.status != "active":
                    raise HTTPException(
                        status_code=403,
                        detail=f"Agent profile is {profile.status}",
                    )
                principal.agent_label = profile.label
        if principal.on_behalf_of and not principal.on_behalf_of_name:
            try:
                user = await auth_service.users.get_user(principal.on_behalf_of)
                principal.on_behalf_of_name = (
                    getattr(user, "display_name", None)
                    or getattr(user, "username", None)
                )
            except Exception:
                pass

    # Bind actor + run_id to request-scoped audit context for model-level hooks
    from pixsim7.backend.main.services.audit.context import set_audit_actor, set_audit_run_id
    set_audit_actor(principal.source)
    if principal.run_id:
        set_audit_run_id(principal.run_id)

    return principal


async def get_current_admin_principal(
    principal: RequestPrincipal = Depends(get_current_principal),
) -> RequestPrincipal:
    """Require admin role."""
    if not principal.is_admin():
        raise HTTPException(status_code=403, detail="Admin access required")
    return principal


async def get_current_codegen_principal(
    principal: RequestPrincipal = Depends(get_current_principal),
) -> RequestPrincipal:
    """Require devtools.codegen permission."""
    if not principal.has_permission(CODEGEN_PERMISSION):
        raise HTTPException(
            status_code=403, detail=f"Missing required permission: {CODEGEN_PERMISSION}"
        )
    return principal


async def get_current_diagnostics_principal(
    principal: RequestPrincipal = Depends(get_current_principal),
) -> RequestPrincipal:
    """Require devtools.diagnostics permission (admins pass implicitly).

    Gates the diagnostic *run* surface (start/cancel of allowlisted
    tools/scripts) so non-admin agents can be granted the capability
    per-profile via a JWT permission claim, without becoming admins.
    ``has_permission`` already short-circuits ``True`` for admins, so
    the human admin UI path is unaffected.
    """
    if not principal.has_permission(DIAGNOSTICS_PERMISSION):
        raise HTTPException(
            status_code=403, detail=f"Missing required permission: {DIAGNOSTICS_PERMISSION}"
        )
    return principal


async def get_current_game_principal(
    authorization: Annotated[str | None, Header()] = None,
    auth_service: AuthService = Depends(get_auth_service),
) -> AuthPrincipal:
    """
    Resolve a claims-based principal for game-facing endpoints.

    Kept separate from ``get_current_principal`` because game endpoints use
    the ``AuthPrincipal`` type from ``auth_claims.py``.
    """
    token = _extract_bearer_token(authorization)

    try:
        payload = await auth_service.verify_token_claims(token, update_last_used=True)
        principal = AuthPrincipal.from_jwt_payload(payload)
        if not principal.is_active:
            raise HTTPException(status_code=403, detail="Inactive user")
        return principal
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid or expired token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_principal_ws(
    token: Optional[str] = None,
    auth_service: AuthService = Depends(get_auth_service),
) -> Optional[RequestPrincipal]:
    """WebSocket variant — returns None instead of raising on failure."""
    if not token:
        return None
    try:
        payload = await auth_service.verify_token_claims(token)
        return RequestPrincipal.from_jwt_payload(payload)
    except Exception:
        return None


async def get_current_principal_optional(
    authorization: Annotated[str | None, Header()] = None,
    auth_service: AuthService = Depends(get_auth_service),
) -> Optional[RequestPrincipal]:
    """Optional auth — returns None when no token or token is invalid."""
    import logging as _stdlib_logging
    _opt_auth_log = _stdlib_logging.getLogger(__name__)
    if not authorization:
        # DEBUG-floor diagnostic — flip on when investigating endpoints
        # that should have auth but appear to be hitting the no-auth
        # fall-through. Verify_failed below stays at ERROR (exception)
        # because that's a real failure, not just "no caller".
        _opt_auth_log.debug("get_current_principal_optional_no_auth_header")
        return None
    try:
        token = _extract_bearer_token(authorization)
    except HTTPException:
        _opt_auth_log.debug(
            "get_current_principal_optional_bearer_extract_failed header_prefix=%r",
            (authorization or "")[:16],
        )
        return None
    try:
        payload = await auth_service.verify_token_claims(token)
        return RequestPrincipal.from_jwt_payload(payload)
    except Exception:
        _opt_auth_log.exception(
            "get_current_principal_optional_verify_failed"
        )
        return None


async def get_media_principal(
    authorization: Annotated[str | None, Header()] = None,
    token: Annotated[str | None, Query()] = None,
    auth_service: AuthService = Depends(get_auth_service),
) -> RequestPrincipal:
    """Auth for media-serving routes — accepts the bearer header OR a ``?token=``
    query param.

    Native ``<video>``/``<img>`` element requests can't set an Authorization
    header, so the client carries a short-lived, read-only media token in the
    URL (mirrors the WebSocket ``?token=`` pattern). The header path is kept so
    existing authenticated blob fetches keep working unchanged.

    Whatever the token's purpose, downstream routes still enforce the
    ``u/{user.id}/`` ownership check, so this only ever serves the caller's own
    files.
    """
    raw = _extract_bearer_token(authorization) if authorization else token
    if not raw:
        raise HTTPException(
            status_code=401,
            detail="Missing authorization",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = await auth_service.verify_token_claims(raw, update_last_used=False)
    except Exception as e:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid or expired token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    principal = RequestPrincipal.from_jwt_payload(payload)
    if not principal.is_active:
        raise HTTPException(status_code=403, detail="Inactive user")
    return principal


# ===== TYPE ALIASES (for cleaner route signatures) =====

CurrentUser = Annotated[RequestPrincipal, Depends(get_current_principal)]
MediaUser = Annotated[RequestPrincipal, Depends(get_media_principal)]
CurrentActiveUser = Annotated[RequestPrincipal, Depends(get_current_principal)]
CurrentAdminUser = Annotated[RequestPrincipal, Depends(get_current_admin_principal)]
CurrentCodegenUser = Annotated[RequestPrincipal, Depends(get_current_codegen_principal)]
CurrentDiagnosticsUser = Annotated[RequestPrincipal, Depends(get_current_diagnostics_principal)]
CurrentGamePrincipal = Annotated[AuthPrincipal, Depends(get_current_game_principal)]

# Aliases for explicit use
require_admin = get_current_admin_principal
require_codegen = get_current_codegen_principal

# Backward-compat aliases — import these in new code
get_current_user = get_current_principal
get_current_user_ws = get_current_principal_ws
get_current_user_optional = get_current_principal_optional

DatabaseSession = Annotated[AsyncSession, Depends(get_database)]

# Service type aliases
UserSvc = Annotated[UserService, Depends(get_user_service)]
AuthSvc = Annotated[AuthService, Depends(get_auth_service)]
AccountSvc = Annotated[AccountService, Depends(get_account_service)]
GenerationSvc = Annotated[GenerationService, Depends(get_generation_service)]
GenerationTrackingSvc = Annotated[GenerationTrackingService, Depends(get_generation_tracking_service)]
ProviderSvc = Annotated[ProviderService, Depends(get_provider_service)]
AssetSvc = Annotated[AssetService, Depends(get_asset_service)]
AnalysisSvc = Annotated[AnalysisService, Depends(get_analysis_service)]
GameSessionSvc = Annotated[GameSessionService, Depends(get_game_session_service)]
GameLocationSvc = Annotated[GameLocationService, Depends(get_game_location_service)]
GameTriggerSvc = Annotated[GameTriggerService, Depends(get_game_trigger_service)]
NpcExpressionSvc = Annotated[NpcExpressionService, Depends(get_npc_expression_service)]
GameWorldSvc = Annotated[GameWorldService, Depends(get_game_world_service)]
PluginCatalogSvc = Annotated[PluginCatalogService, Depends(get_plugin_catalog_service)]
EntityRefResolverSvc = Annotated[EntityRefResolver, Depends(get_entity_ref_resolver)]

# Narrative engine type aliases
NarrativeEng = Annotated[NarrativeEngine, Depends(get_narrative_engine)]
LLMSvc = Annotated[LLMService, Depends(get_llm_service)]
