"""
GenerationLifecycleService - Generation status transitions and lifecycle management

Handles all generation status updates and lifecycle transitions.
"""
import logging
from typing import Optional
from datetime import datetime
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
from pixsim7.backend.main.infrastructure.events.bus import (
    event_bus,
    JOB_STARTED,
    JOB_COMPLETED,
    JOB_FAILED,
    JOB_CANCELLED
)
from pixsim7.backend.main.services.generation.telemetry_service import GenerationTelemetryService

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
        error_message: Optional[str] = None
    ) -> Generation:
        """
        Update generation status

        Args:
            generation_id: Generation ID
            status: New status
            error_message: Optional error message (for failed generations)

        Returns:
            Updated generation

        Raises:
            ResourceNotFoundError: Generation not found
        """
        generation = await self._get_generation(generation_id)

        # Update status
        generation.status = status
        generation.updated_at = datetime.utcnow()

        # Update timestamps
        if status == GenerationStatus.PROCESSING and not generation.started_at:
            generation.started_at = datetime.utcnow()
        elif status in {GenerationStatus.COMPLETED, GenerationStatus.FAILED, GenerationStatus.CANCELLED}:
            generation.completed_at = datetime.utcnow()

        # Update error message
        if error_message:
            generation.error_message = error_message
        elif status == GenerationStatus.COMPLETED:
            # Clear error_message on success (may have leftover from retry attempts)
            generation.error_message = None

        await self.db.commit()
        await self.db.refresh(generation)

        # Emit status change events (include user_id for WebSocket filtering)
        if status == GenerationStatus.PROCESSING:
            await event_bus.publish(JOB_STARTED, {
                "job_id": generation_id,
                "generation_id": generation_id,
                "user_id": generation.user_id,
                "status": status.value
            })
        elif status == GenerationStatus.COMPLETED:
            await event_bus.publish(JOB_COMPLETED, {
                "job_id": generation_id,
                "generation_id": generation_id,
                "user_id": generation.user_id,
                "status": status.value
            })
        elif status == GenerationStatus.FAILED:
            await event_bus.publish(JOB_FAILED, {
                "job_id": generation_id,
                "generation_id": generation_id,
                "user_id": generation.user_id,
                "status": status.value,
                "error": error_message
            })
        elif status == GenerationStatus.CANCELLED:
            await event_bus.publish(JOB_CANCELLED, {
                "job_id": generation_id,
                "generation_id": generation_id,
                "user_id": generation.user_id,
                "status": status.value
            })

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
        generation.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(generation)

        # Increment prompt version metrics if applicable
        if generation.prompt_version_id:
            await self._increment_prompt_metrics(generation.prompt_version_id)

        return await self.update_status(generation_id, GenerationStatus.COMPLETED)

    async def mark_failed(self, generation_id: int, error_message: str) -> Generation:
        """Mark generation as failed"""
        return await self.update_status(generation_id, GenerationStatus.FAILED, error_message)

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

        # Check authorization
        if generation.user_id != user.id and not user.is_admin():
            raise InvalidOperationError("Cannot cancel other users' generations")

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

        # Check authorization
        if generation.user_id != user.id and not user.is_admin():
            raise InvalidOperationError("Cannot delete other users' generations")

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

    async def _get_generation(self, generation_id: int) -> Generation:
        """Get generation by ID or raise ResourceNotFoundError"""
        generation = await self.db.get(Generation, generation_id)
        if not generation:
            raise ResourceNotFoundError(f"Generation {generation_id} not found")
        return generation

    async def _increment_prompt_metrics(self, prompt_version_id) -> None:
        """Increment prompt version usage metrics"""
        from uuid import UUID
        from pixsim7.backend.main.domain.prompt_versioning import PromptVersion

        result = await self.db.execute(
            select(PromptVersion).where(PromptVersion.id == prompt_version_id)
        )
        prompt_version = result.scalar_one_or_none()

        if prompt_version:
            prompt_version.generation_count = (prompt_version.generation_count or 0) + 1
            await self.db.commit()
