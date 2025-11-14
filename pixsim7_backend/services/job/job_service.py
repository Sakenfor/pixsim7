"""
JobService - job creation and lifecycle management

Clean service for job orchestration
"""
import logging
from typing import Optional, Dict, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7_backend.domain import (
    Job,
    JobStatus,
    OperationType,
    User,
    ProviderSubmission,
)
from pixsim7_backend.shared.errors import (
    ResourceNotFoundError,
    InvalidOperationError,
    QuotaError,
)
from pixsim7_backend.infrastructure.events.bus import event_bus, JOB_CREATED, JOB_STARTED, JOB_COMPLETED, JOB_FAILED, JOB_CANCELLED
from pixsim7_backend.services.user.user_service import UserService

logger = logging.getLogger(__name__)


class JobService:
    """
    Job management service

    Handles:
    - Job creation with quota checks
    - Job status tracking
    - Job lifecycle management
    """

    def __init__(
        self,
        db: AsyncSession,
        user_service: UserService
    ):
        self.db = db
        self.users = user_service

    # ===== JOB CREATION =====

    async def create_job(
        self,
        user: User,
        operation_type: OperationType,
        provider_id: str,
        params: Dict[str, Any],
        workspace_id: Optional[int] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        priority: int = 5,
        scheduled_at: Optional[datetime] = None,
        parent_job_id: Optional[int] = None
    ) -> Job:
        """
        Create new job

        Args:
            user: User creating the job
            operation_type: Operation type
            provider_id: Target provider
            params: Generation parameters (stored in Job and duplicated in ProviderSubmission)
            workspace_id: Optional workspace
            name: Optional job name
            description: Optional description
            priority: Job priority (0=highest, 10=lowest)
            scheduled_at: Optional schedule time
            parent_job_id: Optional parent job (for dependencies)

        Returns:
            Created job

        Raises:
            QuotaError: User exceeded quotas
            InvalidOperationError: Invalid operation or parameters
        """
        # Check user quota
        await self.users.check_can_create_job(user)

        # Validate provider exists and supports operation
        from pixsim7_backend.services.provider.registry import registry
        from pixsim7_backend.shared.errors import ProviderNotFoundError
        
        try:
            provider = registry.get(provider_id)
        except Exception:
            raise InvalidOperationError(f"Provider '{provider_id}' not found or not registered")
        
        # Check if provider supports the operation
        if operation_type not in provider.supported_operations:
            raise InvalidOperationError(
                f"Provider '{provider_id}' does not support operation '{operation_type.value}'. "
                f"Supported operations: {[op.value for op in provider.supported_operations]}"
            )
        
        # Validate parameters (basic validation)
        if not params:
            raise InvalidOperationError("Generation parameters are required")
        
        # Operation-specific validation
        if operation_type == OperationType.TEXT_TO_VIDEO:
            if 'prompt' not in params:
                raise InvalidOperationError("'prompt' is required for text_to_video")
        elif operation_type == OperationType.IMAGE_TO_VIDEO:
            if 'prompt' not in params or 'image_url' not in params:
                raise InvalidOperationError("'prompt' and 'image_url' are required for image_to_video")
        elif operation_type == OperationType.VIDEO_EXTEND:
            if 'video_url' not in params:
                raise InvalidOperationError("'video_url' is required for video_extend")

        # Create job
        job = Job(
            user_id=user.id,
            operation_type=operation_type,
            provider_id=provider_id,
            params=params,  # Store params in Job for worker access
            workspace_id=workspace_id,
            name=name,
            description=description,
            priority=priority,
            scheduled_at=scheduled_at,
            parent_job_id=parent_job_id,
            status=JobStatus.PENDING,
            created_at=datetime.utcnow(),
        )

        self.db.add(job)
        await self.db.commit()
        await self.db.refresh(job)

        # Increment user's job count
        await self.users.increment_job_count(user)

        # Emit event for orchestration
        await event_bus.publish(JOB_CREATED, {
            "job_id": job.id,
            "user_id": user.id,
            "operation_type": operation_type.value,
            "provider_id": provider_id,
            "params": params,  # Parameters for ProviderSubmission
            "priority": priority,
        })

        # Queue job for processing via ARQ
        try:
            from pixsim7_backend.infrastructure.redis import get_arq_pool
            arq_pool = await get_arq_pool()
            await arq_pool.enqueue_job(
                "process_job",
                job_id=job.id,
                _queue_name="default",
            )
            logger.info(f"Job {job.id} queued for processing")
        except Exception as e:
            logger.error(f"Failed to queue job {job.id}: {e}")
            # Don't fail job creation if ARQ is down
            # Worker can pick it up later via scheduled polling

        return job

    # ===== JOB STATUS MANAGEMENT =====

    async def update_status(
        self,
        job_id: int,
        status: JobStatus,
        error_message: Optional[str] = None
    ) -> Job:
        """
        Update job status

        Args:
            job_id: Job ID
            status: New status
            error_message: Optional error message (for failed jobs)

        Returns:
            Updated job

        Raises:
            ResourceNotFoundError: Job not found
        """
        job = await self.get_job(job_id)

        # Update status
        old_status = job.status
        job.status = status

        # Update timestamps
        if status == JobStatus.PROCESSING and not job.started_at:
            job.started_at = datetime.utcnow()
        elif status in {JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED}:
            job.completed_at = datetime.utcnow()

        # Update error message
        if error_message:
            job.error_message = error_message

        await self.db.commit()
        await self.db.refresh(job)

        # Emit status change events (include user_id for WebSocket filtering)
        if status == JobStatus.PROCESSING:
            await event_bus.publish(JOB_STARTED, {"job_id": job_id, "user_id": job.user_id, "status": status.value})
        elif status == JobStatus.COMPLETED:
            await event_bus.publish(JOB_COMPLETED, {"job_id": job_id, "user_id": job.user_id, "status": status.value})
        elif status == JobStatus.FAILED:
            await event_bus.publish(JOB_FAILED, {"job_id": job_id, "user_id": job.user_id, "status": status.value, "error": error_message})
        elif status == JobStatus.CANCELLED:
            await event_bus.publish(JOB_CANCELLED, {"job_id": job_id, "user_id": job.user_id, "status": status.value})

        return job

    async def mark_started(self, job_id: int) -> Job:
        """Mark job as started"""
        return await self.update_status(job_id, JobStatus.PROCESSING)

    async def mark_completed(self, job_id: int, asset_id: int) -> Job:
        """
        Mark job as completed

        Args:
            job_id: Job ID
            asset_id: Generated asset ID

        Returns:
            Updated job
        """
        job = await self.get_job(job_id)
        job.asset_id = asset_id
        await self.db.commit()
        await self.db.refresh(job)

        return await self.update_status(job_id, JobStatus.COMPLETED)

    async def mark_failed(self, job_id: int, error_message: str) -> Job:
        """Mark job as failed"""
        return await self.update_status(job_id, JobStatus.FAILED, error_message)

    async def cancel_job(self, job_id: int, user: User) -> Job:
        """
        Cancel job (user request)

        Args:
            job_id: Job ID
            user: User requesting cancellation

        Returns:
            Cancelled job

        Raises:
            ResourceNotFoundError: Job not found
            InvalidOperationError: Cannot cancel (wrong user or completed)
        """
        job = await self.get_job(job_id)

        # Check authorization
        if job.user_id != user.id and not user.is_admin():
            raise InvalidOperationError("Cannot cancel other users' jobs")

        # Check if can be cancelled
        if job.is_terminal:
            raise InvalidOperationError(f"Job already {job.status.value}")

        # Cancel on provider if processing
        if job.status == JobStatus.PROCESSING:
            try:
                from pixsim7_backend.services.provider import ProviderService
                from pixsim7_backend.domain import ProviderAccount
                from sqlalchemy import select
                
                provider_service = ProviderService(self.db)
                
                # Get latest submission
                result = await self.db.execute(
                    select(ProviderSubmission)
                    .where(ProviderSubmission.job_id == job.id)
                    .order_by(ProviderSubmission.created_at.desc())
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
                            logger.info(f"Job {job_id} cancelled on provider")
                        
                        # Decrement account's concurrent job count
                        if account.current_processing_jobs > 0:
                            account.current_processing_jobs -= 1
                            await self.db.commit()
            except Exception as e:
                logger.error(f"Failed to cancel job on provider: {e}")
                # Continue with local cancellation even if provider cancel fails

        return await self.update_status(job_id, JobStatus.CANCELLED)

    # ===== JOB RETRIEVAL =====

    async def get_job(self, job_id: int) -> Job:
        """
        Get job by ID

        Args:
            job_id: Job ID

        Returns:
            Job

        Raises:
            ResourceNotFoundError: Job not found
        """
        job = await self.db.get(Job, job_id)
        if not job:
            raise ResourceNotFoundError("Job", job_id)
        return job

    async def get_job_for_user(self, job_id: int, user: User) -> Job:
        """
        Get job with authorization check

        Args:
            job_id: Job ID
            user: Current user

        Returns:
            Job

        Raises:
            ResourceNotFoundError: Job not found
            InvalidOperationError: Not authorized
        """
        job = await self.get_job(job_id)

        # Authorization check
        if job.user_id != user.id and not user.is_admin():
            raise InvalidOperationError("Cannot access other users' jobs")

        return job

    async def list_jobs(
        self,
        user: User,
        workspace_id: Optional[int] = None,
        status: Optional[JobStatus] = None,
        operation_type: Optional[OperationType] = None,
        limit: int = 50,
        offset: int = 0
    ) -> list[Job]:
        """
        List jobs for user

        Args:
            user: User (or admin)
            workspace_id: Filter by workspace
            status: Filter by status
            operation_type: Filter by operation type
            limit: Max results
            offset: Pagination offset

        Returns:
            List of jobs
        """
        query = select(Job)

        # Filter by user (unless admin)
        if not user.is_admin():
            query = query.where(Job.user_id == user.id)

        # Apply filters
        if workspace_id:
            query = query.where(Job.workspace_id == workspace_id)
        if status:
            query = query.where(Job.status == status)
        if operation_type:
            query = query.where(Job.operation_type == operation_type)

        # Order by priority and creation time
        query = query.order_by(
            Job.priority.asc(),  # Lower priority number = higher priority
            Job.created_at.desc()
        )

        # Pagination
        query = query.limit(limit).offset(offset)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_pending_jobs(
        self,
        provider_id: Optional[str] = None,
        limit: int = 10
    ) -> list[Job]:
        """
        Get pending jobs for processing

        Args:
            provider_id: Filter by provider
            limit: Max results

        Returns:
            List of pending jobs (sorted by priority)
        """
        query = select(Job).where(Job.status == JobStatus.PENDING)

        if provider_id:
            query = query.where(Job.provider_id == provider_id)

        # Check if scheduled time has passed
        now = datetime.utcnow()
        query = query.where(
            (Job.scheduled_at == None) |
            (Job.scheduled_at <= now)
        )

        # Order by priority (lowest number first)
        query = query.order_by(
            Job.priority.asc(),
            Job.created_at.asc()
        ).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    # ===== RETRY LOGIC =====

    async def increment_retry(self, job_id: int) -> Job:
        """
        Increment retry count

        Args:
            job_id: Job ID

        Returns:
            Updated job
        """
        job = await self.get_job(job_id)
        job.retry_count += 1
        await self.db.commit()
        await self.db.refresh(job)
        return job
