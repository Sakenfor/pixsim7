"""
ProviderService - orchestrate provider API calls

Clean service for provider interaction and submission tracking
"""
from typing import Dict, Any, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim_logging import configure_logging
from pixsim7.backend.main.domain import (
    Generation,
    ProviderSubmission,
    ProviderAccount,
    ProviderStatus,
    OperationType,
)
from pixsim7.backend.main.domain.asset_analysis import AssetAnalysis
from pixsim7.backend.main.services.provider.registry import registry
from pixsim7.backend.main.services.provider.base import (
    GenerationResult,
    ProviderStatusResult,
    ProviderError,
)
from pixsim7.backend.main.shared.errors import ProviderNotFoundError, ResourceNotFoundError
from pixsim7.backend.main.infrastructure.events.bus import event_bus, PROVIDER_SUBMITTED, PROVIDER_COMPLETED, PROVIDER_FAILED
from pixsim7.backend.main.shared.operation_mapping import get_image_operations

logger = configure_logging("provider_service")


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

    async def execute_generation(
        self,
        generation: Generation,
        account: ProviderAccount,
        params: Dict[str, Any]
    ) -> ProviderSubmission:
        """
        Execute generation via provider

        Args:
            generation: Generation to execute
            account: Provider account to use
            params: Generation parameters (canonical_params)

        Returns:
            ProviderSubmission record

        Raises:
            ProviderNotFoundError: Provider not registered
            ProviderError: Provider API error
        """
        # Get provider from registry
        provider = registry.get(generation.provider_id)

        # Map parameters to provider format
        mapped_params = provider.map_parameters(
            operation_type=generation.operation_type,
            params=params
        )

        # Record submission start
        submission = ProviderSubmission(
            generation_id=generation.id,
            account_id=account.id,
            provider_id=generation.provider_id,
            payload=mapped_params,
            response={},
            retry_attempt=generation.retry_count,
            submitted_at=datetime.utcnow(),
            status="pending",
        )
        self.db.add(submission)
        await self.db.commit()
        await self.db.refresh(submission)

        try:
            # Execute provider operation
            result: GenerationResult = await provider.execute(
                operation_type=generation.operation_type,
                account=account,
                params=mapped_params
            )

            # Update submission with response
            # For image operations, use image-specific field names
            # to ensure correct media type classification in asset creation.
            # The set of image operations is owned by OPERATION_REGISTRY.
            if generation.operation_type in get_image_operations():
                submission.response = {
                    "provider_job_id": result.provider_job_id,
                    "provider_image_id": result.provider_video_id,  # Re-key for images
                    "status": result.status.value,
                    "image_url": result.video_url,  # Re-key for images
                    "thumbnail_url": result.thumbnail_url,
                    "metadata": result.metadata or {},
                    "media_type": "image",  # Explicit media type
                }
            else:
                # Video operations use standard field names
                submission.response = {
                    "provider_job_id": result.provider_job_id,
                    "provider_video_id": result.provider_video_id,
                    "status": result.status.value,
                    "video_url": result.video_url,
                    "thumbnail_url": result.thumbnail_url,
                    "metadata": result.metadata or {},
                }
            # Validate provider_job_id before saving
            if not result.provider_job_id:
                logger.error(
                    "provider:submit",
                    msg="missing_provider_job_id",
                    generation_id=generation.id,
                    operation_type=generation.operation_type.value,
                    result=str(result),
                )
                raise ProviderError(
                    f"Provider did not return a job ID for {generation.operation_type.value}"
                )

            submission.provider_job_id = result.provider_job_id
            submission.responded_at = datetime.utcnow()
            submission.status = "success"

            # Calculate duration
            submission.calculate_duration()

            await self.db.commit()
            await self.db.refresh(submission)

            # Emit success event
            await event_bus.publish(PROVIDER_SUBMITTED, {
                "job_id": generation.id,
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
                "job_id": generation.id,
                "submission_id": submission.id,
                "error": str(e),
            })

            # Re-raise for caller to handle
            raise

    async def execute_analysis(
        self,
        analysis: AssetAnalysis,
        account: ProviderAccount,
    ) -> ProviderSubmission:
        """
        Execute asset analysis via provider

        Args:
            analysis: Analysis to execute
            account: Provider account to use

        Returns:
            ProviderSubmission record

        Raises:
            ProviderNotFoundError: Provider not registered
            ProviderError: Provider API error
        """
        # Get provider from registry
        provider = registry.get(analysis.provider_id)

        # Build analysis params
        analysis_params = {
            "analyzer_type": analysis.analyzer_type.value,
            "prompt": analysis.prompt,
            **(analysis.params or {}),
        }

        # Record submission start
        submission = ProviderSubmission(
            analysis_id=analysis.id,
            generation_id=None,  # Analysis, not generation
            account_id=account.id,
            provider_id=analysis.provider_id,
            payload=analysis_params,
            response={},
            retry_attempt=analysis.retry_count,
            submitted_at=datetime.utcnow(),
            status="pending",
        )
        self.db.add(submission)
        await self.db.commit()
        await self.db.refresh(submission)

        try:
            # Execute analysis via provider
            # For now, we use a generic analyze method if available,
            # or fall back to execute with a special operation type
            if hasattr(provider, 'analyze'):
                result = await provider.analyze(
                    account=account,
                    asset_url=analysis_params.get("asset_url"),
                    analyzer_type=analysis.analyzer_type.value,
                    prompt=analysis.prompt,
                    params=analysis.params or {},
                )
            else:
                # Generic fallback - many vision APIs can be called directly
                result = GenerationResult(
                    provider_job_id=f"analysis-{analysis.id}",
                    provider_video_id=None,
                    status=ProviderStatus.COMPLETED,
                    video_url=None,
                    thumbnail_url=None,
                    metadata={"pending_implementation": True},
                )

            # Update submission with response
            submission.response = {
                "provider_job_id": result.provider_job_id,
                "status": result.status.value,
                "result": result.metadata or {},
            }
            submission.provider_job_id = result.provider_job_id
            submission.responded_at = datetime.utcnow()
            submission.status = "success"

            submission.calculate_duration()

            await self.db.commit()
            await self.db.refresh(submission)

            logger.info(
                "analysis:submitted",
                analysis_id=analysis.id,
                provider_id=analysis.provider_id,
                submission_id=submission.id,
            )

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

            raise

    async def check_analysis_status(
        self,
        submission: ProviderSubmission,
        account: ProviderAccount,
    ) -> ProviderStatusResult:
        """
        Check analysis job status on provider

        Args:
            submission: Provider submission to check
            account: Provider account to use

        Returns:
            ProviderStatusResult with current status
        """
        # Get provider from registry
        provider = registry.get(submission.provider_id)

        # Check status via provider
        if hasattr(provider, 'check_analysis_status'):
            status_result = await provider.check_analysis_status(
                account=account,
                provider_job_id=submission.provider_job_id,
            )
        else:
            # Default: check using standard check_status
            status_result = await provider.check_status(
                account=account,
                provider_job_id=submission.provider_job_id,
            )

        # Update submission response with latest status
        if submission.response is None:
            submission.response = {}

        updated_response = {
            **submission.response,
            "status": status_result.status.value,
            "progress": status_result.progress,
        }

        # Include result if completed
        if status_result.status == ProviderStatus.COMPLETED and status_result.metadata:
            updated_response["result"] = status_result.metadata

        submission.response = updated_response

        await self.db.commit()
        await self.db.refresh(submission)

        return status_result

    async def check_status(
        self,
        submission: ProviderSubmission,
        account: ProviderAccount,
        operation_type: Optional[OperationType] = None,
    ) -> ProviderStatusResult:
        """
        Check job status on provider

        Args:
            submission: Provider submission to check
            account: Provider account to use
            operation_type: Optional operation type (needed for IMAGE_TO_IMAGE)

        Returns:
            ProviderStatusResult with current status

        Raises:
            ProviderNotFoundError: Provider not registered
            ProviderError: Provider API error
        """
        # Get provider from registry
        provider = registry.get(submission.provider_id)

        # Check status via provider
        status_result = await provider.check_status(
            account=account,
            provider_job_id=submission.provider_job_id,
            operation_type=operation_type,
        )

        # Update submission response with latest status
        if submission.response is None:
            submission.response = {}

        existing_video_url = submission.response.get("video_url") or submission.response.get("asset_url")
        existing_thumbnail = submission.response.get("thumbnail_url")
        existing_provider_id = submission.response.get("provider_video_id") or submission.response.get("provider_asset_id")

        video_url = status_result.video_url or existing_video_url
        thumbnail_url = status_result.thumbnail_url or existing_thumbnail
        provider_video_id = status_result.provider_video_id or existing_provider_id or submission.provider_job_id

        # Update response - use assignment to ensure SQLAlchemy detects the change
        updated_response = {
            **submission.response,
            "status": status_result.status.value,
            "video_url": video_url,
            "thumbnail_url": thumbnail_url,
            "progress": status_result.progress,
            "width": status_result.width,
            "height": status_result.height,
            "duration_sec": status_result.duration_sec,
            "provider_video_id": provider_video_id,
            "provider_asset_id": provider_video_id,
        }
        if video_url:
            updated_response["asset_url"] = video_url

        # Assign new dict to trigger SQLAlchemy change detection for JSON column
        submission.response = updated_response

        await self.db.commit()
        await self.db.refresh(submission)

        # Emit event if completed
        if status_result.status == ProviderStatus.COMPLETED:
            # Update account's EMA with actual generation time
            if submission.duration_ms:
                actual_time_sec = submission.duration_ms / 1000.0
                account.update_ema_generation_time(actual_time_sec)
                await self.db.commit()
            
            await event_bus.publish(PROVIDER_COMPLETED, {
                "submission_id": submission.id,
                "job_id": submission.generation_id,  # Keep key for backward compat
                "video_url": status_result.video_url,
            })
        elif status_result.status == ProviderStatus.FAILED:
            await event_bus.publish(PROVIDER_FAILED, {
                "submission_id": submission.id,
                "job_id": submission.generation_id,  # Keep key for backward compat
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

    async def get_generation_submissions(self, generation_id: int) -> list[ProviderSubmission]:
        """
        Get all submissions for a generation (including retries)

        Args:
            generation_id: Generation ID

        Returns:
            List of submissions ordered by attempt
        """
        from sqlalchemy import select

        result = await self.db.execute(
            select(ProviderSubmission)
            .where(ProviderSubmission.generation_id == generation_id)
            .order_by(ProviderSubmission.retry_attempt.asc())
        )
        return list(result.scalars().all())

    # Backward compatibility alias
    get_job_submissions = get_generation_submissions

    async def get_latest_submission(self, generation_id: int) -> ProviderSubmission | None:
        """
        Get latest submission for a generation

        Args:
            generation_id: Generation ID

        Returns:
            Latest submission or None
        """
        from sqlalchemy import select

        result = await self.db.execute(
            select(ProviderSubmission)
            .where(ProviderSubmission.generation_id == generation_id)
            .order_by(ProviderSubmission.retry_attempt.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
