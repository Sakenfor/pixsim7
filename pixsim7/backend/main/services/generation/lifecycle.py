"""
GenerationLifecycleService - Generation status transitions and lifecycle management

Handles all generation status updates and lifecycle transitions.
"""
import logging
from typing import Optional
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from pixsim7.backend.main.domain import (
    Generation,
    GenerationStatus,
    User,
    ProviderSubmission,
    ProviderAccount,
)
from pixsim7.backend.main.shared.errors import (
    ResourceNotFoundError,
    InvalidOperationError,
)
from pixsim7.backend.main.infrastructure.events.bus import event_bus
from pixsim7.backend.main.services.generation.events import (
    JOB_STARTED,
    JOB_COMPLETED,
    JOB_FAILED,
    JOB_CANCELLED,
    JOB_PAUSED,
    JOB_RESUMED,
)
from pixsim7.backend.main.services.generation.telemetry import GenerationTelemetryService

logger = logging.getLogger(__name__)


class GenerationLifecycleService:
    """
    Generation lifecycle management service

    Handles:
    - Status transitions with event publishing
    - Generation start/complete/fail/cancel operations
    - Provider cancellation integration
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.telemetry = GenerationTelemetryService()

    async def update_status(
        self,
        generation_id: int,
        status: GenerationStatus,
        error_message: Optional[str] = None,
        error_code: Optional[str] = None,
    ) -> Generation:
        """
        Update generation status

        Args:
            generation_id: Generation ID
            status: New status
            error_message: Optional error message (for failed generations)
            error_code: Optional structured error code from GenerationErrorCode

        Returns:
            Updated generation

        Raises:
            ResourceNotFoundError: Generation not found
        """
        generation = await self._get_generation_for_update(generation_id)

        # Guard: prevent overwriting a terminal state with a different terminal state.
        # This stops the poller from writing COMPLETED/FAILED over CANCELLED (or vice versa).
        if generation.is_terminal and status != generation.status:
            if status in {GenerationStatus.COMPLETED, GenerationStatus.FAILED, GenerationStatus.CANCELLED}:
                logger.warning(
                    "update_status_skipped_terminal",
                    generation_id=generation_id,
                    current_status=generation.status.value,
                    requested_status=status.value,
                )
                return generation

        if generation.status == status:
            # If another worker already transitioned to PROCESSING, this is a
            # duplicate pickup — abort so the caller doesn't double-submit.
            if status == GenerationStatus.PROCESSING:
                raise InvalidOperationError(
                    f"Generation {generation_id} is already PROCESSING "
                    f"(likely picked up by another worker)"
                )
            if error_message and error_message != generation.error_message:
                generation.error_message = error_message
                if error_code:
                    generation.error_code = error_code
                generation.updated_at = datetime.now(timezone.utc)
                await self.db.commit()
                await self.db.refresh(generation)
            return generation

        # Update status
        generation.status = status
        now = datetime.now(timezone.utc)
        generation.updated_at = now

        # Update timestamps
        if status == GenerationStatus.PROCESSING:
            generation.attempt_id = (generation.attempt_id or 0) + 1
            generation.started_at = now
            generation.completed_at = None
        elif status in {GenerationStatus.COMPLETED, GenerationStatus.FAILED, GenerationStatus.CANCELLED}:
            generation.completed_at = now

        # Update error message and code
        if error_message:
            generation.error_message = error_message
        elif status == GenerationStatus.COMPLETED:
            # Clear error_message on success (may have leftover from retry attempts)
            generation.error_message = None

        if error_code:
            generation.error_code = error_code
        elif status == GenerationStatus.COMPLETED:
            generation.error_code = None

        await self.db.commit()
        await self.db.refresh(generation)

        # Emit status change event (include user_id for WebSocket filtering)
        _STATUS_EVENT_MAP = {
            GenerationStatus.PROCESSING: JOB_STARTED,
            GenerationStatus.COMPLETED: JOB_COMPLETED,
            GenerationStatus.FAILED: JOB_FAILED,
            GenerationStatus.CANCELLED: JOB_CANCELLED,
            GenerationStatus.PAUSED: JOB_PAUSED,
        }
        event_type = _STATUS_EVENT_MAP.get(status)
        if event_type:
            payload = {
                "job_id": generation_id,
                "generation_id": generation_id,
                "user_id": generation.user_id,
                "status": status.value,
            }
            if status == GenerationStatus.FAILED:
                payload["error"] = error_message
                payload["error_code"] = error_code
            logger.info(f"[Lifecycle] Publishing {event_type} for generation {generation_id}")
            await event_bus.publish(event_type, payload)

        # === PHASE 7: Record telemetry for terminal states ===
        if generation.is_terminal:
            # TODO: Extract cost data from provider submission if available
            cost_data = None  # Can be populated from provider response
            await self.telemetry.record_generation_metrics(generation, cost_data)

            # Record provider error if failed
            if status == GenerationStatus.FAILED and error_message:
                await self.telemetry.record_provider_error(
                    provider_id=generation.provider_id,
                    error_type="generation_failed",
                    error_message=error_message
                )

        return generation

    async def mark_started(self, generation_id: int) -> Generation:
        """Mark generation as started"""
        return await self.update_status(generation_id, GenerationStatus.PROCESSING)

    async def mark_completed(self, generation_id: int, asset_id: int) -> Generation:
        """
        Mark generation as completed

        Args:
            generation_id: Generation ID
            asset_id: Generated asset ID

        Returns:
            Updated generation
        """
        generation = await self._get_generation(generation_id)
        generation.asset_id = asset_id
        generation.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(generation)

        # Increment prompt version metrics if applicable
        if generation.prompt_version_id:
            await self._increment_prompt_metrics(generation.prompt_version_id)

        return await self.update_status(generation_id, GenerationStatus.COMPLETED)

    async def mark_failed(
        self,
        generation_id: int,
        error_message: str,
        error_code: Optional[str] = None,
    ) -> Generation:
        """Mark generation as failed"""
        return await self.update_status(
            generation_id, GenerationStatus.FAILED, error_message, error_code=error_code,
        )

    async def cancel_generation(self, generation_id: int, user: User) -> Generation:
        """
        Cancel generation (user request)

        Args:
            generation_id: Generation ID
            user: User requesting cancellation

        Returns:
            Cancelled generation

        Raises:
            ResourceNotFoundError: Generation not found
            InvalidOperationError: Cannot cancel (wrong user or completed)
        """
        generation = await self._get_generation(generation_id)
        self._check_ownership(generation, user, "cancel")

        # Check if can be cancelled
        if generation.is_terminal:
            raise InvalidOperationError(f"Generation already {generation.status.value}")

        # Cancel on provider if processing
        if generation.status == GenerationStatus.PROCESSING:
            try:
                from pixsim7.backend.main.services.provider import ProviderService

                provider_service = ProviderService(self.db)

                # Get latest submission
                result = await self.db.execute(
                    select(ProviderSubmission)
                    .where(ProviderSubmission.generation_id == generation.id)
                    .order_by(ProviderSubmission.submitted_at.desc())
                    .limit(1)
                )
                submission = result.scalar_one_or_none()

                if submission and submission.account_id:
                    # Get account
                    account = await self.db.get(ProviderAccount, submission.account_id)
                    if account:
                        # Try to cancel on provider
                        cancelled = await provider_service.cancel_job(submission, account)
                        if cancelled:
                            logger.info(f"Generation {generation_id} cancelled on provider")

                        # Decrement account's concurrent job count
                        if account.current_processing_jobs > 0:
                            account.current_processing_jobs -= 1
                            await self.db.commit()
            except Exception as e:
                logger.error(f"Failed to cancel generation on provider: {e}")
                # Continue with local cancellation even if provider cancel fails

        return await self.update_status(generation_id, GenerationStatus.CANCELLED)

    async def pause_generation(self, generation_id: int, user: User) -> Generation:
        """
        Pause a generation.

        - PENDING → immediately transitions to PAUSED.
        - PROCESSING → sets pause_requested flag; auto-retry will land in
          PAUSED instead of PENDING when the current attempt finishes.

        Args:
            generation_id: Generation ID
            user: User requesting pause

        Returns:
            Updated generation (PAUSED or PROCESSING with pause_requested)

        Raises:
            ResourceNotFoundError: Generation not found
            InvalidOperationError: Cannot pause (wrong user or already terminal)
        """
        generation = await self._get_generation(generation_id)
        self._check_ownership(generation, user, "pause")

        if generation.is_terminal:
            raise InvalidOperationError(f"Generation already {generation.status.value}")

        if generation.status == GenerationStatus.PAUSED:
            return generation  # idempotent

        if generation.status == GenerationStatus.PROCESSING:
            generation.pause_requested = True
            generation.updated_at = datetime.now(timezone.utc)
            await self.db.commit()
            await self.db.refresh(generation)
            logger.info(f"Generation {generation_id} flagged for pause after current attempt")
            return generation

        if generation.status != GenerationStatus.PENDING:
            raise InvalidOperationError(
                f"Cannot pause generation in status {generation.status.value}"
            )

        return await self.update_status(generation_id, GenerationStatus.PAUSED)

    async def resume_generation(self, generation_id: int, user: User) -> Generation:
        """
        Resume a paused generation — moves it back to PENDING and re-enqueues.

        Args:
            generation_id: Generation ID
            user: User requesting resume

        Returns:
            Resumed generation (status=pending)

        Raises:
            ResourceNotFoundError: Generation not found
            InvalidOperationError: Not paused or wrong user
        """
        generation = await self._get_generation(generation_id)
        self._check_ownership(generation, user, "resume")

        if generation.status != GenerationStatus.PAUSED:
            raise InvalidOperationError(
                f"Only paused generations can be resumed (current: {generation.status.value})"
            )

        generation.pause_requested = False
        generation = await self.update_status(generation_id, GenerationStatus.PENDING)

        # Publish resumed event for WebSocket
        await event_bus.publish(JOB_RESUMED, {
            "job_id": generation_id,
            "generation_id": generation_id,
            "user_id": generation.user_id,
            "status": generation.status.value,
        })

        # Re-enqueue for processing
        try:
            from pixsim7.backend.main.infrastructure.redis import get_arq_pool
            from pixsim7.backend.main.infrastructure.queue import enqueue_generation_fresh_job

            arq_pool = await get_arq_pool()
            await enqueue_generation_fresh_job(arq_pool, generation_id)
            logger.info(f"Generation {generation_id} resumed and re-enqueued")
        except Exception as e:
            logger.error(f"Failed to re-enqueue resumed generation {generation_id}: {e}")
            # Status is already PENDING — worker reconciliation will pick it up

        return generation

    async def delete_generation(self, generation_id: int, user: User) -> None:
        """
        Delete generation permanently

        Args:
            generation_id: Generation ID
            user: User requesting deletion

        Raises:
            ResourceNotFoundError: Generation not found
            InvalidOperationError: Cannot delete (wrong user or still active)
        """
        generation = await self._get_generation(generation_id)
        self._check_ownership(generation, user, "delete")

        # Only allow deleting terminal generations
        if not generation.is_terminal:
            raise InvalidOperationError(
                f"Cannot delete active generation (status: {generation.status.value}). Cancel it first."
            )

        # Delete associated submissions first
        await self.db.execute(
            delete(ProviderSubmission).where(ProviderSubmission.generation_id == generation_id)
        )

        # Delete the generation
        await self.db.delete(generation)
        await self.db.commit()

        logger.info(f"Generation {generation_id} deleted by user {user.id}")

    # ===== PRIVATE HELPERS =====

    def _check_ownership(self, generation: Generation, user: User, action: str) -> None:
        """Raise if user doesn't own the generation."""
        if generation.user_id != user.id and not user.is_admin():
            raise InvalidOperationError(f"Cannot {action} other users' generations")

    async def _get_generation(self, generation_id: int) -> Generation:
        """Get generation by ID or raise ResourceNotFoundError"""
        from pixsim7.backend.main.services.generation.helpers import get_generation_or_404
        return await get_generation_or_404(self.db, generation_id)

    async def _get_generation_for_update(self, generation_id: int) -> Generation:
        """Get generation by ID with a row lock for status transitions."""
        result = await self.db.execute(
            select(Generation)
            .where(Generation.id == generation_id)
            .with_for_update()
        )
        generation = result.scalar_one_or_none()
        if not generation:
            raise ResourceNotFoundError(f"Generation {generation_id} not found")
        return generation

    async def _increment_prompt_metrics(self, prompt_version_id) -> None:
        """Increment prompt version usage metrics"""
        from uuid import UUID
        from pixsim7.backend.main.domain.prompt import PromptVersion

        result = await self.db.execute(
            select(PromptVersion).where(PromptVersion.id == prompt_version_id)
        )
        prompt_version = result.scalar_one_or_none()

        if prompt_version:
            prompt_version.generation_count = (prompt_version.generation_count or 0) + 1
            await self.db.commit()
