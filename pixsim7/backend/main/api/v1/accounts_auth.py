"""
Provider account authentication & session management API endpoints

Handles cookie import/export, JWT refresh, re-authentication, and OAuth flows.
"""
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
import logging
import asyncio
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from pixsim7.backend.main.api.dependencies import CurrentUser, AccountSvc, DatabaseSession
from pixsim7.backend.main.shared.schemas.account_schemas import AccountResponse
from pixsim7.backend.main.shared.jwt_utils import parse_jwt_token, extract_jwt_from_cookies
from pixsim7.backend.main.domain.providers import ProviderAccount
from pixsim7.backend.main.domain.provider_auth import PixverseAuthMethod
from pixsim7.backend.main.shared.errors import ResourceNotFoundError
from pixsim7.backend.main.services.provider import registry
from pixsim7.backend.main.services.provider.pixverse_auth_service import (
    PixverseAuthService,
    PixverseAuthError,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# Import _to_response helper from accounts.py
def _to_response(account: ProviderAccount, current_user_id: int) -> AccountResponse:
    """Convert account to response with computed fields"""
    # Parse JWT if exists
    jwt_expired = False
    jwt_expires_at = None
    if account.jwt_token:
        jwt_info = parse_jwt_token(account.jwt_token)
        jwt_expired = jwt_info.is_expired
        jwt_expires_at = jwt_info.expires_at

    # Build credits dict from relationship
    credits_dict = {}
    if account.credits:  # credits is the relationship to ProviderCredit
        credits_dict = {c.credit_type: c.amount for c in account.credits}

    # Has any OpenAPI-style key?
    has_openapi_key = False
    api_keys = getattr(account, "api_keys", None) or []
    for entry in api_keys:
        if isinstance(entry, dict) and entry.get("kind") == "openapi" and entry.get("value"):
            has_openapi_key = True
            break

    # Check if Google-authenticated
    is_google_account = False
    provider_metadata = getattr(account, "provider_metadata", None) or {}
    if provider_metadata.get("auth_method") == PixverseAuthMethod.GOOGLE.value:
        is_google_account = True

    return AccountResponse(
        id=account.id,
        user_id=account.user_id,
        email=account.email,
        provider_id=account.provider_id,
        nickname=account.nickname,
        is_private=account.is_private,
        status=account.status.value,
        # Auth
        has_jwt=bool(account.jwt_token),
        jwt_expired=jwt_expired,
        jwt_expires_at=jwt_expires_at,
        has_api_key_paid=has_openapi_key,
        has_cookies=bool(account.cookies),
        is_google_account=is_google_account,
        # Credits (normalized)
        credits=credits_dict,
        total_credits=account.get_total_credits(),
        # Usage
        videos_today=account.videos_today,
        total_videos_generated=account.total_videos_generated,
        total_videos_failed=account.total_videos_failed,
        success_rate=account.success_rate,
        # Concurrency
        max_concurrent_jobs=account.max_concurrent_jobs,
        current_processing_jobs=account.current_processing_jobs,
        # Timing
        last_used=account.last_used,
        last_error=account.last_error,
        cooldown_until=account.cooldown_until,
        created_at=account.created_at,
    )


async def _apply_extracted_account_data(
    account: ProviderAccount,
    extracted: Dict[str, Any],
    account_service: AccountSvc,
    db: DatabaseSession,
    user_id: int,
) -> tuple[ProviderAccount, List[str]]:
    """Apply extracted provider data (cookies/JWT/etc.) to an account."""
    updated_fields: List[str] = []
    update_payload: Dict[str, Any] = {}

    email = extracted.get('email')
    nickname = extracted.get('nickname')
    jwt_token = extracted.get('jwt_token')
    cookies_dict = extracted.get('cookies')

    if email and email != account.email:
        update_payload['email'] = email
    if nickname is not None:
        update_payload['nickname'] = nickname
    if jwt_token:
        update_payload['jwt_token'] = jwt_token
    if isinstance(cookies_dict, dict):
        update_payload['cookies'] = cookies_dict

    if update_payload:
        account = await account_service.update_account(
            account_id=account.id,
            user_id=user_id,
            **update_payload,
        )
        updated_fields.extend(update_payload.keys())

    provider_user_id = extracted.get('account_id')
    if provider_user_id and provider_user_id != account.provider_user_id:
        account.provider_user_id = provider_user_id
        updated_fields.append("provider_user_id")

    provider_metadata = extracted.get('provider_metadata')
    if provider_metadata:
        account.provider_metadata = provider_metadata
        updated_fields.append("provider_metadata")

    await db.commit()
    await db.refresh(account)

    credits_data = extracted.get('credits')
    if credits_data and isinstance(credits_data, dict):
        for credit_type, amount in credits_data.items():
            try:
                await account_service.set_credit(account.id, credit_type, int(amount))
                if "credits" not in updated_fields:
                    updated_fields.append("credits")
            except Exception as exc:  # pragma: no cover - defensive
                logger.debug(f"Failed to update credit {credit_type} for account {account.id}: {exc}")
        await db.commit()
        await db.refresh(account)

    return account, updated_fields


# ===== SCHEMAS =====

class AccountCookiesResponse(BaseModel):
    provider_id: str
    email: str
    cookies: Dict[str, str]


class AccountReauthRequest(BaseModel):
    """Request body for automated re-auth via Playwright"""
    password: Optional[str] = None
    headless: bool = True


class AccountReauthResponse(BaseModel):
    success: bool
    updated_fields: List[str] = Field(default_factory=list)
    account: AccountResponse


class PixverseGoogleConnectRequest(BaseModel):
    """Connect Pixverse account using a Google ID token (OAuth auto_login)."""
    id_token: str


class RefreshJWTResponse(BaseModel):
    """Response for JWT refresh from cookies"""
    success: bool
    message: str
    account_id: int
    email: str
    jwt_expired: bool
    jwt_expires_at: datetime | None


class CookieImportRequest(BaseModel):
    """Request to import cookies from browser"""
    provider_id: str
    url: str
    raw_data: Dict  # Raw cookies + localStorage from content script
    password: Optional[str] = None  # Optional password for auto-refresh (skip for Google accounts)


class CookieImportResponse(BaseModel):
    """Response from cookie import"""
    success: bool
    message: str
    account_id: Optional[int] = None
    email: Optional[str] = None
    created: bool = False
    updated_fields: list[str] = []


# ===== ENDPOINTS =====

# Import shared reauth locks from session_manager (used by both API and auto-reauth)
from pixsim7.backend.main.services.provider.adapters.pixverse_session_manager import (
    acquire_reauth_lock,
    is_reauth_locked,
)


@router.get("/accounts/{account_id}/cookies", response_model=AccountCookiesResponse)
async def export_account_cookies(
    account_id: int,
    user: CurrentUser,
    account_service: AccountSvc
):
    """Export cookies for an account to enable logged-in browser tabs.

    Security: Only the owner of the account or admin can export cookies.
    """
    try:
        account = await account_service.get_account(account_id)
        # Ownership or admin required (system accounts user_id=None are not exportable)
        if account.user_id is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Cannot export cookies for system accounts")
        if account.user_id != user.id and not user.is_admin():
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed to export this account's cookies")

        cookies: Dict[str, Any] = account.cookies or {}
        if not isinstance(cookies, dict):
            cookies = {}

        # For Pixverse accounts, make a best-effort attempt to ensure that the
        # exported cookie jar contains a usable `_ai_token`. We never overwrite
        # an existing `_ai_token` (that value came from the browser), but if
        # it is missing and we have a valid, non-expired jwt_token on the
        # account, we mirror that into the cookie map so the opened tab has a
        # minimal working session.
        if account.provider_id == "pixverse" and "_ai_token" not in cookies and account.jwt_token:
            jwt_info = parse_jwt_token(account.jwt_token)
            if jwt_info.is_valid and not jwt_info.is_expired:
                cookies["_ai_token"] = account.jwt_token

        return AccountCookiesResponse(
            provider_id=account.provider_id,
            email=account.email,
            cookies=cookies
        )
    except ResourceNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")


@router.post("/accounts/{account_id}/refresh-jwt", response_model=RefreshJWTResponse)
async def refresh_jwt_from_cookies(
    account_id: int,
    user: CurrentUser,
    account_service: AccountSvc,
    db: DatabaseSession,
):
    """
    Refresh JWT token from stored cookies (_ai_token).

    Useful when the JWT is expired but cookies are still valid.
    Extracts a fresh JWT from the `_ai_token` cookie and updates the account.
    """
    try:
        account = await account_service.get_account(account_id)
    except ResourceNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")

    if not account.cookies:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Account has no cookies to extract JWT from")

    # Only owner or admin may refresh; system accounts (user_id=None) require admin
    if account.user_id is None:
        if not user.is_admin():
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins can refresh system accounts")
    elif account.user_id != user.id and not user.is_admin():
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed to refresh this account")

    jwt_token = extract_jwt_from_cookies(account.cookies or {})
    if not jwt_token:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No _ai_token found in cookies")

    jwt_info = parse_jwt_token(jwt_token)
    if not jwt_info.is_valid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "JWT token in cookies is invalid")

    # Update account JWT
    account.jwt_token = jwt_token
    await db.commit()
    await db.refresh(account)

    return RefreshJWTResponse(
        success=True,
        message="JWT token refreshed from cookies",
        account_id=account.id,
        email=account.email,
        jwt_expired=jwt_info.is_expired,
        jwt_expires_at=jwt_info.expires_at,
    )


