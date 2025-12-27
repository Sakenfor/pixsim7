"""
GenerationBillingService - Generation billing finalization

Handles credit deduction and billing state management for completed generations.
Provides idempotent billing finalization to prevent double-charging.
"""
from typing import Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim_logging import configure_logging

from pixsim7.backend.main.domain import (
    Generation,
    GenerationStatus,
    BillingState,
    ProviderSubmission,
    ProviderAccount,
)
from pixsim7.backend.main.services.account import AccountService

logger = configure_logging("service.generation.billing")


class GenerationBillingService:
    """
    Generation billing service

    Handles:
    - Computing final credit cost on completion
    - Deducting credits from provider accounts
    - Idempotent billing finalization (safe to re-run)
    - Billing state tracking on Generation model
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.account_service = AccountService(db)

    async def finalize_billing(
        self,
        generation: Generation,
        final_submission: Optional[ProviderSubmission] = None,
        account: Optional[ProviderAccount] = None,
        actual_duration: Optional[float] = None,
    ) -> Generation:
        """
        Finalize billing for a generation that has reached a terminal state.

        This method is idempotent: if billing_state is already 'charged' or 'skipped',
        it will return early without making any changes.

        Args:
            generation: The generation to finalize billing for
            final_submission: Optional submission record (for account lookup)
            account: Optional account that was used (if known)
            actual_duration: Optional actual duration from provider (for videos)

        Returns:
            Updated generation with billing fields set

        Behavior:
            - COMPLETED: Compute actual_credits, deduct from account, set billing_state='charged'
            - FAILED/CANCELLED: Set billing_state='skipped', actual_credits=0
            - Already finalized: Return early (idempotent)
        """
        # Idempotency check: already finalized?
        if generation.billing_state in {BillingState.CHARGED, BillingState.SKIPPED}:
            logger.debug(
                "billing_already_finalized",
                generation_id=generation.id,
                billing_state=generation.billing_state.value,
            )
            return generation

        # Not in terminal state? Return early
        if generation.status not in {
            GenerationStatus.COMPLETED,
            GenerationStatus.FAILED,
            GenerationStatus.CANCELLED,
        }:
            logger.debug(
                "billing_not_ready",
                generation_id=generation.id,
                status=generation.status.value,
            )
            return generation

        # Determine account for all paths (needed for SKIPPED too)
        account_id = None
        if account:
            account_id = account.id
        elif final_submission:
            account_id = final_submission.account_id

        # Handle non-COMPLETED states (FAILED, CANCELLED)
        if generation.status != GenerationStatus.COMPLETED:
            generation.billing_state = BillingState.SKIPPED
            generation.actual_credits = 0
            generation.account_id = account_id  # Set even for skipped
            generation.charged_at = None
            generation.billing_error = None

            logger.info(
                "billing_skipped",
                generation_id=generation.id,
                account_id=account_id,
                status=generation.status.value,
            )

            await self.db.flush()
            return generation

        # === COMPLETED: Compute and charge credits ===

        # Load account if we only have the ID
        if account_id and not account:
            account = await self.db.get(ProviderAccount, account_id)

        if not account_id:
            logger.warning(
                "billing_no_account",
                generation_id=generation.id,
            )
            generation.billing_state = BillingState.FAILED
            generation.billing_error = "No account found for billing"
            await self.db.flush()
            return generation

        # Compute actual credits
        actual_credits = self._compute_actual_credits(
            generation=generation,
            actual_duration=actual_duration,
        )

        if actual_credits is None or actual_credits <= 0:
            # Can't determine credits or zero cost - skip billing
            generation.billing_state = BillingState.SKIPPED
            generation.actual_credits = 0
            generation.account_id = account_id
            generation.charged_at = None

            logger.info(
                "billing_zero_credits",
                generation_id=generation.id,
                actual_credits=actual_credits,
            )

            await self.db.flush()
            return generation

        # Determine credit type: use existing if set, otherwise derive from account's credits
        credit_type = generation.credit_type
        if not credit_type:
            # Derive credit type from account's available credits
            # Priority: 'web' > 'openapi' > any available
            credits = await self.account_service.get_credits(account_id)
            if 'web' in credits and credits['web'] > 0:
                credit_type = 'web'
            elif 'openapi' in credits and credits['openapi'] > 0:
                credit_type = 'openapi'
            elif credits:
                # Use first available credit type
                credit_type = next(iter(credits.keys()))
            else:
                # No credits available
                generation.billing_state = BillingState.FAILED
                generation.actual_credits = actual_credits
                generation.account_id = account_id
                generation.billing_error = "No credits available for billing"

                logger.warning(
                    "billing_no_credits_available",
                    generation_id=generation.id,
                    account_id=account_id,
                )

                await self.db.flush()
                return generation

        try:
            await self.account_service.deduct_credit(
                account_id=account_id,
                credit_type=credit_type,
                amount=actual_credits,
            )

            # Success - update generation
            generation.billing_state = BillingState.CHARGED
            generation.actual_credits = actual_credits
            generation.account_id = account_id
            generation.credit_type = credit_type
            generation.charged_at = datetime.utcnow()
            generation.billing_error = None

            logger.info(
                "billing_charged",
                generation_id=generation.id,
                account_id=account_id,
                credit_type=credit_type,
                actual_credits=actual_credits,
            )

        except Exception as e:
            # Deduction failed - mark as failed
            generation.billing_state = BillingState.FAILED
            generation.actual_credits = actual_credits  # Store what we tried to charge
            generation.account_id = account_id
            generation.billing_error = str(e)

            logger.error(
                "billing_deduction_failed",
                generation_id=generation.id,
                account_id=account_id,
                credit_type=credit_type,
                actual_credits=actual_credits,
                error=str(e),
            )

        await self.db.flush()
        return generation

    def _compute_actual_credits(
        self,
        generation: Generation,
        actual_duration: Optional[float] = None,
    ) -> Optional[int]:
        """
        Compute actual credits for a completed generation.

        Delegates to the provider adapter for provider-specific pricing logic.

        Note: This method handles provider-specific pricing logic (how many credits
        a generation costs based on quality, duration, etc.). The credit type
        (which credit pool to deduct from, e.g., 'web' vs 'openapi') is determined
        separately in finalize_billing() based on the account's available credits.

        Args:
            generation: The completed generation
            actual_duration: Actual duration from provider (for videos)

        Returns:
            Actual credit cost or None if cannot be determined
        """
        from pixsim7.backend.main.domain.providers.registry import registry

        try:
            provider = registry.get(generation.provider_id)
            return provider.compute_actual_credits(generation, actual_duration)
        except KeyError:
            logger.warning(
                "provider_not_found_for_billing",
                provider_id=generation.provider_id,
                generation_id=generation.id,
            )
            return None
