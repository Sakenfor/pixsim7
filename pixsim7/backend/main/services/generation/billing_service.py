"""
GenerationBillingService - Generation billing finalization

Handles credit deduction and billing state management for completed generations.
Provides idempotent billing finalization to prevent double-charging.
"""
import logging
from typing import Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain import (
    Generation,
    GenerationStatus,
    BillingState,
    OperationType,
    ProviderSubmission,
    ProviderAccount,
)
from pixsim7.backend.main.services.account import AccountService

logger = logging.getLogger(__name__)


# Operation type sets for pricing logic
IMAGE_OPERATIONS = {
    OperationType.TEXT_TO_IMAGE,
    OperationType.IMAGE_TO_IMAGE,
}

VIDEO_OPERATIONS = {
    OperationType.TEXT_TO_VIDEO,
    OperationType.IMAGE_TO_VIDEO,
    OperationType.VIDEO_EXTEND,
    OperationType.VIDEO_TRANSITION,
    OperationType.FUSION,
}


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

        Uses pixverse_pricing helpers with actual values from completion.

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
        # Provider-specific pricing: only Pixverse is currently implemented.
        # Other providers return None (no billing).
        if generation.provider_id != "pixverse":
            return None

        from pixsim7.backend.main.services.generation.pixverse_pricing import (
            get_image_credit_change,
            estimate_video_credit_change,
        )

        params = generation.canonical_params or generation.raw_params or {}
        model = params.get("model") or "v5"
        quality = params.get("quality") or "360p"

        # Image operations: static table lookup
        if generation.operation_type in IMAGE_OPERATIONS:
            return get_image_credit_change(str(model), str(quality))

        # Video operations: dynamic calculation with actual duration
        if generation.operation_type in VIDEO_OPERATIONS:
            # Prefer actual duration from provider, fall back to params
            duration = actual_duration
            if duration is None or duration <= 0:
                duration = params.get("duration")

            if not isinstance(duration, (int, float)) or duration <= 0:
                # Fall back to estimated credits if we have them
                return generation.estimated_credits

            motion_mode = params.get("motion_mode")
            multi_shot = bool(params.get("multi_shot"))
            audio = bool(params.get("audio"))

            return estimate_video_credit_change(
                quality=str(quality),
                duration=int(duration),
                model=str(model),
                motion_mode=motion_mode,
                multi_shot=multi_shot,
                audio=audio,
            )

        return None