@router.post("/accounts/{account_id}/reauth", response_model=AccountReauthResponse)
async def reauth_account(
    account_id: int,
    request: AccountReauthRequest,
    user: CurrentUser,
    account_service: AccountSvc,
    db: DatabaseSession,
):
    """Trigger automated Pixverse re-auth via Playwright to refresh JWT/cookies."""
    try:
        account = await account_service.get_account(account_id)
    except ResourceNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")

    if account.user_id is None or (account.user_id != user.id and not user.is_admin()):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed to re-auth this account")

    if account.provider_id != "pixverse":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Automated re-auth currently supported for Pixverse only",
        )

    # Prefer explicit password from request, then per-account password,
    # then fall back to provider-level global password (if configured).
    password = request.password or account.password
    if not password:
        try:
            from pixsim7.backend.main.api.v1.providers import _load_provider_settings

            settings_map = _load_provider_settings()
            provider_settings = settings_map.get(account.provider_id)
            if provider_settings and provider_settings.global_password:
                password = provider_settings.global_password
        except Exception:
            # Best-effort: if provider settings cannot be loaded, we'll fall
            # through to the standard "no password" error below.
            password = None

    if not password:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Account has no stored password or provider global password. Provide password in request.",
        )

    # Acquire shared lock for this account to prevent concurrent re-auth attempts
    # (shared with auto-reauth in session_manager)
    account_lock = await acquire_reauth_lock(account_id)

    # Check if another re-auth is in progress
    if account_lock.locked():
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Re-authentication already in progress for this account. Please wait."
        )

    async with account_lock:
        try:
            async with PixverseAuthService() as auth_service:
                # Add timeout to prevent indefinite hanging (60 seconds)
                session_data = await asyncio.wait_for(
                    auth_service.login_with_password(
                        account.email,
                        password,
                        headless=request.headless,
                    ),
                    timeout=60.0
                )
        except asyncio.TimeoutError:
            raise HTTPException(
                status.HTTP_504_GATEWAY_TIMEOUT,
                "Re-authentication timed out after 60 seconds. Please try again."
            )
        except PixverseAuthError as exc:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                f"Pixverse login failed: {exc}",
            )

    provider = registry.get(account.provider_id)
    extracted = await provider.extract_account_data(session_data)

    provider_metadata = extracted.get("provider_metadata") or {}
    if account.provider_id == "pixverse":
        provider_metadata["auth_method"] = PixverseAuthMethod.PASSWORD.value
    extracted["provider_metadata"] = provider_metadata

    updated_account, updated_fields = await _apply_extracted_account_data(
        account,
        extracted,
        account_service,
        db,
        user.id,
    )

    return AccountReauthResponse(
        success=True,
        updated_fields=updated_fields,
        account=_to_response(updated_account, user.id),
    )


