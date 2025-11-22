"""
Provider account management API endpoints - CLEAN VERSION

Users can add their own provider accounts (Pixverse, Runway, etc.)
and manage credentials, credits, and sharing settings.
"""
from typing import Optional, Dict, Any, List
from datetime import datetime
import logging
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from pixsim7.backend.main.api.dependencies import CurrentUser, AccountSvc, DatabaseSession
from pixsim7.backend.main.shared.schemas.account_schemas import (
    AccountCreate,
    AccountUpdate,
    AccountResponse,
    AccountBulkCreditUpdate,
    SetCreditRequest,
)
from pixsim7.backend.main.shared.jwt_utils import parse_jwt_token
from pixsim7.backend.main.domain import ProviderAccount, AccountStatus
from pixsim7.backend.main.shared.errors import ResourceNotFoundError

router = APIRouter()
logger = logging.getLogger(__name__)


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


# ===== EXPORT COOKIES (FOR EXTENSION LOGIN) =====

class AccountCookiesResponse(BaseModel):
    provider_id: str
    email: str
    cookies: Dict[str, str]


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

        cookies = account.cookies or {}
        if not isinstance(cookies, dict):
            cookies = {}

        return AccountCookiesResponse(
            provider_id=account.provider_id,
            email=account.email,
            cookies=cookies
        )
    except ResourceNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")


# ===== SYNC CREDITS =====

class SyncCreditsResponse(BaseModel):
    """Response from credit sync"""
    success: bool
    credits: Dict[str, int]
    message: str


class BatchSyncCreditsResponse(BaseModel):
    """Response from batch credit sync"""
    success: bool
    synced: int
    failed: int
    total: int
    details: List[Dict[str, Any]] = Field(default_factory=list)


@router.post("/accounts/sync-all-credits", response_model=BatchSyncCreditsResponse)
async def sync_all_account_credits(
    user: CurrentUser,
    account_service: AccountSvc,
    db: DatabaseSession,
    provider_id: Optional[str] = None
):
    """Sync credits for all user accounts in one batch operation.

    This is more efficient than calling sync-credits for each account individually.
    Optionally filter by provider_id to sync only accounts for a specific provider.

    Returns summary of successful and failed syncs.
    """
    # Get all user accounts (optionally filtered by provider)
    accounts = await account_service.list_accounts(
        user_id=user.id,
        provider_id=provider_id,
        include_shared=False  # Only sync user's own accounts
    )

    synced = 0
    failed = 0
    details = []

    for account in accounts:
        try:
            # Get provider and sync credits
            from pixsim7.backend.main.services.provider import registry
            from pixsim7.backend.main.domain import ProviderCredit

            provider = registry.get(account.provider_id)

            # Try provider's get_credits method first
            credits_data = None
            if hasattr(provider, 'get_credits'):
                try:
                    credits_data = provider.get_credits(account)
                except Exception as e:
                    logger.debug(f"Provider get_credits failed for {account.email}: {e}")

            # Fallback: extract from account data
            if not credits_data:
                raw_data = {'cookies': account.cookies or {}}
                extracted = await provider.extract_account_data(raw_data)
                credits_data = extracted.get('credits')

            # Update credits if available
            if credits_data and isinstance(credits_data, dict):
                updated_credits: Dict[str, int] = {}

                if account.provider_id == "pixverse":
                    # Pixverse has separate web and OpenAPI credit pools.
                    # Treat this sync as authoritative and clear any legacy
                    # credit buckets (e.g. old "package" rows) to avoid
                    # double-counting in total_credits.
                    await db.execute(
                        ProviderCredit.__table__.delete().where(
                            ProviderCredit.account_id == account.id
                        )
                    )

                    web_total = credits_data.get("web")
                    openapi_total = credits_data.get("openapi")

                    if web_total is not None:
                        try:
                            web_int = int(web_total)
                        except (TypeError, ValueError):
                            web_int = 0
                        await account_service.set_credit(account.id, "web", web_int)
                        updated_credits["web"] = web_int

                    if openapi_total is not None:
                        try:
                            openapi_int = int(openapi_total)
                        except (TypeError, ValueError):
                            openapi_int = 0
                        await account_service.set_credit(account.id, "openapi", openapi_int)
                        updated_credits["openapi"] = openapi_int
                else:
                    for credit_type, amount in credits_data.items():
                        # Strip credit_ prefix if present (credit_daily -> daily)
                        clean_type = credit_type.replace('credit_', '') if credit_type.startswith('credit_') else credit_type

                        # Skip computed fields like total_credits / total (check AFTER prefix strip)
                        if clean_type in ('total_credits', 'total'):
                            continue

                        try:
                            await account_service.set_credit(account.id, clean_type, amount)
                            updated_credits[clean_type] = amount
                        except Exception as e:
                            logger.warning(f"Failed to update {clean_type} for {account.email}: {e}")

                if updated_credits:
                    await db.commit()
                    await db.refresh(account)

                    synced += 1
                    details.append({
                        "account_id": account.id,
                        "email": account.email,
                        "credits": updated_credits,
                        "success": True
                    })
                else:
                    failed += 1
                    details.append({
                        "account_id": account.id,
                        "email": account.email,
                        "success": False,
                        "error": "No usable credits data available"
                    })
            else:
                failed += 1
                details.append({
                    "account_id": account.id,
                    "email": account.email,
                    "success": False,
                    "error": "No credits data available"
                })

        except Exception as e:
            failed += 1
            details.append({
                "account_id": account.id,
                "email": account.email,
                "success": False,
                "error": str(e)
            })
            logger.error(f"Failed to sync credits for account {account.id}: {e}")

    return BatchSyncCreditsResponse(
        success=True,
        synced=synced,
        failed=failed,
        total=len(accounts),
        details=details
    )


