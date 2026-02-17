"""
Credit estimation and sufficiency checks.

Handles estimating generation costs and verifying that users have
sufficient credits before creating a generation.
"""
import logging
from typing import Optional, Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain import OperationType
from pixsim7.backend.main.shared.errors import NoAccountAvailableError

logger = logging.getLogger(__name__)


def estimate_credits(
    operation_type: OperationType,
    provider_id: str,
    canonical_params: Dict[str, Any],
) -> Optional[int]:
    """
    Estimate credits required for a generation based on params.

    Delegates to the provider adapter for provider-specific pricing logic.

    Args:
        operation_type: Operation type
        provider_id: Provider identifier
        canonical_params: Canonicalized generation parameters

    Returns:
        Estimated credits or None if cannot be determined
    """
    from pixsim7.backend.main.domain.providers.registry import registry

    try:
        provider = registry.get(provider_id)
        return provider.estimate_credits(operation_type, canonical_params)
    except KeyError:
        logger.warning(
            "provider_not_found_for_credit_estimation",
            extra={"provider_id": provider_id}
        )
        return None


async def check_sufficient_credits(
    db: AsyncSession,
    user_id: int,
    provider_id: str,
    required_credits: int,
) -> bool:
    """
    Check if user has access to an account with sufficient credits.

    This is a fail-fast check to reject generations that would fail
    due to insufficient credits. If credits are stale/unknown for all
    accounts, skip the fail-fast rejection and let the worker validate.

    Args:
        db: Database session
        user_id: User ID
        provider_id: Provider identifier
        required_credits: Minimum credits required

    Returns:
        True if an account with sufficient credits exists, or credits are
        stale/unknown for all accounts.
    """
    from pixsim7.backend.main.services.account import AccountService

    account_service = AccountService(db)
    try:
        # Try to select an account with sufficient credits
        await account_service.select_account(
            provider_id=provider_id,
            user_id=user_id,
            required_credits=required_credits,
        )
        return True
    except NoAccountAvailableError:
        # If we have no accounts at all, this is a real failure.
        accounts = await account_service.list_accounts(
            provider_id=provider_id,
            user_id=user_id,
            include_shared=True,
        )
        if not accounts:
            return False

        # If credits haven't been synced recently for any account,
        # skip fail-fast so the worker can refresh and decide.
        from datetime import datetime, timezone, timedelta

        stale_cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
        has_recent_sync = False

        for account in accounts:
            metadata = account.provider_metadata or {}
            synced_at_raw = metadata.get("credits_synced_at")
            if not synced_at_raw:
                continue
            try:
                synced_at = datetime.fromisoformat(str(synced_at_raw).replace("Z", "+00:00"))
            except ValueError:
                continue
            if synced_at >= stale_cutoff:
                has_recent_sync = True
                break

        if not has_recent_sync:
            logger.info(
                "credits_unverified_skip_fail_fast",
                extra={
                    "user_id": user_id,
                    "provider_id": provider_id,
                    "required_credits": required_credits,
                },
            )
            return True

        return False
