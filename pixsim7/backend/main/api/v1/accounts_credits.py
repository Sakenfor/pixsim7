"""
Provider account credit sync & status API endpoints

Handles credit synchronization, batch updates, and provider-specific status queries.
"""
from typing import Optional, Dict, Any, List
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from pixsim7.backend.main.api.dependencies import CurrentUser, AccountSvc, DatabaseSession
from pixsim7.backend.main.shared.errors import ResourceNotFoundError
from pixsim7.backend.main.services.provider import registry, RateLimitError

router = APIRouter()
logger = logging.getLogger(__name__)

# TTL for credit sync (skip if synced within this time)
CREDIT_SYNC_TTL_SECONDS = 5 * 60  # 5 minutes


def should_skip_credit_sync(account, force: bool = False) -> tuple[bool, str]:
    """
    Check if credit sync should be skipped for this account.

    Returns (should_skip, reason) tuple.

    Skip conditions:
    1. If force=True, never skip
    2. If synced within TTL, skip
    3. If exhausted (0 credits) and synced today, skip
    """
    if force:
        return False, ""

    metadata = account.provider_metadata or {}
    credits_synced_at_str = metadata.get("credits_synced_at")

    if not credits_synced_at_str:
        return False, ""  # Never synced, don't skip

    try:
        credits_synced_at = datetime.fromisoformat(credits_synced_at_str.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return False, ""  # Invalid timestamp, don't skip

    now = datetime.now(timezone.utc)
    time_since_sync = (now - credits_synced_at).total_seconds()

    # Check TTL
    if time_since_sync < CREDIT_SYNC_TTL_SECONDS:
        return True, "synced_recently"

    # Check if exhausted today
    total_credits = account.get_total_credits()
    if total_credits == 0:
        # Check if synced today (same UTC date)
        if credits_synced_at.date() == now.date():
            return True, "exhausted_today"

    return False, ""


def update_sync_timestamp(account) -> None:
    """Update the credits_synced_at timestamp in provider_metadata."""
    metadata = account.provider_metadata or {}
    metadata["credits_synced_at"] = datetime.now(timezone.utc).isoformat()
    account.provider_metadata = metadata


# ===== SCHEMAS =====

class SyncCreditsResponse(BaseModel):
    """Response from credit sync"""
    success: bool
    credits: Dict[str, int]
    message: str


class BatchSyncCreditsRequest(BaseModel):
    """Request for batch credit sync"""
    account_ids: Optional[List[int]] = Field(
        default=None,
        description="Specific account IDs to sync. If None, syncs all user accounts."
    )
    force: bool = Field(
        default=False,
        description="Force sync even if recently synced or exhausted"
    )


class BatchSyncCreditsResponse(BaseModel):
    """Response from batch credit sync"""
    success: bool
    synced: int
    skipped: int = 0
    failed: int
    total: int
    details: List[Dict[str, Any]] = Field(default_factory=list)


class PixverseStatusResponse(BaseModel):
    """Combined Pixverse credits + ad task status"""
    provider_id: str
    email: str
    credits: Dict[str, int]
    ad_watch_task: Optional[Dict[str, Any]] = None


# ===== ENDPOINTS =====

@router.post("/accounts/sync-all-credits", response_model=BatchSyncCreditsResponse)
async def sync_all_account_credits(
    user: CurrentUser,
    account_service: AccountSvc,
    db: DatabaseSession,
    request: Optional[BatchSyncCreditsRequest] = None,
    provider_id: Optional[str] = None
):
    """Sync credits for user accounts in one batch operation.

    Smart skip logic:
    - Skips accounts synced within TTL (5 minutes)
    - Skips accounts with 0 credits that were synced today (daily credits don't reset mid-day)
    - Use force=True to bypass skip logic

    Optionally filter by provider_id or specific account_ids.

    Returns summary of successful, skipped, and failed syncs.
    """
    req = request or BatchSyncCreditsRequest()
    force = req.force
    account_ids = req.account_ids

    # Get accounts to sync
    if account_ids:
        # Fetch specific accounts
        accounts = []
        for aid in account_ids:
            try:
                acc = await account_service.get_account(aid)
                # Only allow syncing own accounts (unless admin)
                if acc.user_id == user.id or user.is_admin():
                    accounts.append(acc)
            except ResourceNotFoundError:
                pass
    else:
        # Get all user accounts (optionally filtered by provider)
        accounts = await account_service.list_accounts(
            user_id=user.id,
            provider_id=provider_id,
            include_shared=False  # Only sync user's own accounts
        )

    synced = 0
    skipped = 0
    failed = 0
    details = []

    # Pre-extract account info to avoid lazy loading issues after rollback
    # When a rollback happens, account objects may be expired and accessing
    # their attributes would trigger lazy loading which fails with async sessions
    account_info_list = [
        {
            "account": acc,
            "id": acc.id,
            "email": acc.email,
            "provider_id": acc.provider_id,
            "cookies": acc.cookies,
        }
        for acc in accounts
    ]

    for acc_info in account_info_list:
        account = acc_info["account"]
        account_id = acc_info["id"]
        account_email = acc_info["email"]
        account_provider_id = acc_info["provider_id"]
        account_cookies = acc_info["cookies"]

        # Check if should skip
        should_skip, skip_reason = should_skip_credit_sync(account, force=force)
        if should_skip:
            skipped += 1
            details.append({
                "account_id": account_id,
                "email": account_email,
                "status": "skipped",
                "reason": skip_reason
            })
            continue

        try:
            # Get provider and sync credits
            from pixsim7.backend.main.domain import ProviderCredit

            provider = registry.get(account_provider_id)

            # Try provider's get_credits method first
            credits_data = None
            if hasattr(provider, "get_credits"):
                try:
                    if account_provider_id == "pixverse" and hasattr(provider, "get_credits_basic"):
                        credits_data = await provider.get_credits_basic(account, retry_on_session_error=True)
                    else:
                        credits_data = await provider.get_credits(account)
                except Exception as e:
                    logger.debug(f"Provider get_credits failed for {account_email}: {e}")

            # Fallback: extract from account data
            if not credits_data:
                raw_data = {'cookies': account_cookies or {}}
                extracted = await provider.extract_account_data(raw_data, fallback_email=account_email)
                credits_data = extracted.get('credits')

            # Update credits if available
            if credits_data and isinstance(credits_data, dict):
                updated_credits: Dict[str, int] = {}

                if account_provider_id == "pixverse":
                    # Pixverse has separate web and OpenAPI credit pools.
                    # Treat this sync as authoritative and clear any legacy
                    # credit buckets (e.g. old "package" rows) to avoid
                    # double-counting in total_credits.
                    await db.execute(
                        ProviderCredit.__table__.delete().where(
                            ProviderCredit.account_id == account_id
                        )
                    )

                    web_total = credits_data.get("web")
                    openapi_total = credits_data.get("openapi")

                    if web_total is not None:
                        try:
                            web_int = int(web_total)
                        except (TypeError, ValueError):
                            web_int = 0
                        await account_service.set_credit(account_id, "web", web_int)
                        updated_credits["web"] = web_int

                    if openapi_total is not None:
                        try:
                            openapi_int = int(openapi_total)
                        except (TypeError, ValueError):
                            openapi_int = 0
                        await account_service.set_credit(account_id, "openapi", openapi_int)
                        updated_credits["openapi"] = openapi_int
                else:
                    for credit_type, amount in credits_data.items():
                        # Strip credit_ prefix if present (credit_daily -> daily)
                        clean_type = credit_type.replace('credit_', '') if credit_type.startswith('credit_') else credit_type

                        # Skip computed fields like total_credits / total (check AFTER prefix strip)
                        if clean_type in ('total_credits', 'total'):
                            continue

                        try:
                            await account_service.set_credit(account_id, clean_type, amount)
                            updated_credits[clean_type] = amount
                        except Exception as e:
                            logger.warning(f"Failed to update {clean_type} for {account_email}: {e}")

                if updated_credits:
                    # Update sync timestamp
                    update_sync_timestamp(account)
                    db.add(account)
                    await db.commit()
                    await db.refresh(account)

                    synced += 1
                    details.append({
                        "account_id": account_id,
                        "email": account_email,
                        "credits": updated_credits,
                        "status": "synced"
                    })
                else:
                    failed += 1
                    details.append({
                        "account_id": account_id,
                        "email": account_email,
                        "success": False,
                        "error": "No usable credits data available"
                    })
            else:
                failed += 1
                details.append({
                    "account_id": account_id,
                    "email": account_email,
                    "success": False,
                    "error": "No credits data available"
                })

        except RateLimitError as e:
            failed += 1
            retry_after = getattr(e, "retry_after", None)
            logger.warning(
                "Provider rate limit while syncing credits",
                extra={
                    "account_id": account_id,
                    "email": account_email,
                    "provider_id": account.provider_id,
                    "retry_after": retry_after,
                },
            )
            # Rollback to clean session state
            try:
                await db.rollback()
            except Exception:
                pass
            # Back off briefly before processing further accounts to avoid
            # hammering a rate-limited provider.
            sleep_seconds = retry_after if isinstance(retry_after, (int, float)) and retry_after > 0 else 1
            await asyncio.sleep(min(sleep_seconds, 10))
            details.append({
                "account_id": account_id,
                "email": account_email,
                "success": False,
                "error": f"Rate limited: {str(e)}",
                "retry_after": retry_after,
            })

        except Exception as e:
            failed += 1
            details.append({
                "account_id": account_id,
                "email": account_email,
                "success": False,
                "error": str(e)
            })
            logger.error(f"Failed to sync credits for account {account_id}: {e}")
            # Rollback to clean session state and allow subsequent accounts to succeed
            try:
                await db.rollback()
            except Exception:
                pass  # Best effort rollback

    return BatchSyncCreditsResponse(
        success=True,
        synced=synced,
        skipped=skipped,
        failed=failed,
        total=len(accounts),
        details=details
    )


@router.post("/accounts/{account_id}/sync-credits", response_model=SyncCreditsResponse)
async def sync_account_credits(
    account_id: int,
    user: CurrentUser,
    account_service: AccountSvc,
    db: DatabaseSession,
    force: bool = False
):
    """Sync credits from provider API (via getUserInfo or equivalent).

    Fetches current credits from the provider and updates the account.

    Smart skip logic (unless force=True):
    - Skips if synced within TTL (5 minutes)
    - Skips if 0 credits and synced today
    """
    logger.info(
        "sync_credits_requested",
        account_id=account_id,
        user_id=user.id,
        force=force,
    )
    try:
        account = await account_service.get_account(account_id)
        # Ownership or admin required
        if account.user_id is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Cannot sync credits for system accounts")
        if account.user_id != user.id and not user.is_admin():
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed to sync this account's credits")

        # Check if should skip
        should_skip, skip_reason = should_skip_credit_sync(account, force=force)
        if should_skip:
            logger.info(
                "sync_credits_skipped",
                account_id=account_id,
                reason=skip_reason,
            )
            # Return current cached credits
            credits = {}
            for c in account.credits:
                credits[c.credit_type] = c.amount
            return SyncCreditsResponse(
                success=True,
                credits=credits,
                message=f"Skipped: {skip_reason}"
            )

        # Get provider and call dedicated credit fetch function
        from pixsim7.backend.main.domain import ProviderCredit

        provider = registry.get(account.provider_id)

        # Use provider's get_credits method if available
        credits_data = None
        if hasattr(provider, "get_credits"):
            try:
                if account.provider_id == "pixverse" and hasattr(provider, "get_credits_basic"):
                    # Enable auto-reauth for user-triggered sync
                    logger.info(
                        "sync_credits_calling_provider",
                        account_id=account.id,
                        provider_id=account.provider_id,
                    )
                    credits_data = await provider.get_credits_basic(account, retry_on_session_error=True)
                    logger.info(
                        "sync_credits_provider_success",
                        account_id=account.id,
                        credits=credits_data,
                    )
                else:
                    credits_data = await provider.get_credits(account)
            except Exception as e:
                logger.error(
                    "sync_account_credits_provider_error",
                    account_id=account.id,
                    email=account.email,
                    provider_id=account.provider_id,
                    error=str(e),
                    error_type=e.__class__.__name__,
                    exc_info=True,
                )
                # If the provider call left the DB session in a bad state (e.g.
                # pending rollback from a failed flush/commit), make a
                # best-effort rollback so subsequent operations don't hit
                # PendingRollbackError when we try to update credits.
                try:
                    await db.rollback()
                except Exception:
                    pass
                # Re-raise for user-triggered sync so errors are visible
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to sync credits: {str(e)}"
                )

        # Fallback: extract from account data
        if not credits_data:
            raw_data = {'cookies': account.cookies or {}}
            extracted = await provider.extract_account_data(raw_data, fallback_email=account.email)
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

            # Update sync timestamp
            update_sync_timestamp(account)
            db.add(account)
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


