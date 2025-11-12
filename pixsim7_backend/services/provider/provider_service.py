"""
ProviderService - orchestrate provider API calls

Clean service for provider interaction and submission tracking
"""
from typing import Dict, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7_backend.domain import (
    Job,
    ProviderSubmission,
    ProviderAccount,
    VideoStatus,
)
from pixsim7_backend.services.provider.registry import registry
from pixsim7_backend.services.provider.base import (
    GenerationResult,
    VideoStatusResult,
    ProviderError,
)
from pixsim7_backend.shared.errors import ProviderNotFoundError, ResourceNotFoundError
from pixsim7_backend.infrastructure.events.bus import event_bus, PROVIDER_SUBMITTED, PROVIDER_COMPLETED, PROVIDER_FAILED


class ProviderService:
    """
    Provider orchestration service

    Handles:
    - Executing provider operations
    - Recording provider submissions
    - Status polling
    - Error handling and retry logic
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    # ===== PROVIDER EXECUTION =====

    async def execute_job(
        self,
        job: Job,
        account: ProviderAccount,
        params: Dict[str, Any]
    ) -> ProviderSubmission:
        """
        Execute job via provider

        Args:
            job: Job to execute
            account: Provider account to use
            params: Generation parameters

        Returns:
            ProviderSubmission record

        Raises:
            ProviderNotFoundError: Provider not registered
            ProviderError: Provider API error
        """
        # Get provider from registry
        provider = registry.get(job.provider_id)

        # Map parameters to provider format
        mapped_params = provider.map_parameters(
            operation_type=job.operation_type,
            params=params
        )

        # Record submission start
        submission = ProviderSubmission(
            job_id=job.id,
            account_id=account.id,  # Track which account is used
            provider_id=job.provider_id,
            payload=mapped_params,
            response={},
            retry_attempt=job.retry_count,
            submitted_at=datetime.utcnow(),
            status="pending",
        )
        self.db.add(submission)
        await self.db.commit()
        await self.db.refresh(submission)

        try:
            # Execute provider operation
            result: GenerationResult = await provider.execute(
                operation_type=job.operation_type,
                account=account,
                params=mapped_params
            )

            # Update submission with response
            submission.response = {
                "provider_job_id": result.provider_job_id,
                "provider_video_id": result.provider_video_id,
                "status": result.status.value,
                "video_url": result.video_url,
                "thumbnail_url": result.thumbnail_url,
                "metadata": result.metadata or {},
            }
            submission.provider_job_id = result.provider_job_id
            submission.responded_at = datetime.utcnow()
            submission.status = "success"

            # Calculate duration
            submission.calculate_duration()

            await self.db.commit()
            await self.db.refresh(submission)

            # Emit success event
            await event_bus.publish(PROVIDER_SUBMITTED, {
                "job_id": job.id,
                "submission_id": submission.id,
                "provider_job_id": result.provider_job_id,
            })

            return submission

        except ProviderError as e:
            # Update submission with error
            submission.response = {
                "error": str(e),
                "error_type": e.__class__.__name__,
            }
            submission.responded_at = datetime.utcnow()
            submission.status = "error"
            submission.calculate_duration()

            await self.db.commit()
            await self.db.refresh(submission)

            # Emit failure event
            await event_bus.publish(PROVIDER_FAILED, {
                "job_id": job.id,
                "submission_id": submission.id,
                "error": str(e),
            })

            # Re-raise for caller to handle
            raise

    async def check_status(
        self,
        submission: ProviderSubmission,
        account: ProviderAccount
    ) -> VideoStatusResult:
        """
        Check job status on provider

        Args:
            submission: Provider submission to check
            account: Provider account to use

        Returns:
            VideoStatusResult with current status

        Raises:
            ProviderNotFoundError: Provider not registered
            ProviderError: Provider API error
        """
        # Get provider from registry
        provider = registry.get(submission.provider_id)

        # Check status via provider
        status_result = await provider.check_status(
            account=account,
            provider_job_id=submission.provider_job_id
        )

        # Update submission response with latest status
        if submission.response is None:
            submission.response = {}

        submission.response.update({
            "status": status_result.status.value,
            "video_url": status_result.video_url,
            "thumbnail_url": status_result.thumbnail_url,
            "progress": status_result.progress,
            "width": status_result.width,
            "height": status_result.height,
            "duration_sec": status_result.duration_sec,
            "provider_video_id": status_result.provider_video_id,
        })

        await self.db.commit()
        await self.db.refresh(submission)

        # Emit event if completed
        if status_result.status == VideoStatus.COMPLETED:
            # Update account's EMA with actual generation time
            if submission.duration_ms:
                actual_time_sec = submission.duration_ms / 1000.0
                account.update_ema_generation_time(actual_time_sec)
                await self.db.commit()
            
            await event_bus.publish(PROVIDER_COMPLETED, {
                "submission_id": submission.id,
                "job_id": submission.job_id,
                "video_url": status_result.video_url,
            })
        elif status_result.status == VideoStatus.FAILED:
            await event_bus.publish(PROVIDER_FAILED, {
                "submission_id": submission.id,
                "job_id": submission.job_id,
                "error": status_result.error_message or "Unknown error",
            })

        return status_result

    async def cancel_job(
        self,
        submission: ProviderSubmission,
        account: ProviderAccount
    ) -> bool:
        """
        Cancel job on provider (if supported)

        Args:
            submission: Provider submission
            account: Provider account

        Returns:
            True if cancelled, False if not supported
        """
        # Get provider from registry
        provider = registry.get(submission.provider_id)

        # Attempt to cancel
        try:
            cancelled = await provider.cancel(
                account=account,
                provider_job_id=submission.provider_job_id
            )

            if cancelled:
                submission.response["status"] = "cancelled"
                await self.db.commit()

            return cancelled
        except Exception as e:
            # Cancellation not supported or failed
            return False

    # ===== SUBMISSION RETRIEVAL =====

    async def get_submission(self, submission_id: int) -> ProviderSubmission:
        """Get submission by ID"""
        submission = await self.db.get(ProviderSubmission, submission_id)
        if not submission:
            raise ResourceNotFoundError("ProviderSubmission", submission_id)
        return submission

    async def get_job_submissions(self, job_id: int) -> list[ProviderSubmission]:
        """
        Get all submissions for a job (including retries)

        Args:
            job_id: Job ID

        Returns:
            List of submissions ordered by attempt
        """
        from sqlalchemy import select

        result = await self.db.execute(
            select(ProviderSubmission)
            .where(ProviderSubmission.job_id == job_id)
            .order_by(ProviderSubmission.retry_attempt.asc())
        )
        return list(result.scalars().all())

    async def get_latest_submission(self, job_id: int) -> ProviderSubmission | None:
        """
        Get latest submission for a job

        Args:
            job_id: Job ID

        Returns:
            Latest submission or None
        """
        from sqlalchemy import select

        result = await self.db.execute(
            select(ProviderSubmission)
            .where(ProviderSubmission.job_id == job_id)
            .order_by(ProviderSubmission.retry_attempt.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
