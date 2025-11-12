"""
Job processor worker - executes pending jobs

Listens for "job:created" events and processes jobs:
1. Select provider account
2. Submit job to provider
3. Update job status
"""
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from pixsim7_backend.domain import Job, ProviderAccount
from pixsim7_backend.services.job import JobService
from pixsim7_backend.services.account import AccountService
from pixsim7_backend.services.provider import ProviderService
from pixsim7_backend.services.user import UserService
from pixsim7_backend.infrastructure.database.session import get_db
from pixsim7_backend.shared.errors import (
    NoAccountAvailableError,
    AccountCooldownError,
    ProviderError,
)

logger = logging.getLogger(__name__)


async def process_job(job_id: int) -> dict:
    """
    Process a single job

    This is the main ARQ task that gets queued when a job is created.

    Args:
        job_id: ID of the job to process

    Returns:
        dict with status and message
    """
    logger.info(f"Processing job {job_id}")

    async for db in get_db():
        try:
            # Initialize services
            user_service = UserService(db)
            job_service = JobService(db, user_service)
            account_service = AccountService(db)
            provider_service = ProviderService(db)

            # Get job
            job = await job_service.get_job(job_id)

            if job.status != "pending":
                logger.warning(f"Job {job_id} is not pending (status: {job.status})")
                return {"status": "skipped", "reason": f"Job status is {job.status}"}

            # Check if scheduled for later
            from datetime import datetime
            if job.scheduled_at and job.scheduled_at > datetime.utcnow():
                logger.info(f"Job {job_id} scheduled for later: {job.scheduled_at}")
                return {"status": "scheduled", "scheduled_for": str(job.scheduled_at)}

            # Select account
            try:
                account = await account_service.select_account(
                    provider_id=job.provider_id,
                    user_id=job.user_id
                )
                logger.info(f"Selected account {account.id} for job {job_id}")
            except (NoAccountAvailableError, AccountCooldownError) as e:
                logger.warning(f"No account available for job {job_id}: {e}")
                # Requeue job for later (ARQ will retry)
                raise

            # Mark job as started
            await job_service.mark_started(job_id)
            logger.info(f"Job {job_id} marked as started")

            # Execute job via provider
            try:
                submission = await provider_service.execute_job(
                    job=job,
                    account=account,
                    params=job.params
                )
                
                # Increment account's concurrent job count
                account.current_processing_jobs += 1
                await db.commit()
                
                logger.info(
                    f"Job {job_id} submitted to provider. "
                    f"Provider job ID: {submission.provider_job_id}"
                )

                return {
                    "status": "submitted",
                    "provider_job_id": submission.provider_job_id
                }

            except ProviderError as e:
                logger.error(f"Provider error for job {job_id}: {e}")
                await job_service.mark_failed(job_id, str(e))
                raise

        except Exception as e:
            logger.error(f"Error processing job {job_id}: {e}", exc_info=True)

            # Try to mark job as failed
            try:
                await job_service.mark_failed(job_id, str(e))
            except Exception as mark_error:
                logger.error(f"Failed to mark job as failed: {mark_error}")

            raise

        finally:
            # Close DB session
            await db.close()


async def on_startup(ctx: dict) -> None:
    """ARQ worker startup"""
    logger.info("Job processor worker started")


async def on_shutdown(ctx: dict) -> None:
    """ARQ worker shutdown"""
    logger.info("Job processor worker shutting down")


# ARQ task configuration
class WorkerSettings:
    """ARQ worker settings for job processor"""
    functions = [process_job]
    on_startup = on_startup
    on_shutdown = on_shutdown
    redis_settings = "redis://localhost:6379/0"  # Will be overridden by env
