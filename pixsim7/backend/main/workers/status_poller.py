"""
Status poller worker - checks generation status on providers

Runs periodically to:
1. Find generations in PROCESSING state
2. Check status with provider
3. Create assets when completed
4. Update generation status
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func, distinct

from pixsim_logging import configure_logging
from pixsim7.backend.main.domain import Generation
from pixsim7.backend.main.domain.providers import ProviderSubmission, ProviderAccount
from pixsim7.backend.main.domain.enums import GenerationStatus, ProviderStatus, OperationType
from pixsim7.backend.main.domain.assets.analysis import AssetAnalysis, AnalysisStatus
from pixsim7.backend.main.services.generation import GenerationService, GenerationBillingService
from pixsim7.backend.main.services.analysis import AnalysisService
from pixsim7.backend.main.services.provider import ProviderService
from pixsim7.backend.main.services.account import AccountService
from pixsim7.backend.main.services.asset import AssetService
from pixsim7.backend.main.services.user import UserService
from pixsim7.backend.main.infrastructure.database.session import get_db
from pixsim7.backend.main.shared.debug import (
    get_global_debug_logger,
    load_global_debug_from_env,
)
from pixsim7.backend.main.shared.errors import ProviderError
from pixsim7.backend.main.workers.job_processor import refresh_account_credits
from pixsim7.backend.main.infrastructure.events.redis_bridge import (
    start_event_bus_bridge,
    stop_event_bus_bridge,
)

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
    # Generation stats
    checked = 0
    completed = 0
    failed = 0
    still_processing = 0

    # Analysis stats
    analyses_checked = 0
    analyses_completed = 0
    analyses_failed = 0
    analyses_still_processing = 0

    async for db in get_db():
        try:
            user_service = UserService(db)
            generation_service = GenerationService(db, user_service)
            provider_service = ProviderService(db)
            account_service = AccountService(db)
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
            timeout_threshold = datetime.now(timezone.utc) - timedelta(hours=TIMEOUT_HOURS)

            for generation in processing_generations:
                checked += 1

                try:
                    submission_result = await db.execute(
                        select(ProviderSubmission)
                        .where(ProviderSubmission.generation_id == generation.id)
                        .order_by(ProviderSubmission.submitted_at.desc())
                        .limit(1)
                    )
                    submission = submission_result.scalars().first()

                    if not submission:
                        logger.warning("no_submission", generation_id=generation.id)
                        await generation_service.mark_failed(
                            generation.id,
                            "No provider submission found"
                        )
                        # Decrement counter using generation.account_id if available
                        # (counter was incremented at selection, before submission created)
                        if generation.account_id:
                            orphan_account = await db.get(ProviderAccount, generation.account_id)
                            if orphan_account and orphan_account.current_processing_jobs > 0:
                                orphan_account.current_processing_jobs -= 1
                                logger.info(
                                    "counter_decremented_no_submission",
                                    account_id=generation.account_id,
                                    generation_id=generation.id,
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

                        # Finalize billing as skipped (no charge for timed-out generations)
                        try:
                            billing_service = GenerationBillingService(db)
                            await db.refresh(generation)
                            await billing_service.finalize_billing(
                                generation=generation,
                                final_submission=submission,
                                account=account,
                            )
                        except Exception as billing_err:
                            logger.warning(
                                "billing_finalization_error",
                                generation_id=generation.id,
                                error=str(billing_err)
                            )

                        # Decrement account's concurrent job count
                        if account.current_processing_jobs > 0:
                            account.current_processing_jobs -= 1

                        failed += 1
                        continue

                    try:
                        status_result = await provider_service.check_status(
                            submission=submission,
                            account=account,
                            operation_type=generation.operation_type,
                        )

                        # Include provider's raw status/metadata for debugging
                        provider_status = None
                        if status_result.metadata and isinstance(status_result.metadata, dict):
                            provider_status = status_result.metadata.get("provider_status")

                        # Use info level so status is visible even when debug is filtered
                        logger.info(
                            "generation_status",
                            generation_id=generation.id,
                            status=str(status_result.status),
                            progress=status_result.progress,
                            provider_status=str(provider_status) if provider_status is not None else None,
                        )
                        worker_debug.provider(
                            "generation_status",
                            generation_id=generation.id,
                            status=str(status_result.status),
                            progress=status_result.progress,
                            provider_status=str(provider_status) if provider_status is not None else None,
                        )

                        # Handle status
                        if status_result.status == ProviderStatus.COMPLETED:
                            # Refresh submission to get updated response from check_status
                            await db.refresh(submission)
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

                            # Finalize billing (idempotent - safe to re-run)
                            # This handles credit deduction and updates Generation.billing fields
                            try:
                                billing_service = GenerationBillingService(db)
                                await db.refresh(generation)  # Get updated status
                                await billing_service.finalize_billing(
                                    generation=generation,
                                    final_submission=submission,
                                    account=account,
                                    actual_duration=status_result.duration_sec,
                                )
                            except Exception as billing_err:
                                logger.warning(
                                    "billing_finalization_error",
                                    generation_id=generation.id,
                                    error=str(billing_err)
                                )

                            # Decrement account's concurrent job count
                            if account.current_processing_jobs > 0:
                                account.current_processing_jobs -= 1

                            # Refresh credits from provider to sync actual balance
                            await refresh_account_credits(account, account_service, logger)

                            completed += 1

                        elif status_result.status in {
                            ProviderStatus.FAILED,
                            ProviderStatus.FILTERED,
                            ProviderStatus.CANCELLED,
                        }:
                            # Mark this attempt as failed
                            logger.warning(
                                "generation_failed_provider",
                                generation_id=generation.id,
                                status=str(status_result.status),
                                error=status_result.error_message,
                            )
                            error_text = (
                                status_result.error_message
                                or f"Provider reported terminal status: {status_result.status.value}"
                            )
                            generation = await generation_service.mark_failed(
                                generation.id,
                                error_text,
                            )

                            # Finalize billing as skipped (no charge for failed generations)
                            try:
                                billing_service = GenerationBillingService(db)
                                await db.refresh(generation)  # Get updated status
                                await billing_service.finalize_billing(
                                    generation=generation,
                                    final_submission=submission,
                                    account=account,
                                )
                            except Exception as billing_err:
                                logger.warning(
                                    "billing_finalization_error",
                                    generation_id=generation.id,
                                    error=str(billing_err)
                                )

                            # Decrement account's concurrent job count
                            if account.current_processing_jobs > 0:
                                account.current_processing_jobs -= 1

                            # Refresh credits from provider to sync actual balance
                            # (Pixverse auto-refunds for failed/filtered generations)
                            await refresh_account_credits(account, account_service, logger)

                            failed += 1

                            # ===== AUTO-RETRY (worker-side) =====
                            # For content-filter / transient errors, optionally auto-retry
                            try:
                                from pixsim7.backend.main.shared.config import settings

                                # Check if auto-retry should happen
                                should_retry = await generation_service.should_auto_retry(generation)
                                logger.debug(
                                    "auto_retry_check",
                                    generation_id=generation.id,
                                    enabled=settings.auto_retry_enabled,
                                    should_retry=should_retry,
                                    retry_count=generation.retry_count,
                                    error_message=generation.error_message[:100] if generation.error_message else None,
                                )

                                # Respect global toggle
                                if settings.auto_retry_enabled and should_retry:
                                    from pixsim7.backend.main.infrastructure.redis import get_arq_pool
                                    from pixsim7.backend.main.domain.enums import GenerationStatus as GenStatus

                                    # Increment retry_count and reset lifecycle in one operation
                                    # (avoids double-commit from separate increment_retry call)
                                    generation.retry_count += 1
                                    generation.status = GenStatus.PENDING
                                    generation.started_at = None
                                    generation.completed_at = None
                                    generation.updated_at = datetime.now(timezone.utc)

                                    await db.commit()
                                    await db.refresh(generation)

                                    # Re-enqueue the same generation
                                    arq_pool = await get_arq_pool()
                                    await arq_pool.enqueue_job(
                                        "process_generation",
                                        generation_id=generation.id,
                                    )

                                    logger.info(
                                        "auto_retry_requeued_worker",
                                        generation_id=generation.id,
                                        retry_attempt=generation.retry_count,
                                        max_attempts=settings.auto_retry_max_attempts,
                                    )
                            except Exception as auto_retry_err:
                                logger.error(
                                    "auto_retry_worker_error",
                                    generation_id=generation.id,
                                    error=str(auto_retry_err),
                                    exc_info=True,
                                )

                        elif status_result.status == ProviderStatus.PROCESSING:
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

            # ===== POLL ANALYSES =====
            analysis_service = AnalysisService(db)

            result = await db.execute(
                select(AssetAnalysis)
                .where(AssetAnalysis.status == AnalysisStatus.PROCESSING)
                .order_by(AssetAnalysis.started_at)
            )
            processing_analyses = list(result.scalars().all())

            if processing_analyses:
                logger.info("poll_found_analyses", count=len(processing_analyses))
                worker_debug.worker("poll_found_analyses", count=len(processing_analyses))

            for analysis in processing_analyses:
                analyses_checked += 1

                try:
                    # Get latest submission for this analysis
                    submission_result = await db.execute(
                        select(ProviderSubmission)
                        .where(ProviderSubmission.analysis_id == analysis.id)
                        .order_by(ProviderSubmission.submitted_at.desc())
                        .limit(1)
                    )
                    submission = submission_result.scalars().first()

                    if not submission:
                        logger.warning("no_analysis_submission", analysis_id=analysis.id)
                        await analysis_service.mark_failed(
                            analysis.id,
                            "No provider submission found"
                        )
                        analyses_failed += 1
                        continue

                    account = await db.get(ProviderAccount, submission.account_id)
                    if not account:
                        logger.error("analysis_account_not_found", account_id=submission.account_id)
                        await analysis_service.mark_failed(analysis.id, "Account not found")
                        analyses_failed += 1
                        continue

                    # Check timeout (analyses > 30 min = stuck)
                    ANALYSIS_TIMEOUT_MINUTES = 30
                    analysis_timeout_threshold = datetime.now(timezone.utc) - timedelta(minutes=ANALYSIS_TIMEOUT_MINUTES)

                    if analysis.started_at and analysis.started_at < analysis_timeout_threshold:
                        logger.warning("analysis_timeout", analysis_id=analysis.id, started_at=str(analysis.started_at))
                        await analysis_service.mark_failed(
                            analysis.id,
                            f"Analysis timed out after {ANALYSIS_TIMEOUT_MINUTES} minutes"
                        )

                        # Decrement account's concurrent job count
                        if account.current_processing_jobs > 0:
                            account.current_processing_jobs -= 1

                        analyses_failed += 1
                        continue

                    try:
                        status_result = await provider_service.check_analysis_status(
                            submission=submission,
                            account=account,
                        )

                        logger.debug(
                            "analysis_status",
                            analysis_id=analysis.id,
                            status=str(status_result.status),
                            progress=status_result.progress
                        )

                        # Handle status
                        if status_result.status == ProviderStatus.COMPLETED:
                            # Extract result from submission response
                            await db.refresh(submission)
                            result_data = submission.response.get("result", {})

                            await analysis_service.mark_completed(analysis.id, result_data)
                            logger.info("analysis_completed", analysis_id=analysis.id)

                            # Decrement account's concurrent job count
                            if account.current_processing_jobs > 0:
                                account.current_processing_jobs -= 1

                            analyses_completed += 1

                        elif status_result.status in {
                            ProviderStatus.FAILED,
                            ProviderStatus.FILTERED,
                            ProviderStatus.CANCELLED,
                        }:
                            logger.warning(
                                "analysis_failed_provider",
                                analysis_id=analysis.id,
                                status=str(status_result.status),
                                error=status_result.error_message,
                            )
                            await analysis_service.mark_failed(
                                analysis.id,
                                status_result.error_message
                                or f"Provider reported terminal status: {status_result.status.value}",
                            )

                            # Decrement account's concurrent job count
                            if account.current_processing_jobs > 0:
                                account.current_processing_jobs -= 1

                            analyses_failed += 1

                        elif status_result.status == ProviderStatus.PROCESSING:
                            analyses_still_processing += 1

                        else:
                            logger.debug("analysis_pending", analysis_id=analysis.id)
                            analyses_still_processing += 1

                    except ProviderError as e:
                        logger.error("provider_analysis_check_error", analysis_id=analysis.id, error=str(e))
                        analyses_still_processing += 1

                except Exception as e:
                    logger.error("poll_analysis_error", analysis_id=analysis.id, error=str(e), exc_info=True)
                    worker_debug.worker(
                        "poll_analysis_error",
                        analysis_id=analysis.id,
                        error=str(e),
                    )

            await db.commit()

            stats = {
                "checked": checked,
                "completed": completed,
                "failed": failed,
                "still_processing": still_processing,
                "analyses_checked": analyses_checked,
                "analyses_completed": analyses_completed,
                "analyses_failed": analyses_failed,
                "analyses_still_processing": analyses_still_processing,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }

            total_checked = checked + analyses_checked
            if total_checked > 0:
                logger.info(
                    "poll_complete",
                    generations_checked=checked,
                    generations_completed=completed,
                    generations_failed=failed,
                    generations_still_processing=still_processing,
                    analyses_checked=analyses_checked,
                    analyses_completed=analyses_completed,
                    analyses_failed=analyses_failed,
                    analyses_still_processing=analyses_still_processing,
                )
                worker_debug.worker("poll_complete", **stats)
            else:
                logger.debug("poll_complete_idle", msg="No jobs to process")

            return stats

        except Exception as e:
            logger.error("poll_error", error=str(e), exc_info=True)
            worker_debug.worker("poll_error", error=str(e))
            raise

        finally:
            await db.close()


async def reconcile_account_counters(ctx: dict) -> dict:
    """
    Reconcile current_processing_jobs counters on startup.

    This fixes counter drift that occurs when:
    1. Worker crashes between account selection and job completion
    2. Jobs are orphaned without proper counter decrement

    For each account with current_processing_jobs > 0, we count actual
    PROCESSING generations + analyses and reset the counter to match reality.

    Args:
        ctx: ARQ worker context

    Returns:
        dict with reconciliation statistics
    """
    reconciled = 0
    errors = 0

    async for db in get_db():
        try:
            # Find all accounts that think they have processing jobs
            result = await db.execute(
                select(ProviderAccount).where(
                    ProviderAccount.current_processing_jobs > 0
                )
            )
            accounts_with_jobs = list(result.scalars().all())

            if not accounts_with_jobs:
                logger.debug("reconcile_idle", msg="No accounts with elevated counters")
                return {"reconciled": 0, "errors": 0}

            logger.info("reconcile_found_accounts", count=len(accounts_with_jobs))

            for account in accounts_with_jobs:
                try:
                    # Count actual PROCESSING generations for this account
                    gen_count_result = await db.execute(
                        select(func.count(Generation.id)).where(
                            Generation.account_id == account.id,
                            Generation.status == GenerationStatus.PROCESSING,
                        )
                    )
                    generation_count = gen_count_result.scalar() or 0

                    # Count actual PROCESSING analyses for this account
                    analysis_count_result = await db.execute(
                        select(func.count(distinct(AssetAnalysis.id)))
                        .select_from(AssetAnalysis)
                        .join(ProviderSubmission, ProviderSubmission.analysis_id == AssetAnalysis.id)
                        .where(
                            AssetAnalysis.status == AnalysisStatus.PROCESSING,
                            ProviderSubmission.account_id == account.id,
                        )
                    )
                    analysis_count = analysis_count_result.scalar() or 0

                    actual_count = generation_count + analysis_count

                    old_count = account.current_processing_jobs
                    if old_count != actual_count:
                        account.current_processing_jobs = actual_count
                        logger.info(
                            "counter_reconciled",
                            account_id=account.id,
                            email=account.email,
                            old_count=old_count,
                            new_count=actual_count,
                            generation_count=generation_count,
                            analysis_count=analysis_count,
                        )
                        reconciled += 1

                except Exception as e:
                    logger.error(
                        "reconcile_account_error",
                        account_id=account.id,
                        error=str(e),
                    )
                    errors += 1

            await db.commit()

            logger.info(
                "reconcile_complete",
                reconciled=reconciled,
                errors=errors,
            )

            return {"reconciled": reconciled, "errors": errors}

        except Exception as e:
            logger.error("reconcile_error", error=str(e), exc_info=True)
            raise

        finally:
            await db.close()

    return {"reconciled": 0, "errors": 0}


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
            threshold = datetime.now(timezone.utc) - timedelta(seconds=STALE_THRESHOLD_SECONDS)

            result = await db.execute(
                select(Generation)
                .where(Generation.status == GenerationStatus.PENDING)
                .where(Generation.created_at < threshold)
                .where(
                    (Generation.scheduled_at == None) |
                    (Generation.scheduled_at <= datetime.now(timezone.utc))
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
                               age_seconds=(datetime.now(timezone.utc) - generation.created_at).total_seconds())
                    requeued += 1

                except Exception as e:
                    logger.error("requeue_generation_error",
                               generation_id=generation.id, error=str(e))
                    errors += 1

            stats = {
                "requeued": requeued,
                "skipped": skipped,
                "errors": errors,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }

            logger.info("requeue_complete", **stats)
            return stats

        except Exception as e:
            logger.error("requeue_error", error=str(e), exc_info=True)
            raise

        finally:
            await db.close()


_event_bridge = None


async def on_startup(ctx: dict) -> None:
    """ARQ worker startup"""
    global _event_bridge
    logger.info("status_poller_started")
    _event_bridge = await start_event_bus_bridge(role="status_poller")


async def on_shutdown(ctx: dict) -> None:
    """ARQ worker shutdown"""
    global _event_bridge
    logger.info("status_poller_shutdown")
    if _event_bridge:
        await stop_event_bus_bridge()
        _event_bridge = None


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
