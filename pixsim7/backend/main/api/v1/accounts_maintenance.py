"""
Provider account maintenance API endpoints.

Admin-flavored cleanups split out of ``accounts.py`` so the CRUD module
stays focused on the day-to-day list/get/create/update/delete surface:

- ``GET  /accounts/deduplicate``  — preview duplicate-account merge.
- ``POST /accounts/deduplicate``  — execute the merge (FK-aware).
- ``POST /accounts/cleanup``      — clear stale cooldowns / EXHAUSTED
  state, reconcile concurrency counters.

Routes are mounted under the same ``/api/v1`` prefix as the other
account modules via ``main/routes/accounts/manifest.py`` — combining
multiple sibling routers into one plugin keeps the URL surface unified
while letting the implementation live in topically-focused files.
"""
from typing import Optional, List, Dict, Any
import logging

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text

from pixsim7.backend.main.api.dependencies import (
    AccountSvc,
    CurrentUser,
    DatabaseSession,
)


router = APIRouter()
logger = logging.getLogger(__name__)


# ===== DUPLICATE-ACCOUNT DETECTION =====


async def _find_duplicate_accounts(
    db: DatabaseSession,
    provider_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Find duplicate accounts to delete.

    Groups by (in order of precedence):
    1. provider_user_id (if available) - same Pixverse account ID means same account
       e.g., "holyfruit" and "holy_fruit_92" with same provider_user_id
    2. username prefix (before @) - catches "john_doe" vs "john_doe@gmail.com"

    For each group, keeps the "best" account:
    - Prefers accounts with proper email (contains @)
    - Then most recent last_used timestamp
    - Then highest ID (most recently created)

    Returns list of accounts that would be deleted (not the ones to keep).
    """
    # Build query with optional provider filter (avoid IS NULL ambiguity)
    provider_filter = "provider_id = :provider_id" if provider_id else "1=1"

    # Use COALESCE to group by provider_user_id first, then fall back to username prefix
    # This catches cases like "holyfruit" and "holy_fruit_92" with same provider_user_id
    find_query = text(f"""
        SELECT id, email, provider_id, user_id, status, last_used, provider_user_id
        FROM (
            SELECT
                id, email, provider_id, user_id, status, last_used, provider_user_id,
                ROW_NUMBER() OVER (
                    PARTITION BY
                        COALESCE(
                            provider_user_id,
                            LOWER(SPLIT_PART(email, '@', 1))
                        ),
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
            "provider_user_id": row.provider_user_id,
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
    try:
        accounts_to_delete = await _find_duplicate_accounts(db, provider_id)
        fk_stats: Dict[str, int] = {}

        if accounts_to_delete:
            ids_to_delete = [a["id"] for a in accounts_to_delete]

            # Build CTE to find primary account for each duplicate group
            # Uses same COALESCE logic: provider_user_id first, then username prefix
            provider_filter = "provider_id = :provider_id" if provider_id else "1=1"
            duplicate_accounts_cte = f"""
                WITH primary_accounts AS (
                    SELECT id, group_key, provider_id
                    FROM (
                        SELECT
                            id, provider_id,
                            COALESCE(provider_user_id, LOWER(SPLIT_PART(email, '@', 1))) as group_key,
                            ROW_NUMBER() OVER (
                                PARTITION BY
                                    COALESCE(provider_user_id, LOWER(SPLIT_PART(email, '@', 1))),
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
                        ON COALESCE(pa.provider_user_id, LOWER(SPLIT_PART(pa.email, '@', 1))) = p.group_key
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


# ===== STATE CLEANUP =====


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
        from pixsim7.backend.main.workers.status_poller_maintenance import reconcile_account_counters
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
