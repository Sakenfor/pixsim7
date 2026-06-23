"""
Credit estimation and sufficiency checks.

Handles estimating generation costs and verifying that users have
sufficient credits before creating a generation.
"""
import logging
from typing import Optional, Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain import OperationType, AccountStatus
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
    operation_type: Optional[OperationType] = None,
    model: Optional[str] = None,
) -> bool:
    """
    Check whether a generation should be allowed to enter the queue.

    This is a fail-fast guard whose only job is to reject requests the
    account pool can *never* serve. A credit shortage on otherwise-usable
    accounts is transient — credits refill via daily reset, top-up, the next
    sync, or an in-flight job completing — and the worker already defers such
    jobs onto the retry queue at dispatch time. So we only reject when there
    is no recoverable (ACTIVE/EXHAUSTED) account at all; everything else is
    allowed to queue into PENDING and ride out the dip.

    Args:
        db: Database session
        user_id: User ID
        provider_id: Provider identifier
        required_credits: Minimum credits required
        operation_type: Optional operation type for routing-aware checks
        model: Optional model for routing-aware checks

    Returns:
        True if the request should be allowed to queue (an account can
        currently afford it, or a recoverable account exists that the worker
        can wait on). False only when the pool is genuinely hopeless.
    """
    from pixsim7.backend.main.services.account import AccountService

    account_service = AccountService(db)
    try:
        # Fail-fast probe: we only want to reject on TRUE credit insufficiency.
        # Concurrency, cooldown, and daily-limit are transient — the worker
        # already handles ``NoAccountAvailableError`` at dispatch time by
        # deferring the generation to the retry queue. If we filter them here,
        # a user with plenty of credits but a busy account sees a misleading
        # "insufficient credits" 500 instead of the generation landing in
        # PENDING and queueing behind their in-flight jobs.
        await account_service.select_account(
            provider_id=provider_id,
            user_id=user_id,
            required_credits=required_credits,
            operation_type=operation_type.value if hasattr(operation_type, "value") else operation_type,
            model=model,
            ignore_availability=True,
        )
        return True
    except NoAccountAvailableError:
        # The structural probe found no account that can *currently* afford the
        # operation. Credit shortage is transient, though: daily resets,
        # top-ups, the next credit sync, or an in-flight job completing all
        # replenish the pool. The worker already defers ``AccountExhaustedError``
        # / ``NoAccountAvailableError`` back onto the retry queue at dispatch
        # time (see job_processor), so a momentary dip should let the generation
        # queue into PENDING and ride it out — exactly as a concurrency-full
        # account already does (that's why this probe passes
        # ``ignore_availability=True``) — rather than hard-failing the request
        # with a 500. Without this, when the only credit-affording account
        # briefly dips below the threshold between a deduction and the next
        # sync, a *new* creation 500s while an already-queued job would have
        # simply waited.
        #
        # Only reject when the pool is genuinely hopeless: no recoverable
        # account exists at all. ACTIVE accounts (busy/cooldown today, free
        # tomorrow) and EXHAUSTED accounts (out of credits now, refilled on the
        # next reset/sync) are both things the worker can ride out; DISABLED /
        # ERROR / RATE_LIMITED accounts are not, so they don't count toward
        # "the queue can eventually serve this".
        accounts = await account_service.list_accounts(
            provider_id=provider_id,
            user_id=user_id,
            include_shared=True,
        )
        recoverable = [
            a for a in accounts
            if a.status in (AccountStatus.ACTIVE, AccountStatus.EXHAUSTED)
        ]
        if not recoverable:
            return False

        logger.info(
            "credits_insufficient_defer_to_worker",
            extra={
                "user_id": user_id,
                "provider_id": provider_id,
                "required_credits": required_credits,
                "recoverable_accounts": len(recoverable),
            },
        )
        return True