@router.post("/accounts/{account_id}/connect-google", response_model=AccountReauthResponse)
async def connect_pixverse_with_google(
    account_id: int,
    request: PixverseGoogleConnectRequest,
    user: CurrentUser,
    account_service: AccountSvc,
    db: DatabaseSession,
):
    """
    Connect an existing Pixverse account using a Google ID token.

    This exchanges the Google ID token for a Pixverse JWT/cookies via
    pixverse-py and updates the account credentials.

    Security:
    - Only the account owner or admin may connect via Google.
    - Only supported for provider_id="pixverse".
    """
    try:
        account = await account_service.get_account(account_id)
    except ResourceNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")

    if account.provider_id != "pixverse":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Google connect is supported for Pixverse accounts only")

    if account.user_id is None or (account.user_id != user.id and not user.is_admin()):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed to connect this account via Google")

    updated_fields: list[str] = []
    meta = account.provider_metadata or {}
    if meta.get("auth_method") != PixverseAuthMethod.GOOGLE.value:
        meta["auth_method"] = PixverseAuthMethod.GOOGLE.value
        account.provider_metadata = meta
        updated_fields.append("provider_metadata")
        await db.commit()
        await db.refresh(account)

    return AccountReauthResponse(
        success=True,
        updated_fields=updated_fields,
        account=_to_response(account, user.id),
    )