@router.post("/accounts/{account_id}/sync-credits", response_model=SyncCreditsResponse)
async def sync_account_credits(
    account_id: int,
    user: CurrentUser,
    account_service: AccountSvc,
    db: DatabaseSession
):
    """Sync credits from provider API (via getUserInfo or equivalent).

    Fetches current credits from the provider and updates the account.
    Useful after login or when credits need to be refreshed.
    """
    try:
        account = await account_service.get_account(account_id)
        # Ownership or admin required
        if account.user_id is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Cannot sync credits for system accounts")
        if account.user_id != user.id and not user.is_admin():
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed to sync this account's credits")

        # Get provider and call dedicated credit fetch function
        from pixsim7.backend.main.services.provider import registry
        from pixsim7.backend.main.domain import ProviderCredit

        provider = registry.get(account.provider_id)

        # Use provider's get_credits method if available
        credits_data = None
        if hasattr(provider, 'get_credits'):
            try:
                credits_data = provider.get_credits(account)
            except Exception as e:
                print(f"Provider get_credits failed: {e}, falling back to extract_account_data")
        
        # Fallback: extract from account data
        if not credits_data:
            raw_data = {'cookies': account.cookies or {}}
            extracted = await provider.extract_account_data(raw_data)
            credits_data = extracted.get('credits')

        # Update credits if available
        updated_credits: Dict[str, int] = {}
        if credits_data and isinstance(credits_data, dict):
            if account.provider_id == "pixverse":
                # For Pixverse, persist separate web and OpenAPI credit pools.
                # Clear any legacy credit buckets for this account so we don't
                # double-count in total_credits (e.g. old "package" rows).
                await db.execute(
                    ProviderCredit.__table__.delete().where(
                        ProviderCredit.account_id == account.id
                    )
                )

                web_total = credits_data.get("web")
                openapi_total = credits_data.get("openapi")

                if web_total is not None:
                    try:
                        web_int = int(web_total)
                    except (TypeError, ValueError):
                        web_int = 0
                    await account_service.set_credit(account.id, "web", web_int)
                    updated_credits["web"] = web_int

                if openapi_total is not None:
                    try:
                        openapi_int = int(openapi_total)
                    except (TypeError, ValueError):
                        openapi_int = 0
                    await account_service.set_credit(account.id, "openapi", openapi_int)
                    updated_credits["openapi"] = openapi_int
            else:
                for credit_type, amount in credits_data.items():
                    # Normalize credit type names (credit_daily -> daily)
                    clean_type = credit_type.replace("credit_", "") if credit_type.startswith("credit_") else credit_type

                    # Skip computed fields like total_credits/total (check AFTER prefix strip)
                    if clean_type in ("total_credits", "total"):
                        continue

                    try:
                        await account_service.set_credit(account.id, clean_type, amount)
                        updated_credits[clean_type] = amount
                    except Exception as e:
                        logger.warning(f"Failed to update credits {clean_type} for {account.email}: {e}")

            await db.commit()
            await db.refresh(account)
            return SyncCreditsResponse(
                success=True,
                credits=updated_credits,
                message=f"Synced {len(updated_credits)} credit types"
            )
        else:
            return SyncCreditsResponse(
                success=False,
                credits={},
                message="No credits data available from provider"
            )
    except ResourceNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    except Exception as e:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to sync credits: {str(e)}", "code": "sync_error"}
        )


