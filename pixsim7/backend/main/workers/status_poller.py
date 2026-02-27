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
from pixsim7.backend.main.domain.enums import (
    AccountStatus,
    GenerationStatus,
    ProviderStatus,
    OperationType,
    GenerationErrorCode,
)
from pixsim7.backend.main.domain.assets.analysis import AssetAnalysis, AnalysisStatus
from pixsim7.backend.main.services.generation import GenerationService, GenerationBillingService
from pixsim7.backend.main.services.analysis import AnalysisService
from pixsim7.backend.main.services.provider import ProviderService
from pixsim7.backend.main.services.account import AccountService
from pixsim7.backend.main.services.asset import AssetService
from pixsim7.backend.main.services.user import UserService
from pixsim7.backend.main.infrastructure.database.session import get_db
from pixsim7.backend.main.infrastructure.queue import (
    clear_generation_wait_metadata,
    enqueue_generation_fresh_job,
    enqueue_generation_retry_job,
    GENERATION_RETRY_QUEUE_NAME,
    get_generation_wait_metadata,
)
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

logger = configure_logging("worker").bind(channel="pipeline")
_poller_debug_initialized = False


def _processing_generations_snapshot(processing_generations: list[Generation]) -> dict:
    now = datetime.now(timezone.utc)
    by_account: dict[str, int] = {}
    sample: list[dict] = []
    oldest_age_seconds = 0.0

    for generation in processing_generations:
        account_key = str(generation.account_id) if generation.account_id is not None else "unassigned"
        by_account[account_key] = by_account.get(account_key, 0) + 1

        age_seconds = None
        if generation.started_at:
            age_seconds = (now - generation.started_at).total_seconds()
            if age_seconds > oldest_age_seconds:
                oldest_age_seconds = age_seconds

        if len(sample) < 10:
            sample.append(
                {
                    "generation_id": generation.id,
                    "account_id": generation.account_id,
                    "operation_type": getattr(generation.operation_type, "value", generation.operation_type),
                    "started_age_seconds": round(age_seconds, 1) if age_seconds is not None else None,
                }
            )

    return {
        "count": len(processing_generations),
        "oldest_started_age_seconds": round(oldest_age_seconds, 1),
        "by_account": by_account,
        "sample": sample,
    }


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
    still_processing_ids: list[int] = []
    missing_provider_job_generation_ids: list[int] = []

    # Analysis stats
    analyses_checked = 0
    analyses_completed = 0
    analyses_failed = 0
    analyses_still_processing = 0
    poll_status_cache: dict[str, object] = {}

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
                snapshot = _processing_generations_snapshot(processing_generations)
                if snapshot["count"] >= 5 or snapshot["oldest_started_age_seconds"] >= 60:
                    logger.warning("poll_processing_snapshot", **snapshot)
                else:
                    logger.info("poll_processing_snapshot", **snapshot)

            # Timeout threshold (processing > 2 hours = stuck)
            TIMEOUT_HOURS = 2
            timeout_threshold = datetime.now(timezone.utc) - timedelta(hours=TIMEOUT_HOURS)
            # Shorter timeout for jobs that never got a provider_job_id
            # (submission to provider failed, no point waiting 2 hours)
            UNSUBMITTED_TIMEOUT_MINUTES = 15
            unsubmitted_timeout_threshold = datetime.now(timezone.utc) - timedelta(minutes=UNSUBMITTED_TIMEOUT_MINUTES)
            # Mixed-submission recovery: latest submit failed without a job id
            # while an older valid provider job exists. These can stay stuck in
            # PROCESSING if provider status polling never resolves the older job.
            MIXED_SUBMISSION_TIMEOUT_MINUTES = 20
            mixed_submission_timeout_threshold = datetime.now(timezone.utc) - timedelta(
                minutes=MIXED_SUBMISSION_TIMEOUT_MINUTES
            )

            for generation in processing_generations:
                checked += 1

                try:
                    latest_error_submission_without_job_id = None
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
                            "No provider submission found",
                            error_code=GenerationErrorCode.PROVIDER_UNAVAILABLE.value,
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

                    if not submission.provider_job_id:
                        missing_provider_job_generation_ids.append(generation.id)
                        submission_age_seconds = None
                        if submission.submitted_at:
                            submission_age_seconds = (
                                datetime.now(timezone.utc) - submission.submitted_at
                            ).total_seconds()
                        generation_started_age_seconds = None
                        if generation.started_at:
                            generation_started_age_seconds = (
                                datetime.now(timezone.utc) - generation.started_at
                            ).total_seconds()

                        submission_count_result = await db.execute(
                            select(func.count(ProviderSubmission.id)).where(
                                ProviderSubmission.generation_id == generation.id
                            )
                        )
                        submission_count = submission_count_result.scalar() or 0

                        previous_valid_result = await db.execute(
                            select(ProviderSubmission)
                            .where(ProviderSubmission.generation_id == generation.id)
                            .where(ProviderSubmission.provider_job_id.is_not(None))
                            .order_by(ProviderSubmission.submitted_at.desc())
                            .limit(1)
                        )
                        previous_valid_submission = previous_valid_result.scalars().first()

                        response_keys = []
                        if isinstance(submission.response, dict):
                            response_keys = list(submission.response.keys())

                        logger.warning(
                            "generation_submission_missing_provider_job_id",
                            generation_id=generation.id,
                            submission_id=submission.id,
                            submission_status=submission.status,
                            submission_age_seconds=submission_age_seconds,
                            generation_started_age_seconds=generation_started_age_seconds,
                            submitted_at=str(submission.submitted_at) if submission.submitted_at else None,
                            responded_at=str(submission.responded_at) if submission.responded_at else None,
                            response_keys=response_keys,
                            submission_count=submission_count,
                            has_previous_valid_submission=previous_valid_submission is not None,
                            previous_valid_submission_id=(
                                previous_valid_submission.id if previous_valid_submission else None
                            ),
                            previous_valid_provider_job_id=(
                                previous_valid_submission.provider_job_id
                                if previous_valid_submission
                                else None
                            ),
                            previous_valid_submitted_at=(
                                str(previous_valid_submission.submitted_at)
                                if previous_valid_submission and previous_valid_submission.submitted_at
                                else None
                            ),
                        )

                        # Terminal submit failure: provider submit already responded
                        # with an error and no job id. Do not keep polling forever.
                        if submission.status == "error" and previous_valid_submission is None:
                            submit_error = None
                            if isinstance(submission.response, dict):
                                submit_error = (
                                    submission.response.get("error_message")
                                    or submission.response.get("error")
                                )
                            final_error = (
                                str(submit_error)
                                if submit_error
                                else "Generation failed before provider job ID was assigned"
                            )
                            logger.warning(
                                "generation_failed_unsubmitted_submission_error",
                                generation_id=generation.id,
                                submission_id=submission.id,
                                submission_status=submission.status,
                                error=final_error,
                            )
                            await generation_service.mark_failed(generation.id, final_error)

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
                                    error=str(billing_err),
                                )

                            account.total_videos_failed += 1
                            account.failure_streak += 1
                            account.success_rate = account.calculate_success_rate()
                            account = await account_service.release_account(account.id)

                            failed += 1
                            continue

                        # Retry/no-job-id edge case: a newer submission may have
                        # failed before getting a provider job id while an older
                        # valid submission is still the actual in-flight job.
                        # Poll the previous valid submission instead of calling
                        # provider.check_status(None) and looping forever.
                        if previous_valid_submission is not None:
                            latest_submission = submission
                            if latest_submission.status == "error":
                                latest_error_submission_without_job_id = latest_submission
                            submission = previous_valid_submission
                            if submission.account_id != account.id:
                                fallback_account = await db.get(ProviderAccount, submission.account_id)
                                if fallback_account:
                                    account = fallback_account
                                else:
                                    logger.error(
                                        "account_not_found_previous_valid_submission",
                                        generation_id=generation.id,
                                        latest_submission_id=latest_submission.id,
                                        polling_submission_id=submission.id,
                                        account_id=submission.account_id,
                                    )
                                    await generation_service.mark_failed(
                                        generation.id,
                                        "Account not found for previous valid provider submission",
                                    )
                                    failed += 1
                                    continue

                            logger.info(
                                "generation_poll_using_previous_valid_submission",
                                generation_id=generation.id,
                                latest_submission_id=latest_submission.id,
                                latest_submission_status=latest_submission.status,
                                polling_submission_id=submission.id,
                                polling_provider_job_id=submission.provider_job_id,
                                polling_submitted_at=(
                                    str(submission.submitted_at) if submission.submitted_at else None
                                ),
                            )

                    if (
                        latest_error_submission_without_job_id is not None
                        and generation.started_at
                        and generation.started_at < mixed_submission_timeout_threshold
                    ):
                        logger.warning(
                            "generation_timeout_mixed_submissions",
                            generation_id=generation.id,
                            started_at=str(generation.started_at),
                            timeout_minutes=MIXED_SUBMISSION_TIMEOUT_MINUTES,
                            latest_submission_id=latest_error_submission_without_job_id.id,
                            latest_submission_status=latest_error_submission_without_job_id.status,
                            polling_submission_id=submission.id,
                            polling_provider_job_id=submission.provider_job_id,
                        )
                        await generation_service.mark_failed(
                            generation.id,
                            (
                                "Generation stuck after mixed provider submissions "
                                f"(timed out after {MIXED_SUBMISSION_TIMEOUT_MINUTES} minutes)"
                            ),
                        )

                        try:
                            billing_service = GenerationBillingService(db)
                            await db.refresh(generation)
                            await billing_service.finalize_billing(
                                generation=generation,
                                final_submission=latest_error_submission_without_job_id,
                                account=account,
                            )
                        except Exception as billing_err:
                            logger.warning(
                                "billing_finalization_error",
                                generation_id=generation.id,
                                error=str(billing_err),
                            )

                        account.total_videos_failed += 1
                        account.failure_streak += 1
                        account.success_rate = account.calculate_success_rate()
                        account = await account_service.release_account(account.id)

                        failed += 1
                        continue

                    # Fail jobs that never got a provider_job_id after the short timeout
                    # (submission to provider failed; no point polling for 2 hours)
                    if (
                        not submission.provider_job_id
                        and generation.started_at
                        and generation.started_at < unsubmitted_timeout_threshold
                    ):
                        logger.warning(
                            "generation_timeout_unsubmitted",
                            generation_id=generation.id,
                            started_at=str(generation.started_at),
                            timeout_minutes=UNSUBMITTED_TIMEOUT_MINUTES,
                        )
                        await generation_service.mark_failed(
                            generation.id,
                            f"Generation failed: never submitted to provider (timed out after {UNSUBMITTED_TIMEOUT_MINUTES} minutes)",
                        )

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
                                error=str(billing_err),
                            )

                        # Track failure stats on account
                        account.total_videos_failed += 1
                        account.failure_streak += 1
                        account.success_rate = account.calculate_success_rate()

                        account = await account_service.release_account(account.id)

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

                        # Track failure stats on account
                        account.total_videos_failed += 1
                        account.failure_streak += 1
                        account.success_rate = account.calculate_success_rate()

                        # Decrement account's concurrent job count and wake pinned waiters
                        account = await account_service.release_account(account.id)

                        failed += 1
                        continue

                    try:
                        status_result = await provider_service.check_status(
                            submission=submission,
                            account=account,
                            operation_type=generation.operation_type,
                            poll_cache=poll_status_cache,
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

                            # Track generation stats on account
                            account.total_videos_generated += 1
                            account.videos_today += 1
                            account.failure_streak = 0
                            account.last_used = datetime.now(timezone.utc)
                            if status_result.duration_sec:
                                account.update_ema_generation_time(status_result.duration_sec)
                            account.success_rate = account.calculate_success_rate()

                            # Decrement account's concurrent job count and wake pinned waiters
                            account = await account_service.release_account(account.id)

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
                            error_code = (
                                GenerationErrorCode.CONTENT_FILTERED.value
                                if status_result.status == ProviderStatus.FILTERED
                                else None
                            )
                            generation = await generation_service.mark_failed(
                                generation.id,
                                error_text,
                                error_code=error_code,
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

                            # Track failure stats on account
                            account.total_videos_failed += 1
                            account.failure_streak += 1
                            account.success_rate = account.calculate_success_rate()

                            # Decrement account's concurrent job count and wake pinned waiters
                            account = await account_service.release_account(account.id)

                            # Refresh credits from provider to sync actual balance
                            # (Pixverse auto-refunds for failed/filtered generations)
                            await refresh_account_credits(account, account_service, logger)

                            failed += 1

                            # Poll-time terminal retries are owned by the
                            # job:failed event auto-retry handler. Do not also
                            # requeue here, or poller and event-handler race to
                            # retry the same generation.
                            logger.debug(
                                "auto_retry_delegated_to_event_handler",
                                generation_id=generation.id,
                                status=str(status_result.status),
                                error_code=getattr(generation, "error_code", None),
                            )

                        elif status_result.status == ProviderStatus.PROCESSING:
                            still_processing += 1
                            still_processing_ids.append(generation.id)

                        else:
                            logger.debug("generation_pending", generation_id=generation.id)
                            still_processing += 1
                            still_processing_ids.append(generation.id)

                    except ProviderError as e:
                        # Expected provider errors (content filter, quota, etc.) → WARNING
                        _poll_log = logger.warning if getattr(e, 'error_code', None) else logger.error
                        _poll_log("provider_check_error", generation_id=generation.id, error=str(e))
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
                        _apoll_log = logger.warning if getattr(e, 'error_code', None) else logger.error
                        _apoll_log("provider_analysis_check_error", analysis_id=analysis.id, error=str(e))
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
                    still_processing_ids_sample=still_processing_ids[:10] if still_processing_ids else None,
                    missing_provider_job_ids_sample=(
                        missing_provider_job_generation_ids[:10]
                        if missing_provider_job_generation_ids
                        else None
                    ),
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
    2. Have had no lifecycle updates for more than STALE_THRESHOLD_SECONDS
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
    pinned_dispatched = 0
    skipped = 0
    errors = 0

    async for db in get_db():
        try:
            from datetime import timedelta
            from pixsim7.backend.main.infrastructure.redis import get_arq_pool

            now = datetime.now(timezone.utc)

            # First pass: capacity-aware dispatch for pinned waiting generations.
            # This is an early-admission fallback that dispatches only when the
            # preferred account currently has room.
            # Include EXHAUSTED accounts: pinned generations skip credit checks,
            # and process_generation allows exhausted accounts for preferred use.
            capacity_accounts_result = await db.execute(
                select(ProviderAccount).where(
                    ProviderAccount.status.in_([AccountStatus.ACTIVE, AccountStatus.EXHAUSTED]),
                    ProviderAccount.max_concurrent_jobs > ProviderAccount.current_processing_jobs,
                    (
                        (ProviderAccount.cooldown_until == None)
                        | (ProviderAccount.cooldown_until <= now)
                    ),
                )
            )
            capacity_accounts = list(capacity_accounts_result.scalars().all())

            if capacity_accounts:
                try:
                    arq_pool = await get_arq_pool()
                except Exception as e:
                    logger.error("requeue_pool_error", error=str(e))
                    return {"requeued": 0, "pinned_dispatched": 0, "skipped": 0, "errors": 1}

                for account in capacity_accounts:
                    free_slots = max(
                        0,
                        int(account.max_concurrent_jobs or 0) - int(account.current_processing_jobs or 0),
                    )
                    if free_slots <= 0:
                        continue

                    ready_pinned_result = await db.execute(
                        select(Generation)
                        .where(Generation.status == GenerationStatus.PENDING)
                        .where(Generation.preferred_account_id == account.id)
                        .where(
                            (Generation.account_id == None)
                            | (Generation.account_id == account.id)
                        )
                        .where(
                            (Generation.scheduled_at == None) |
                            (Generation.scheduled_at <= now)
                        )
                        .order_by(Generation.priority.desc(), Generation.created_at)
                        .limit(free_slots)
                    )
                    ready_pinned = list(ready_pinned_result.scalars().all())
                    if not ready_pinned:
                        continue

                    for generation in ready_pinned:
                        try:
                            wait_meta = await get_generation_wait_metadata(arq_pool, generation.id)
                            wait_reason = (
                                str(wait_meta.get("reason"))
                                if isinstance(wait_meta, dict) and wait_meta.get("reason")
                                else None
                            )
                            enqueued = await enqueue_generation_fresh_job(arq_pool, generation.id)
                            if not enqueued:
                                skipped += 1
                                logger.warning(
                                    "dispatch_pinned_ready_generation_deduped",
                                    generation_id=generation.id,
                                    account_id=account.id,
                                    free_slots=free_slots,
                                    wait_reason=wait_reason,
                                )
                                continue

                            await clear_generation_wait_metadata(arq_pool, generation.id)
                            generation.scheduled_at = None
                            generation.updated_at = now
                            await db.commit()
                            pinned_dispatched += 1
                            requeued += 1
                            logger.info(
                                "dispatch_pinned_ready_generation",
                                generation_id=generation.id,
                                account_id=account.id,
                                free_slots=free_slots,
                                wait_reason=wait_reason,
                            )
                        except Exception as e:
                            await db.rollback()
                            logger.error(
                                "dispatch_pinned_ready_generation_error",
                                generation_id=generation.id,
                                account_id=account.id,
                                error=str(e),
                            )
                            errors += 1

            # Find stale non-pinned PENDING generations by last update time (not created_at).
            # This avoids requeueing intentionally deferred retries that remain
            # in PENDING while waiting for their next scheduled attempt.
            threshold = now - timedelta(seconds=STALE_THRESHOLD_SECONDS)

            result = await db.execute(
                select(Generation)
                .where(Generation.status == GenerationStatus.PENDING)
                .where(Generation.preferred_account_id == None)
                .where(Generation.updated_at < threshold)
                .where(
                    (Generation.scheduled_at == None) |
                    (Generation.scheduled_at <= now)
                )
                .order_by(Generation.created_at)
                .limit(MAX_REQUEUE_PER_RUN)
            )
            stuck_generations = list(result.scalars().all())

            # Third pass: catch stale PINNED generations that Pass 1 missed.
            # Pass 1 only dispatches pinned gens whose preferred account has
            # capacity and is ACTIVE/EXHAUSTED.  If the account is disabled,
            # at full capacity, or on cooldown, the pinned gen is invisible
            # to both Pass 1 and Pass 2 and can get stuck forever.
            # Use a longer threshold (3 minutes) since pinned gens have
            # intentional short defers via _defer_pinned_generation.
            PINNED_STALE_THRESHOLD_SECONDS = 180
            pinned_threshold = now - timedelta(seconds=PINNED_STALE_THRESHOLD_SECONDS)
            pinned_stale_result = await db.execute(
                select(Generation)
                .where(Generation.status == GenerationStatus.PENDING)
                .where(Generation.preferred_account_id != None)
                .where(Generation.updated_at < pinned_threshold)
                .where(
                    (Generation.scheduled_at == None) |
                    (Generation.scheduled_at <= now)
                )
                .order_by(Generation.created_at)
                .limit(MAX_REQUEUE_PER_RUN)
            )
            stale_pinned = list(pinned_stale_result.scalars().all())
            if stale_pinned:
                stuck_generations.extend(stale_pinned)
                logger.info(
                    "requeue_found_stale_pinned",
                    count=len(stale_pinned),
                    generation_ids=[g.id for g in stale_pinned],
                )

            if not stuck_generations:
                logger.debug("requeue_idle", msg="No stuck pending generations found")
                return {"requeued": requeued, "pinned_dispatched": pinned_dispatched, "skipped": 0, "errors": errors}

            logger.info("requeue_found_stuck", count=len(stuck_generations))

            # Get ARQ pool for enqueueing stale non-pinned work
            try:
                arq_pool = await get_arq_pool()
            except Exception as e:
                logger.error("requeue_pool_error", error=str(e))
                return {
                    "requeued": requeued,
                    "pinned_dispatched": pinned_dispatched,
                    "skipped": skipped,
                    "errors": errors + len(stuck_generations),
                }

            for generation in stuck_generations:
                try:
                    # Check if already in queue (avoid duplicates)
                    # ARQ doesn't have a great way to check this, so we just requeue
                    # The job processor will skip if status changed

                    enqueue_result = await enqueue_generation_retry_job(arq_pool, generation.id)

                    if enqueue_result.get("deduped"):
                        logger.warning(
                            "requeue_generation_deduped",
                            generation_id=generation.id,
                            age_seconds=(datetime.now(timezone.utc) - generation.updated_at).total_seconds(),
                            age_basis="updated_at",
                        )
                        skipped += 1
                    else:
                        logger.info(
                            "requeue_generation",
                            generation_id=generation.id,
                            age_seconds=(datetime.now(timezone.utc) - generation.updated_at).total_seconds(),
                            age_basis="updated_at",
                        )
                        requeued += 1

                except Exception as e:
                    logger.error("requeue_generation_error",
                               generation_id=generation.id, error=str(e))
                    errors += 1

            stats = {
                "requeued": requeued,
                "pinned_dispatched": pinned_dispatched,
                "skipped": skipped,
                "errors": errors,
                "timestamp": now.isoformat()
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
