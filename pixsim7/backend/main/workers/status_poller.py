"""
Status poller worker - checks generation status on providers

Runs periodically to:
1. Find generations in PROCESSING state
2. Check status with provider
3. Create assets when completed
4. Update generation status
"""
from datetime import datetime, timedelta

from sqlalchemy import select

from pixsim_logging import configure_logging
from pixsim7.backend.main.domain import Generation, ProviderSubmission, ProviderAccount
from pixsim7.backend.main.domain.enums import GenerationStatus, VideoStatus
from pixsim7.backend.main.services.generation import GenerationService
from pixsim7.backend.main.services.provider import ProviderService
from pixsim7.backend.main.services.asset import AssetService
from pixsim7.backend.main.services.user import UserService
from pixsim7.backend.main.infrastructure.database.session import get_db
from pixsim7.backend.main.shared.debug import (
    get_global_debug_logger,
    load_global_debug_from_env,
)
from pixsim7.backend.main.shared.errors import ProviderError

logger = configure_logging("worker")
_poller_debug_initialized = False


def _init_poller_debug_flags() -> None:
    """Initialize global debug flags for the status poller from environment."""
    global _poller_debug_initialized
    if _poller_debug_initialized:
        return
    load_global_debug_from_env()
    _poller_debug_initialized = True


async def poll_job_statuses(ctx: dict) -> dict:
    """
    Poll status of all processing generations.

    This runs periodically (e.g., every 10 seconds) to check
    generation status with providers and update accordingly.

    Args:
        ctx: ARQ worker context

    Returns:
        dict with poll statistics
    """
    _init_poller_debug_flags()
    worker_debug = get_global_debug_logger()
    worker_debug.worker("poll_start")
    checked = 0
    completed = 0
    failed = 0
    still_processing = 0

    async for db in get_db():
        try:
            user_service = UserService(db)
            generation_service = GenerationService(db, user_service)
            provider_service = ProviderService(db)
            asset_service = AssetService(db, user_service)

            result = await db.execute(
                select(Generation)
                .where(Generation.status == GenerationStatus.PROCESSING)
                .order_by(Generation.started_at)
            )
            processing_generations = list(result.scalars().all())

            if processing_generations:
                logger.info("poll_found_generations", count=len(processing_generations))
                worker_debug.worker("poll_found_generations", count=len(processing_generations))

            # Timeout threshold (processing > 2 hours = stuck)
            TIMEOUT_HOURS = 2
            timeout_threshold = datetime.utcnow() - timedelta(hours=TIMEOUT_HOURS)

            for generation in processing_generations:
                checked += 1

                try:
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

                    account = await db.get(ProviderAccount, submission.account_id)
                    if not account:
                        logger.error("account_not_found", account_id=submission.account_id)
                        await generation_service.mark_failed(generation.id, "Account not found")
                        failed += 1
                        continue

                    if generation.started_at and generation.started_at < timeout_threshold:
                        logger.warning("generation_timeout", generation_id=generation.id, started_at=str(generation.started_at))
                        await generation_service.mark_failed(generation.id, f"Generation timed out after {TIMEOUT_HOURS} hours")

                        # Decrement account's concurrent job count
                        if account.current_processing_jobs > 0:
                            account.current_processing_jobs -= 1

                        failed += 1
                        continue

                    try:
                        status_result = await provider_service.check_status(
                            submission=submission,
                            account=account
                        )

                        logger.debug("generation_status", generation_id=generation.id, status=str(status_result.status), progress=status_result.progress)
                        worker_debug.provider(
                            "generation_status",
                            generation_id=generation.id,
                            status=str(status_result.status),
                            progress=status_result.progress,
                        )

                        # Handle status
                        if status_result.status == VideoStatus.COMPLETED:
                            # Create asset from submission
                            asset = await asset_service.create_from_submission(
                                submission=submission,
                                generation=generation
                            )
                            logger.info("generation_completed", generation_id=generation.id, asset_id=asset.id)
                            worker_debug.worker(
                                "generation_completed",
                                generation_id=generation.id,
                                asset_id=asset.id,
                            )

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
                        still_processing += 1

                except Exception as e:
                    logger.error("poll_generation_error", generation_id=generation.id, error=str(e), exc_info=True)
                    worker_debug.worker(
                        "poll_generation_error",
                        generation_id=generation.id,
                        error=str(e),
                    )
                    # Continue with next generation

            await db.commit()

            stats = {
                "checked": checked,
                "completed": completed,
                "failed": failed,
                "still_processing": still_processing,
                "timestamp": datetime.utcnow().isoformat()
            }

            if checked > 0:
                logger.info("poll_complete", checked=checked, completed=completed, failed=failed, still_processing=still_processing)
                worker_debug.worker(
                    "poll_complete",
                    checked=checked,
                    completed=completed,
                    failed=failed,
                    still_processing=still_processing,
                )
            else:
                logger.debug("poll_complete_idle", msg="No generations to process")

            return stats

        except Exception as e:
            logger.error("poll_error", error=str(e), exc_info=True)
            worker_debug.worker("poll_error", error=str(e))
            raise

        finally:
            await db.close()