# ===== LIST ACCOUNTS =====

@router.get("/accounts", response_model=list[AccountResponse])
async def list_accounts(
    user: CurrentUser,
    account_service: AccountSvc,
    provider_id: Optional[str] = None,
    status: Optional[AccountStatus] = None
):
    """
    List accounts (user's private + shared accounts + system accounts)

    Returns:
    - User's private accounts (is_private=True, user_id=current_user)
    - User's shared accounts (is_private=False, user_id=current_user)
    - Other users' shared accounts (is_private=False, user_id!=current_user)
    - System accounts (user_id=None)
    """
    accounts = await account_service.list_accounts(
        provider_id=provider_id,
        user_id=user.id,
        status=status,
        include_shared=True
    )
    return [_to_response(acc, user.id) for acc in accounts]


# ===== GET ACCOUNT =====

@router.get("/accounts/{account_id}", response_model=AccountResponse)
async def get_account(
    account_id: int,
    user: CurrentUser,
    account_service: AccountSvc
):
    """Get account details (anyone can view)"""
    try:
        account = await account_service.get_account(account_id)
        return _to_response(account, user.id)
    except ResourceNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")


# ===== CREATE ACCOUNT =====

@router.post("/accounts", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
async def create_account(
    request: AccountCreate,
    user: CurrentUser,
    account_service: AccountSvc,
    db: DatabaseSession
):
    """
    Create new provider account

    Users can add their own accounts for any provider (Pixverse, Runway, etc.)
    and choose whether to share them with other users.

    For Pixverse:
    - jwt_token: For WebAPI (free accounts)
    - api_keys: List of keys (e.g., kind='openapi' for OpenAPI keys)

    Credits are set separately via /accounts/{id}/credits endpoint.
    """
    try:
        account = await account_service.create_account(
            user_id=user.id,
            email=request.email,
            provider_id=request.provider_id,
            jwt_token=request.jwt_token,
            api_key=request.api_key,
            api_keys=request.api_keys,
            cookies=request.cookies,
            is_private=request.is_private
        )
        await db.commit()
        await db.refresh(account)
        return _to_response(account, user.id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))


# ===== UPDATE ACCOUNT =====

@router.patch("/accounts/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: int,
    request: AccountUpdate,
    user: CurrentUser,
    account_service: AccountSvc,
    db: DatabaseSession
):
    """
    Update account (owner only)

    Only the account owner can update credentials and settings.
    System accounts (user_id=None) cannot be updated via API.

    For Pixverse:
    - jwt_token: Update WebAPI credentials
    - api_keys: Update OpenAPI or other API keys
    """
    logger.info(
        f"[PATCH /accounts/{account_id}] User {user.id} updating account. "
        f"Request data: email={request.email}, nickname={request.nickname}, "
        f"has_api_key={request.api_key is not None}, has_api_keys={request.api_keys is not None}"
    )
    try:
        account = await account_service.update_account(
            account_id=account_id,
            user_id=user.id,
            email=request.email,
            nickname=request.nickname,
            jwt_token=request.jwt_token,
            api_key=request.api_key,
            api_keys=request.api_keys,
            cookies=request.cookies,
            is_private=request.is_private,
            status=request.status
        )
        await db.commit()
        await db.refresh(account)
        logger.info(f"[PATCH /accounts/{account_id}] Account updated successfully. New email: {account.email}, nickname: {account.nickname}")
        return _to_response(account, user.id)
    except ResourceNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    except ValueError as e:
        if "Not your account" in str(e):
            raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))