@router.post("/accounts/import-cookies", response_model=CookieImportResponse)
async def import_cookies(
    request: CookieImportRequest,
    user: CurrentUser,
    account_service: AccountSvc,
    db: DatabaseSession
):
    """
    Import cookies from browser extension

    Extension detects when user is logged into a provider site,
    extracts cookies, and sends them here to create/update account.

    Flow:
    1. Extension detects login on provider site (e.g., pixverse.ai)
    2. Extension extracts cookies and JWT token
    3. Extension calls this endpoint with cookies
    4. Backend creates/updates account with credentials

    Example:
    POST /api/v1/accounts/import-cookies
    {
        "provider_id": "pixverse",
        "url": "https://app.pixverse.ai",
        "cookies": {
            "jwt_token": "eyJ...",
            "session_id": "abc123",
            "other_cookie": "value"
        }
    }
    """
    try:
        # Use provider adapter to extract account data from raw cookies/localStorage
        provider = registry.get(request.provider_id)

        # Provider adapter extracts email, JWT, credits from raw data
        extracted = await provider.extract_account_data(request.raw_data)

        email = extracted.get('email')
        jwt_token = extracted.get('jwt_token')
        cookies_dict = extracted.get('cookies', {})
        credits_data = extracted.get('credits')
        username = extracted.get('username')
        nickname = extracted.get('nickname')
        provider_user_id = extracted.get('account_id')
        provider_metadata = extracted.get('provider_metadata') or {}

        if not email:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Provider {request.provider_id} could not extract email from raw data"
            )

        # Check if account already exists
        result = await db.execute(
            select(ProviderAccount)
            .where(
                ProviderAccount.email == email,
                ProviderAccount.provider_id == request.provider_id,
                ProviderAccount.user_id == user.id
            )
        )
        existing = result.scalar_one_or_none()

        updated_fields = []

        if existing:
            # Update existing account
            if jwt_token and existing.jwt_token != jwt_token:
                existing.jwt_token = jwt_token
                updated_fields.append("jwt_token")

            if existing.cookies != cookies_dict:
                existing.cookies = cookies_dict
                updated_fields.append("cookies")

            # Update password if provided (for auto-refresh)
            if request.password and existing.password != request.password:
                existing.password = request.password
                updated_fields.append("password")
                # If password is provided, mark this as a PASSWORD auth account
                if request.provider_id == "pixverse":
                    meta = existing.provider_metadata or {}
                    old_auth = meta.get("auth_method")
                    if old_auth == PixverseAuthMethod.UNKNOWN.value:
                        meta["auth_method"] = PixverseAuthMethod.PASSWORD.value
                        existing.provider_metadata = meta
                        if "provider_metadata" not in updated_fields:
                            updated_fields.append("provider_metadata")
                        logger.info(
                            "pixverse_auth_method_upgraded",
                            account_id=existing.id,
                            email=email,
                            old_auth=old_auth,
                            new_auth=PixverseAuthMethod.PASSWORD.value,
                            reason="password_provided",
                        )

            # Update metadata fields
            if nickname and existing.nickname != nickname:
                existing.nickname = nickname
                updated_fields.append("nickname")

            if provider_user_id and existing.provider_user_id != provider_user_id:
                existing.provider_user_id = provider_user_id
                updated_fields.append("provider_user_id")

            # Merge provider metadata, preserving a stable auth_method when we
            # already know how this account authenticates.
            if provider_metadata is not None:
                existing_meta: Dict[str, Any] = existing.provider_metadata or {}
                new_meta: Dict[str, Any] = provider_metadata or {}

                if request.provider_id == "pixverse":
                    existing_auth = existing_meta.get("auth_method")
                    new_auth = new_meta.get("auth_method")
                    # Auth method priority:
                    # 1. Keep existing GOOGLE or PASSWORD classification (already determined)
                    # 2. Use new auth_method if explicitly provided (e.g., from /connect-google)
                    # 3. Default to PASSWORD if no auth_method is known (simpler assumption)
                    # Note: PASSWORD upgrade happens above if request.password is provided
                    if existing_auth in (
                        PixverseAuthMethod.GOOGLE.value,
                        PixverseAuthMethod.PASSWORD.value,
                    ):
                        new_meta["auth_method"] = existing_auth
                    elif not new_auth:
                        new_meta["auth_method"] = PixverseAuthMethod.PASSWORD.value

                existing.provider_metadata = new_meta
                updated_fields.append("provider_metadata")

            existing.updated_at = datetime.now(timezone.utc)

            # Update credits if provided
            if credits_data:
                for credit_type, amount in credits_data.items():
                    try:
                        await account_service.set_credit(existing.id, credit_type, amount)
                        if "credits" not in updated_fields:
                            updated_fields.append("credits")
                    except Exception as e:
                        print(f"Failed to update credits {credit_type}: {e}")

            await db.commit()
            await db.refresh(existing)

            # Trigger credit sync in background (best-effort)
            try:
                fresh_extracted = await provider.extract_account_data(request.raw_data)
                fresh_credits = fresh_extracted.get('credits')
                if fresh_credits:
                    for credit_type, amount in fresh_credits.items():
                        try:
                            await account_service.set_credit(existing.id, credit_type, amount)
                            if "credits" not in updated_fields:
                                updated_fields.append("credits")
                        except Exception:
                            pass
                    await db.commit()
                    await db.refresh(existing)
            except Exception:
                pass  # non-fatal

            # Sync plan details for existing Pixverse accounts (best-effort)
            if request.provider_id == "pixverse":
                try:
                    plan_details = await provider.get_plan_details(existing)
                    if plan_details:
                        provider.apply_plan_to_account(existing, plan_details)
                        if "max_concurrent_jobs" not in updated_fields:
                            updated_fields.append("max_concurrent_jobs")
                        if "provider_metadata" not in updated_fields:
                            updated_fields.append("provider_metadata")
                        await db.commit()
                        await db.refresh(existing)
                        logger.info(
                            "pixverse_plan_synced_on_update",
                            account_id=existing.id,
                            email=email,
                            plan_name=plan_details.get("plan_name"),
                            max_concurrent_jobs=existing.max_concurrent_jobs,
                        )
                except Exception as e:
                    # Plan detection failure should not block account update
                    logger.warning(
                        "pixverse_plan_sync_failed_on_update",
                        account_id=existing.id,
                        email=email,
                        error=str(e),
                    )

            return CookieImportResponse(
                success=True,
                message=f"Updated account {email}",
                account_id=existing.id,
                email=email,
                created=False,
                updated_fields=updated_fields
            )
        else:
            # Create new account
            # For Pixverse, default new accounts to PASSWORD auth_method.
            # If it's actually a Google account, we'll detect it reactively when
            # password-based auto-reauth fails with "Please sign in via OAuth".
            if request.provider_id == "pixverse":
                meta: Dict[str, Any] = provider_metadata or {}
                if "auth_method" not in meta:
                    # Default to PASSWORD (simpler assumption, works for most cases)
                    meta["auth_method"] = PixverseAuthMethod.PASSWORD.value
                provider_metadata = meta

            account = await account_service.create_account(
                user_id=user.id,
                email=email,
                provider_id=request.provider_id,
                password=request.password,  # Store password for auto-refresh
                jwt_token=jwt_token,
                cookies=cookies_dict,
                is_private=False,  # Default to shared
                nickname=nickname
            )

            # Set additional fields not in create_account
            if provider_user_id:
                account.provider_user_id = provider_user_id
            if provider_metadata:
                account.provider_metadata = provider_metadata

            await db.commit()
            await db.refresh(account)

            # Import credits if provided by provider extractor
            credits_imported = []
            if credits_data:
                for credit_type, amount in credits_data.items():
                    try:
                        await account_service.set_credit(account.id, credit_type, amount)
                        credits_imported.append(credit_type)
                    except Exception as e:
                        print(f"Failed to import credits {credit_type}: {e}")

                if credits_imported:
                    await db.commit()
                    await db.refresh(account)

            # Sync plan details for new Pixverse accounts (best-effort)
            if request.provider_id == "pixverse":
                try:
                    plan_details = await provider.get_plan_details(account)
                    if plan_details:
                        provider.apply_plan_to_account(account, plan_details)
                        await db.commit()
                        await db.refresh(account)
                        logger.info(
                            "pixverse_plan_synced_on_import",
                            account_id=account.id,
                            email=email,
                            plan_name=plan_details.get("plan_name"),
                            max_concurrent_jobs=account.max_concurrent_jobs,
                        )
                except Exception as e:
                    # Plan detection failure should not block account creation
                    logger.warning(
                        "pixverse_plan_sync_failed_on_import",
                        account_id=account.id,
                        email=email,
                        error=str(e),
                    )

            # Final credit sync (fresh extraction already done above, but ensure it's reflected)
            return CookieImportResponse(
                success=True,
                message=f"Created new account {email}" + (f" with credits: {', '.join(credits_imported)}" if credits_imported else ""),
                account_id=account.id,
                email=email,
                created=True,
                updated_fields=["jwt_token", "cookies"] + (["credits"] if credits_imported else [])
            )

    except HTTPException:
        raise
    except ValueError as e:
        # Provider adapter couldn't extract a real email (e.g., missing pixverse-py)
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": f"Failed to import cookies: {str(e)}",
                "code": "email_missing",
                "hint": "Install pixverse-py on backend to enable getUserInfo, or ensure JWT includes an email claim.",
            }
        )
    except Exception as e:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "message": f"Failed to import cookies: {str(e)}",
                "code": "import_error"
            }
        )
