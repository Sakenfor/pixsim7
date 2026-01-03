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
from pixsim7.backend.main.domain import AccountStatus
from pixsim7.backend.main.domain.providers import ProviderAccount
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

    # Sanitize api_keys for response (keep metadata)
    sanitized_api_keys = None
    if api_keys:
        logger.debug(f"Account {account.id} has {len(api_keys)} api_keys: {api_keys}")
        sanitized_api_keys = [
            {
                "id": k.get("id", ""),
                "kind": k.get("kind", ""),
                "value": k.get("value", ""),  # Full value - frontend will mask display
                "name": k.get("name", ""),
            }
            for k in api_keys
            if isinstance(k, dict)
        ]
    else:
        logger.debug(f"Account {account.id} has no api_keys")

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
        api_keys=sanitized_api_keys,
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


# ===== API KEY MANAGEMENT =====

@router.post("/accounts/{account_id}/create-api-key")
async def create_account_api_key(
    account_id: int,
    user: CurrentUser,
    account_service: AccountSvc,
    db: DatabaseSession,
    name: str | None = None
):
    """
    Create an OpenAPI key for a Pixverse account.

    This enables efficient status polling via direct API calls instead of
    listing all videos. Any JWT-authenticated Pixverse account can create
    API keys.

    Returns:
        Dict with api_key_id, api_key_name, api_key_sign (the actual key)
    """
    from pixsim7.backend.main.domain.providers.registry import registry

    try:
        account = await account_service.get_account(account_id)

        # Only owner can create API key
        if account.user_id is not None and account.user_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your account")

        # Only Pixverse accounts supported
        if account.provider_id != "pixverse":
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "API key creation only supported for Pixverse accounts"
            )

        # Get Pixverse provider
        provider = registry.get("pixverse")

        # Create API key
        result = await provider.create_api_key(account, name=name)

        # Explicitly mark api_keys as modified (mutable JSON field)
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(account, "api_keys")

        await db.commit()
        await db.refresh(account)

        # Return result with updated account info
        return {
            "success": True,
            "api_key_id": result.get("api_key_id"),
            "api_key_name": result.get("api_key_name"),
            "api_key": result.get("api_key_sign"),
            "already_exists": result.get("already_exists", False),
            "account": _to_response(account, user.id),
        }

    except ResourceNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    except Exception as e:
        logger.error(f"Failed to create API key for account {account_id}: {e}")
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Failed to create API key: {str(e)}"
        )


@router.post("/accounts/cleanup")
async def cleanup_account_states(
    provider_id: Optional[str] = None,
    user: CurrentUser = None,
    account_service: AccountSvc = None,
) -> Dict[str, Any]:
    """
    Maintenance endpoint to clean up account states:
    - Clear expired cooldowns
    - Fix incorrectly marked EXHAUSTED accounts (that have credits)
    - Mark accounts with 0 credits as EXHAUSTED

    Args:
        provider_id: Optional provider filter (e.g., "pixverse")

    Returns:
        Cleanup statistics
    """
    try:
        stats = await account_service.cleanup_account_states(provider_id)
        # Also reconcile concurrency counters so stuck jobs don't block capacity.
        from pixsim7.backend.main.workers.status_poller import reconcile_account_counters
        reconcile_stats = await reconcile_account_counters({})

        return {
            "success": True,
            "provider_id": provider_id or "all",
            "stats": stats,
            "reconcile": reconcile_stats,
            "message": (
                f"Cleaned up {stats['cooldowns_cleared']} cooldowns, "
                f"reactivated {stats['reactivated']} accounts, "
                f"marked {stats['marked_exhausted']} as exhausted. "
                f"Reconciled {reconcile_stats.get('reconciled', 0)} counters "
                f"({reconcile_stats.get('errors', 0)} errors)."
            ),
        }

    except Exception as e:
        logger.error(f"Failed to cleanup account states: {e}")
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Failed to cleanup account states: {str(e)}"
        )