# ===== DELETE ACCOUNT =====

@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    account_id: int,
    user: CurrentUser,
    account_service: AccountSvc,
    db: DatabaseSession
):
    """
    Delete account (owner only)

    Only the account owner can delete their accounts.
    System accounts (user_id=None) cannot be deleted via API.
    """
    try:
        await account_service.delete_account(
            account_id=account_id,
            user_id=user.id
        )
        await db.commit()
    except ResourceNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    except ValueError as e:
        if "Not your account" in str(e) or "Cannot delete system accounts" in str(e):
            raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))


# ===== CREDIT MANAGEMENT =====

@router.post("/accounts/{account_id}/credits")
async def set_account_credit(
    account_id: int,
    request: SetCreditRequest,
    user: CurrentUser,
    account_service: AccountSvc,
    db: DatabaseSession
):
    """
    Set credit for specific type

    Example: Set webapi credits to 100
    POST /accounts/1/credits
    {"credit_type": "webapi", "amount": 100}

    Example: Set openapi credits to 50
    POST /accounts/1/credits
    {"credit_type": "openapi", "amount": 50}
    """
    try:
        # Verify account access
        account = await account_service.get_account(account_id)
        if account.user_id is not None and account.user_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your account")

        credit = await account_service.set_credit(
            account_id=account_id,
            credit_type=request.credit_type,
            amount=request.amount
        )
        await db.commit()

        # Return updated account
        await db.refresh(account)
        return _to_response(account, user.id)
    except ResourceNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")


@router.post("/accounts/credits/bulk-update")
async def bulk_update_credits(
    updates: list[AccountBulkCreditUpdate],
    user: CurrentUser,
    account_service: AccountSvc,
    db: DatabaseSession
):
    """
    Bulk update credits by email

    Example:
    POST /accounts/credits/bulk-update
    [{
        "email": "test@pixverse.ai",
        "credits": {"webapi": 100, "openapi": 50}
    }]

    Updates all accounts with matching email that are accessible to the user.
    """
    results = []
    for update in updates:
        updated = await account_service.update_credits_by_email(
            email=update.email,
            provider_id=update.provider_id,
            credits_map=update.credits
        )
        for acc in updated:
            results.append({
                "account_id": acc.id,
                "email": acc.email,
                "credits": {c.credit_type: c.amount for c in acc.credits} if acc.credits else {}
            })

    await db.commit()

    return {
        "updated": len(results),
        "details": results
    }


# ===== COOKIE IMPORT =====

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
    from sqlalchemy import select
    from pixsim7.backend.main.domain import ProviderAccount

    try:
        # Use provider adapter to extract account data from raw cookies/localStorage
        from pixsim7.backend.main.services.provider import registry

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
        provider_metadata = extracted.get('provider_metadata')

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

            # Update metadata fields
            if nickname and existing.nickname != nickname:
                existing.nickname = nickname
                updated_fields.append("nickname")

            if provider_user_id and existing.provider_user_id != provider_user_id:
                existing.provider_user_id = provider_user_id
                updated_fields.append("provider_user_id")

            if provider_metadata:
                existing.provider_metadata = provider_metadata
                updated_fields.append("provider_metadata")

            existing.updated_at = datetime.utcnow()

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
                from pixsim7.backend.main.services.provider import registry
                provider = registry.get(request.provider_id)
                fresh_extracted = await provider.extract_account_data(raw_data)
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