@router.get("/accounts/{account_id}/pixverse-status", response_model=PixverseStatusResponse)
async def get_pixverse_status(
    account_id: int,
    user: CurrentUser,
    account_service: AccountSvc,
    db: DatabaseSession,
):
    """Get combined Pixverse credits + ad task status for an account.

    Security:
    - Only the owner or an admin can query this endpoint.
    - Intended for tooling / extensions that need a quick snapshot of
      current web/OpenAPI credits plus daily watch-ad task state.
    """
    try:
        account = await account_service.get_account(account_id)

        # Ownership or admin required (system accounts are not exposed)
        if account.user_id is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Cannot query system accounts")
        if account.user_id != user.id and not user.is_admin():
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed to query this account")

        # Capture basic identifiers up front so we can safely log even if
        # the underlying DB session encounters errors during provider calls
        # (e.g. leaving the SQLAlchemy Session in a pending-rollback state).
        account_id = account.id
        account_email = account.email
        account_provider_id = account.provider_id

        # Get provider adapter
        provider = registry.get(account_provider_id)

        # Fetch credits via provider (best-effort). For Pixverse, treat this as a
        # read-only snapshot: do not trigger auto-reauth from this endpoint to
        # avoid heavy Playwright flows and session churn when refreshing ad status.
        credits_data: Dict[str, Any] = {}
        try:
            if hasattr(provider, "get_credits"):
                if getattr(provider, "provider_id", None) == "pixverse":
                    credits_data = await provider.get_credits(  # type: ignore[arg-type]
                        account,
                        retry_on_session_error=False,
                    ) or {}
                else:
                    credits_data = await provider.get_credits(account) or {}
        except Exception as e:  # pragma: no cover - defensive
            logger.warning(
                "get_pixverse_status_provider_error",
                extra={
                    "account_id": account_id,
                    "email": account_email,
                    "provider_id": account_provider_id,
                    "error": str(e),
                    "error_type": e.__class__.__name__,
                },
            )
            # If the provider call left the DB session in a bad state (e.g.
            # pending rollback from an async flush), make a best-effort
            # rollback so subsequent operations don't fail with
            # PendingRollbackError.
            try:
                await db.rollback()
            except Exception:  # pragma: no cover - defensive
                pass
            credits_data = {}

        # Normalize credits dict: keep simple numeric buckets
        credits: Dict[str, int] = {}
        ad_watch_task: Optional[Dict[str, Any]] = None

        if isinstance(credits_data, dict):
            # Extract ad task metadata if present
            ad = credits_data.get("ad_watch_task")
            if isinstance(ad, dict):
                ad_watch_task = ad

            # Copy numeric credit buckets
            for key, value in credits_data.items():
                if key == "ad_watch_task":
                    continue
                try:
                    credits[key] = int(value)
                except (TypeError, ValueError):
                    continue

        # Fallback: if provider is not pixverse, ad_watch_task will be None
        return PixverseStatusResponse(
            provider_id=account_provider_id,
            email=account_email,
            credits=credits,
            ad_watch_task=ad_watch_task,
        )

    except ResourceNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
