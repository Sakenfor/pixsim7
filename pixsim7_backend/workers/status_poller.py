"""
Status poller worker - checks generation status on providers

Runs periodically to:
1. Find generations in PROCESSING state
2. Check status with provider
3. Create assets when completed
4. Update generation status
"""
from pixsim_logging import configure_logging
from datetime import datetime, timedelta
from sqlalchemy import select
from pixsim7_backend.domain import Generation, ProviderSubmission, ProviderAccount
from pixsim7_backend.domain.enums import GenerationStatus, VideoStatus
from pixsim7_backend.services.generation import GenerationService
from pixsim7_backend.services.provider import ProviderService
from pixsim7_backend.services.asset import AssetService
from pixsim7_backend.services.user import UserService
from pixsim7_backend.infrastructure.database.session import get_db
from pixsim7_backend.shared.errors import ProviderError

logger = configure_logging("worker")


async def poll_job_statuses() -> dict:
    """
    Poll status of all processing generations

    This runs periodically (e.g., every 10 seconds) to check
    generation status with providers and update accordingly.

    Returns:
        dict with poll statistics
    """
    logger.info("poll_start", msg="Polling generation statuses")

    checked = 0
    completed = 0
    failed = 0
    still_processing = 0

    async for db in get_db():
        try:
            # Initialize services
            user_service = UserService(db)
            generation_service = GenerationService(db, user_service)
            provider_service = ProviderService(db)
            asset_service = AssetService(db, user_service)

            # Get all PROCESSING generations
            result = await db.execute(
                select(Generation)
                .where(Generation.status == GenerationStatus.PROCESSING)
                .order_by(Generation.started_at)
            )
            processing_generations = list(result.scalars().all())

            logger.info("poll_found_generations", count=len(processing_generations))

            # Check for timed-out generations (processing > 2 hours)
            from datetime import timedelta
            TIMEOUT_HOURS = 2
            timeout_threshold = datetime.utcnow() - timedelta(hours=TIMEOUT_HOURS)

            for generation in processing_generations:
                # Check timeout first
                if generation.started_at and generation.started_at < timeout_threshold:
                    logger.warning("generation_timeout", generation_id=generation.id, started_at=str(generation.started_at))

                    # Get submission and account to decrement counter
                    submission_result = await db.execute(
                        select(ProviderSubmission)
                        .where(ProviderSubmission.generation_id == generation.id)
                        .order_by(ProviderSubmission.submitted_at.desc())
                    )
                    submission = submission_result.scalar_one_or_none()

                    if submission and submission.account_id:
                        account = await db.get(ProviderAccount, submission.account_id)
                        if account and account.current_processing_jobs > 0:
                            account.current_processing_jobs -= 1

                    await generation_service.mark_failed(generation.id, f"Generation timed out after {TIMEOUT_HOURS} hours")
                    failed += 1
                    continue

            for generation in processing_generations:
                checked += 1

                try:
                    # Get submission for this generation
                    submission_result = await db.execute(
                        select(ProviderSubmission)
                        .where(ProviderSubmission.generation_id == generation.id)
                        .order_by(ProviderSubmission.submitted_at.desc())
                    )
                    submission = submission_result.scalar_one_or_none()

                    if not submission:
                        logger.warning("no_submission", generation_id=generation.id)
                        await generation_service.mark_failed(
                            generation.id,
                            "No provider submission found"
                        )
                        failed += 1
                        continue

                    # Get account
                    account = await db.get(ProviderAccount, submission.account_id)
                    if not account:
                        logger.error("account_not_found", account_id=submission.account_id)
                        await generation_service.mark_failed(generation.id, "Account not found")
                        failed += 1
                        continue

                    # Check status with provider
                    try:
                        status_result = await provider_service.check_status(
                            submission=submission,
                            account=account
                        )

                        logger.debug("generation_status", generation_id=generation.id, status=str(status_result.status), progress=status_result.progress)

                        # Handle status
                        if status_result.status == VideoStatus.COMPLETED:
                            # Create asset from submission
                            asset = await asset_service.create_from_submission(
                                submission=submission,
                                generation=generation  # Changed from job=job
                            )
                            logger.info("generation_completed", generation_id=generation.id, asset_id=asset.id)

                            # Mark generation as completed
                            await generation_service.mark_completed(generation.id, asset.id)

                            # Decrement account's concurrent job count
                            if account.current_processing_jobs > 0:
                                account.current_processing_jobs -= 1

                            completed += 1

                        elif status_result.status == VideoStatus.FAILED:
                            logger.warning("generation_failed_provider", generation_id=generation.id, error=status_result.error_message)
                            await generation_service.mark_failed(
                                generation.id,
                                status_result.error_message or "Provider reported failure"
                            )

                            # Decrement account's concurrent job count
                            if account.current_processing_jobs > 0:
                                account.current_processing_jobs -= 1

                            failed += 1

                        elif status_result.status == VideoStatus.PROCESSING:
                            still_processing += 1

                        else:
                            logger.debug("generation_pending", generation_id=generation.id)
                            still_processing += 1

                    except ProviderError as e:
                        logger.error("provider_check_error", generation_id=generation.id, error=str(e))
                        # Don't fail the generation yet - might be temporary
                        # Let it retry on next poll

                except Exception as e:
                    logger.error("poll_generation_error", generation_id=generation.id, error=str(e), exc_info=True)
                    # Continue with next generation

            # Commit all changes
            await db.commit()

            stats = {
                "checked": checked,
                "completed": completed,
                "failed": failed,
                "still_processing": still_processing,
                "timestamp": datetime.utcnow().isoformat()
            }

            logger.info("poll_complete", checked=checked, completed=completed, failed=failed, still_processing=still_processing)

            return stats

        except Exception as e:
            logger.error("poll_error", error=str(e), exc_info=True)
            raise

        finally:
            await db.close()


async def on_startup(ctx: dict) -> None:
    """ARQ worker startup"""
    logger.info("status_poller_started")


async def on_shutdown(ctx: dict) -> None:
    """ARQ worker shutdown"""
    logger.info("status_poller_shutdown")


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
