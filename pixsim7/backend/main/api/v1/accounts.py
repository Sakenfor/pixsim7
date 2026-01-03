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


# ===== NON-PARAMETERIZED ROUTES (must come before {account_id}) =====


async def _find_duplicate_accounts(
    db: DatabaseSession,
    provider_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Find duplicate accounts to delete.

    Groups by username prefix (before @) to catch both exact duplicates
    and username-vs-email duplicates ("john_doe" vs "john_doe@gmail.com").

    For each group, keeps the "best" account:
    - Prefers accounts with proper email (contains @)
    - Then most recent last_used timestamp
    - Then highest ID (most recently created)

    Returns list of accounts that would be deleted (not the ones to keep).
    """
    from sqlalchemy import text

    # Build query with optional provider filter (avoid IS NULL ambiguity)
    provider_filter = "provider_id = :provider_id" if provider_id else "1=1"

    find_query = text(f"""
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
            WHERE {provider_filter}
        ) ranked
        WHERE rn > 1
        ORDER BY email, provider_id
    """)

    params = {"provider_id": provider_id} if provider_id else {}
    result = await db.execute(find_query, params)
    rows = result.fetchall()

    return [
        {
            "id": row.id,
            "email": row.email,
            "provider_id": row.provider_id,
            "user_id": row.user_id,
            "status": row.status,
            "last_used": str(row.last_used) if row.last_used else None,
        }
        for row in rows
    ]


@router.get("/accounts/deduplicate")
async def preview_deduplicate_accounts(
    user: CurrentUser,
    db: DatabaseSession,
    provider_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Preview which duplicate accounts would be removed.

    GET = dry run (preview only)
    POST = actually delete

    Duplicates can cause session conflicts when logging in because both
    accounts may have the same credentials but different session data.
    """
    try:
        accounts_to_delete = await _find_duplicate_accounts(db, provider_id)

        return {
            "success": True,
            "provider_id": provider_id or "all",
            "duplicate_count": len(accounts_to_delete),
            "accounts": accounts_to_delete,
        }

    except Exception as e:
        logger.error(f"Failed to find duplicate accounts: {e}")
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Failed to find duplicate accounts: {str(e)}"
        )


async def _handle_fk_constraints_for_deletion(
    db: DatabaseSession,
    ids_to_delete: List[int],
    duplicate_accounts_cte: str,
    params: Dict[str, Any],
) -> Dict[str, int]:
    """
    Dynamically handle all FK constraints pointing to provider_accounts before deletion.

    Queries PostgreSQL system catalog to find all tables referencing provider_accounts,
    then either reassigns records to the primary account or deletes them.

    Returns dict with counts of affected records per table.
    """
    from sqlalchemy import text

    # Tables where we want to REASSIGN records to the primary account (preserve history/data)
    # - generations: generation history
    # - provider_submissions: submission records
    # - assets: user's generated content (referenced by generations)
    REASSIGN_TABLES = {"generations", "provider_submissions", "assets"}

    # Find all FK constraints pointing to provider_accounts
    fk_query = text("""
        SELECT
            tc.table_name,
            kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
            AND ccu.table_name = 'provider_accounts'
            AND ccu.column_name = 'id'
    """)
    result = await db.execute(fk_query)
    fk_constraints = result.fetchall()

    stats: Dict[str, int] = {}

    for row in fk_constraints:
        table_name = row.table_name
        column_name = row.column_name

        if table_name in REASSIGN_TABLES:
            # Reassign to primary account
            reassign_query = text(f"""
                {duplicate_accounts_cte}
                UPDATE {table_name} t
                SET {column_name} = da.primary_id
                FROM duplicate_accounts da
                WHERE t.{column_name} = da.duplicate_id
            """)
            result = await db.execute(reassign_query, params)
            stats[f"{table_name}_reassigned"] = result.rowcount
        else:
            # Delete records (account-specific data like credits)
            delete_query = text(f"""
                DELETE FROM {table_name}
                WHERE {column_name} = ANY(:ids)
            """)
            result = await db.execute(delete_query, {"ids": ids_to_delete})
            stats[f"{table_name}_deleted"] = result.rowcount

    return stats


@router.post("/accounts/deduplicate")
async def deduplicate_accounts(
    user: CurrentUser,
    db: DatabaseSession,
    provider_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Remove duplicate accounts, keeping the one with most recent activity.

    GET = dry run (preview only)
    POST = actually delete

    Automatically handles all FK constraints:
    - generations, provider_submissions: reassigned to primary account
    - Other tables (credits, etc.): deleted
    """
    from sqlalchemy import text

    try:
        accounts_to_delete = await _find_duplicate_accounts(db, provider_id)
        fk_stats: Dict[str, int] = {}

        if accounts_to_delete:
            ids_to_delete = [a["id"] for a in accounts_to_delete]

            # Build CTE to find primary account for each duplicate group
            provider_filter = "provider_id = :provider_id" if provider_id else "1=1"
            duplicate_accounts_cte = f"""
                WITH primary_accounts AS (
                    SELECT id, LOWER(SPLIT_PART(email, '@', 1)) as username_prefix, provider_id
                    FROM (
                        SELECT
                            id, email, provider_id,
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
                        WHERE {provider_filter}
                    ) ranked
                    WHERE rn = 1
                ),
                duplicate_accounts AS (
                    SELECT
                        pa.id as duplicate_id,
                        p.id as primary_id
                    FROM provider_accounts pa
                    JOIN primary_accounts p
                        ON LOWER(SPLIT_PART(pa.email, '@', 1)) = p.username_prefix
                        AND pa.provider_id = p.provider_id
                    WHERE pa.id = ANY(:ids_to_delete)
                )
            """

            params = {"ids_to_delete": ids_to_delete}
            if provider_id:
                params["provider_id"] = provider_id

            # Handle all FK constraints dynamically
            fk_stats = await _handle_fk_constraints_for_deletion(
                db, ids_to_delete, duplicate_accounts_cte, params
            )

            # Now safe to delete the duplicate accounts
            delete_query = text("""
                DELETE FROM provider_accounts
                WHERE id = ANY(:ids)
            """)
            await db.execute(delete_query, {"ids": ids_to_delete})
            await db.commit()
            logger.info(f"Deleted {len(ids_to_delete)} duplicate accounts, FK stats: {fk_stats}")

        return {
            "success": True,
            "provider_id": provider_id or "all",
            "deleted": len(accounts_to_delete),
            "fk_operations": fk_stats,
            "accounts": accounts_to_delete,
        }

    except Exception as e:
        logger.error(f"Failed to deduplicate accounts: {e}")
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Failed to deduplicate accounts: {str(e)}"
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


# ===== PARAMETERIZED ROUTES =====

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