async def requeue_pending_generations(ctx: dict) -> dict:
    """
    Re-queue stuck PENDING generations.

    This runs periodically to find generations that:
    1. Are in PENDING status
    2. Have been pending for more than STALE_THRESHOLD_SECONDS
    3. Are not scheduled for the future

    These generations likely failed to enqueue properly when created
    (e.g., worker was down, Redis was unavailable).

    Args:
        ctx: ARQ worker context

    Returns:
        dict with requeue statistics
    """
    STALE_THRESHOLD_SECONDS = 60  # Consider pending > 1 minute as stuck
    MAX_REQUEUE_PER_RUN = 10  # Limit to avoid overwhelming the queue

    requeued = 0
    skipped = 0
    errors = 0

    async for db in get_db():
        try:
            from datetime import timedelta
            from pixsim7.backend.main.infrastructure.redis import get_arq_pool

            # Find stale PENDING generations
            threshold = datetime.utcnow() - timedelta(seconds=STALE_THRESHOLD_SECONDS)

            result = await db.execute(
                select(Generation)
                .where(Generation.status == GenerationStatus.PENDING)
                .where(Generation.created_at < threshold)
                .where(
                    (Generation.scheduled_at == None) |
                    (Generation.scheduled_at <= datetime.utcnow())
                )
                .order_by(Generation.created_at)
                .limit(MAX_REQUEUE_PER_RUN)
            )
            stuck_generations = list(result.scalars().all())

            if not stuck_generations:
                logger.debug("requeue_idle", msg="No stuck pending generations found")
                return {"requeued": 0, "skipped": 0, "errors": 0}

            logger.info("requeue_found_stuck", count=len(stuck_generations))

            # Get ARQ pool for enqueueing
            try:
                arq_pool = await get_arq_pool()
            except Exception as e:
                logger.error("requeue_pool_error", error=str(e))
                return {"requeued": 0, "skipped": 0, "errors": len(stuck_generations)}

            for generation in stuck_generations:
                try:
                    # Check if already in queue (avoid duplicates)
                    # ARQ doesn't have a great way to check this, so we just requeue
                    # The job processor will skip if status changed

                    await arq_pool.enqueue_job(
                        "process_generation",
                        generation_id=generation.id,
                    )

                    logger.info("requeue_generation", generation_id=generation.id,
                               age_seconds=(datetime.utcnow() - generation.created_at).total_seconds())
                    requeued += 1

                except Exception as e:
                    logger.error("requeue_generation_error",
                               generation_id=generation.id, error=str(e))
                    errors += 1

            stats = {
                "requeued": requeued,
                "skipped": skipped,
                "errors": errors,
                "timestamp": datetime.utcnow().isoformat()
            }

            logger.info("requeue_complete", **stats)
            return stats

        except Exception as e:
            logger.error("requeue_error", error=str(e), exc_info=True)
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
