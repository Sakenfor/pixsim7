"""
Status poller worker - checks job status on providers

Runs periodically to:
1. Find jobs in PROCESSING state
2. Check status with provider
3. Create assets when completed
4. Update job status
"""
import logging
from datetime import datetime, timedelta
from sqlalchemy import select
from pixsim7_backend.domain import Job, ProviderSubmission, ProviderAccount
from pixsim7_backend.domain.enums import JobStatus, VideoStatus
from pixsim7_backend.services.job import JobService
from pixsim7_backend.services.provider import ProviderService
from pixsim7_backend.services.asset import AssetService
from pixsim7_backend.services.user import UserService
from pixsim7_backend.infrastructure.database.session import get_db
from pixsim7_backend.shared.errors import ProviderError

logger = logging.getLogger(__name__)


async def poll_job_statuses() -> dict:
    """
    Poll status of all processing jobs

    This runs periodically (e.g., every 10 seconds) to check
    job status with providers and update accordingly.

    Returns:
        dict with poll statistics
    """
    logger.info("Polling job statuses")

    checked = 0
    completed = 0
    failed = 0
    still_processing = 0

    async for db in get_db():
        try:
            # Initialize services
            user_service = UserService(db)
            job_service = JobService(db, user_service)
            provider_service = ProviderService(db)
            asset_service = AssetService(db, user_service)

            # Get all PROCESSING jobs
            result = await db.execute(
                select(Job)
                .where(Job.status == JobStatus.PROCESSING)
                .order_by(Job.started_at)
            )
            processing_jobs = list(result.scalars().all())

            logger.info(f"Found {len(processing_jobs)} jobs to check")

            # Check for timed-out jobs (processing > 2 hours)
            from datetime import timedelta
            TIMEOUT_HOURS = 2
            timeout_threshold = datetime.utcnow() - timedelta(hours=TIMEOUT_HOURS)
            
            for job in processing_jobs:
                # Check timeout first
                if job.started_at and job.started_at < timeout_threshold:
                    logger.warning(f"Job {job.id} timed out (started at {job.started_at})")
                    
                    # Get submission and account to decrement counter
                    submission_result = await db.execute(
                        select(ProviderSubmission)
                        .where(ProviderSubmission.job_id == job.id)
                        .order_by(ProviderSubmission.created_at.desc())
                    )
                    submission = submission_result.scalar_one_or_none()
                    
                    if submission and submission.account_id:
                        account = await db.get(ProviderAccount, submission.account_id)
                        if account and account.current_processing_jobs > 0:
                            account.current_processing_jobs -= 1
                    
                    await job_service.mark_failed(job.id, f"Job timed out after {TIMEOUT_HOURS} hours")
                    failed += 1
                    continue

            for job in processing_jobs:
                checked += 1

                try:
                    # Get submission for this job
                    submission_result = await db.execute(
                        select(ProviderSubmission)
                        .where(ProviderSubmission.job_id == job.id)
                        .order_by(ProviderSubmission.created_at.desc())
                    )
                    submission = submission_result.scalar_one_or_none()

                    if not submission:
                        logger.warning(f"No submission found for job {job.id}")
                        await job_service.mark_failed(
                            job.id,
                            "No provider submission found"
                        )
                        failed += 1
                        continue

                    # Get account
                    account = await db.get(ProviderAccount, submission.account_id)
                    if not account:
                        logger.error(f"Account {submission.account_id} not found")
                        await job_service.mark_failed(job.id, "Account not found")
                        failed += 1
                        continue

                    # Check status with provider
                    try:
                        status_result = await provider_service.check_status(
                            submission=submission,
                            account=account
                        )

                        logger.debug(
                            f"Job {job.id} status: {status_result.status} "
                            f"({status_result.progress}%)"
                        )

                        # Handle status
                        if status_result.status == VideoStatus.COMPLETED:
                            # Create asset from submission
                            asset = await asset_service.create_from_submission(
                                submission=submission,
                                job=job
                            )
                            logger.info(
                                f"Job {job.id} completed! "
                                f"Created asset {asset.id}"
                            )

                            # Mark job as completed
                            await job_service.mark_completed(job.id, asset.id)
                            
                            # Decrement account's concurrent job count
                            if account.current_processing_jobs > 0:
                                account.current_processing_jobs -= 1
                            
                            completed += 1

                        elif status_result.status == VideoStatus.FAILED:
                            logger.warning(
                                f"Job {job.id} failed on provider: "
                                f"{status_result.error_message}"
                            )
                            await job_service.mark_failed(
                                job.id,
                                status_result.error_message or "Provider reported failure"
                            )
                            
                            # Decrement account's concurrent job count
                            if account.current_processing_jobs > 0:
                                account.current_processing_jobs -= 1
                            
                            failed += 1

                        elif status_result.status == VideoStatus.PROCESSING:
                            still_processing += 1

                        else:
                            logger.debug(f"Job {job.id} still pending")
                            still_processing += 1

                    except ProviderError as e:
                        logger.error(
                            f"Provider error checking job {job.id}: {e}"
                        )
                        # Don't fail the job yet - might be temporary
                        # Let it retry on next poll

                except Exception as e:
                    logger.error(
                        f"Error polling job {job.id}: {e}",
                        exc_info=True
                    )
                    # Continue with next job

            # Commit all changes
            await db.commit()

            stats = {
                "checked": checked,
                "completed": completed,
                "failed": failed,
                "still_processing": still_processing,
                "timestamp": datetime.utcnow().isoformat()
            }

            logger.info(
                f"Poll complete: {checked} checked, "
                f"{completed} completed, {failed} failed, "
                f"{still_processing} still processing"
            )

            return stats

        except Exception as e:
            logger.error(f"Error in poll_job_statuses: {e}", exc_info=True)
            raise

        finally:
            await db.close()


async def on_startup(ctx: dict) -> None:
    """ARQ worker startup"""
    logger.info("Status poller worker started")


async def on_shutdown(ctx: dict) -> None:
    """ARQ worker shutdown"""
    logger.info("Status poller worker shutting down")


# ARQ task configuration
class WorkerSettings:
    """ARQ worker settings for status poller"""
    functions = [poll_job_statuses]
    on_startup = on_startup
    on_shutdown = on_shutdown
    redis_settings = "redis://localhost:6379/0"

    # Run poll_job_statuses every 10 seconds
    cron_jobs = [
        {
            "function": poll_job_statuses,
            "cron": "*/10 * * * * *",  # Every 10 seconds
        }
    ]