@router.get("/accounts/duplicates")
async def find_duplicate_accounts(
    user: CurrentUser,
    db: DatabaseSession,
    provider_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Find duplicate accounts (same email + provider, different user_id).

    Duplicates can cause session conflicts when logging in because both
    accounts may have the same credentials but different session data.

    Returns:
        List of duplicate groups with account details
    """
    from sqlalchemy import func, text

    try:
        # Find emails that appear more than once for the same provider
        query = text("""
            SELECT
                email,
                provider_id,
                COUNT(*) as count,
                STRING_AGG(
                    id::text || ':user=' || COALESCE(user_id::text, 'NULL') || ':' || status || ':last=' || COALESCE(last_used::text, 'never'),
                    ' | '
                    ORDER BY COALESCE(last_used, '1970-01-01'::timestamp) DESC
                ) as entries
            FROM provider_accounts
            WHERE (:provider_id IS NULL OR provider_id = :provider_id)
            GROUP BY email, provider_id
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC
        """)

        result = await db.execute(query, {"provider_id": provider_id})
        rows = result.fetchall()

        duplicates = []
        for row in rows:
            duplicates.append({
                "email": row.email,
                "provider_id": row.provider_id,
                "count": row.count,
                "entries": row.entries,
            })

        return {
            "success": True,
            "provider_id": provider_id or "all",
            "duplicate_count": len(duplicates),
            "duplicates": duplicates,
        }

    except Exception as e:
        logger.error(f"Failed to find duplicate accounts: {e}")
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Failed to find duplicate accounts: {str(e)}"
        )


@router.post("/accounts/deduplicate")
async def deduplicate_accounts(
    user: CurrentUser,
    db: DatabaseSession,
    provider_id: Optional[str] = None,
    dry_run: bool = True,
) -> Dict[str, Any]:
    """
    Remove duplicate accounts, keeping the one with most recent activity.

    Handles two types of duplicates:
    1. Exact duplicates: same email + provider
    2. Username-vs-email duplicates: "john_doe" and "john_doe@gmail.com"
       (created when cookie import falls back to username as email)

    For each duplicate group:
    - Prefers accounts with proper email (contains @) over malformed ones
    - Then keeps the account with most recent last_used timestamp
    - If tie, keeps the one with highest ID (most recently created)
    - Deletes the others

    Args:
        provider_id: Optional provider filter
        dry_run: If True (default), only report what would be deleted

    Returns:
        Statistics and list of affected accounts
    """
    from sqlalchemy import text

    try:
        # Find accounts to delete (all but the "best" one per normalized email+provider)
        # Normalization: extract username part (before @) for grouping
        # This groups "john_doe" with "john_doe@gmail.com"
        # Ranking prefers: has @ > most recent last_used > highest ID
        find_query = text("""
            SELECT id, email, provider_id, user_id, status, last_used
            FROM (
                SELECT
                    id, email, provider_id, user_id, status, last_used,
                    ROW_NUMBER() OVER (
                        PARTITION BY
                            LOWER(SPLIT_PART(email, '@', 1)),
                            provider_id
                        ORDER BY
                            (CASE WHEN email LIKE '%@%' THEN 0 ELSE 1 END),
                            last_used DESC NULLS LAST,
                            id DESC
                    ) as rn
                FROM provider_accounts
                WHERE (:provider_id IS NULL OR provider_id = :provider_id)
            ) ranked
            WHERE rn > 1
            ORDER BY email, provider_id
        """)

        result = await db.execute(find_query, {"provider_id": provider_id})
        to_delete = result.fetchall()

        accounts_to_delete = [
            {
                "id": row.id,
                "email": row.email,
                "provider_id": row.provider_id,
                "user_id": row.user_id,
                "status": row.status,
                "last_used": str(row.last_used) if row.last_used else None,
            }
            for row in to_delete
        ]

        deleted_count = 0
        if not dry_run and accounts_to_delete:
            # Actually delete the duplicates
            ids_to_delete = [a["id"] for a in accounts_to_delete]
            delete_query = text("""
                DELETE FROM provider_accounts
                WHERE id = ANY(:ids)
            """)
            await db.execute(delete_query, {"ids": ids_to_delete})
            await db.commit()
            deleted_count = len(ids_to_delete)
            logger.info(f"Deleted {deleted_count} duplicate accounts")

        return {
            "success": True,
            "provider_id": provider_id or "all",
            "dry_run": dry_run,
            "would_delete" if dry_run else "deleted": len(accounts_to_delete),
            "accounts": accounts_to_delete,
            "message": (
                f"{'Would delete' if dry_run else 'Deleted'} {len(accounts_to_delete)} duplicate account(s). "
                f"{'Set dry_run=false to actually delete.' if dry_run else 'Duplicates removed.'}"
            ),
        }

    except Exception as e:
        logger.error(f"Failed to deduplicate accounts: {e}")
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Failed to deduplicate accounts: {str(e)}"
        )


