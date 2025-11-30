"""
Provider account management API endpoints - Core CRUD operations

Users can add their own provider accounts (Pixverse, Runway, etc.)
and manage credentials, credits, and sharing settings.

For auth-related operations (cookie import, re-auth), see accounts_auth.py
For credit sync operations, see accounts_credits.py
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging
from fastapi import APIRouter, HTTPException, status
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
from pixsim7.backend.main.domain.provider_auth import PixverseAuthMethod
from pixsim7.backend.main.shared.errors import ResourceNotFoundError

router = APIRouter()
logger = logging.getLogger(__name__)


# ===== HELPER FUNCTIONS =====
# Note: These are also duplicated in accounts_auth.py - consider moving to shared module

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


# ===== ACCOUNT CRUD =====

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
            status=request.status,
            is_google_account=request.is_google_account
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
