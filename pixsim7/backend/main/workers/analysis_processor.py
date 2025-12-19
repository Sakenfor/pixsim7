"""
Analysis processor worker - executes pending asset analyses

Processes analyses created via AnalysisService:
1. Select provider account
2. Submit analysis to provider
3. Update analysis status

Mirrors the generation processor pattern for consistency.
"""
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.providers import ProviderAccount
from pixsim7.backend.main.domain.assets.analysis import AssetAnalysis, AnalysisStatus
from pixsim7.backend.main.services.analysis import AnalysisService
from pixsim7.backend.main.services.account import AccountService
from pixsim7.backend.main.services.provider import ProviderService
from pixsim7.backend.main.services.user import UserService
from pixsim7.backend.main.infrastructure.database.session import get_db
from pixsim7.backend.main.shared.errors import (
    NoAccountAvailableError,
    AccountCooldownError,
    AccountExhaustedError,
    ProviderError,
)
from pixsim7.backend.main.shared.debug import (
    DebugLogger,
    get_global_debug_logger,
    load_global_debug_from_env,
)
from pixsim7.backend.main.workers.health import get_health_tracker

from pixsim_logging import configure_logging, bind_job_context

_base_logger = None
_worker_debug_initialized = False


def _get_worker_logger():
    """Get or initialize worker logger."""
    global _base_logger
    if _base_logger is None:
        _base_logger = configure_logging("worker")
    return _base_logger


def _init_worker_debug_flags() -> None:
    """Initialize global worker debug flags from environment."""
    global _worker_debug_initialized
    if _worker_debug_initialized:
        return
    load_global_debug_from_env()
    _worker_debug_initialized = True


logger = _get_worker_logger()


async def process_analysis(ctx: dict, analysis_id: int) -> dict:
    """
    Process a single asset analysis.

    This is the main ARQ task that gets queued when an analysis is created.

    Args:
        ctx: ARQ worker context
        analysis_id: ID of the analysis to process

    Returns:
        dict with status and message
    """
    _init_worker_debug_flags()

    analysis_logger = bind_job_context(logger, job_id=f"analysis-{analysis_id}")
    analysis_logger.info("pipeline:start", msg="analysis_processing_started")

    worker_debug = get_global_debug_logger()
    worker_debug.worker("process_analysis_start", analysis_id=analysis_id)

    async for db in get_db():
        try:
            user_service = UserService(db)
            analysis_service = AnalysisService(db)
            account_service = AccountService(db)
            provider_service = ProviderService(db)

            analysis = await analysis_service.get_analysis(analysis_id)

            # Per-user debug logger
            user = await user_service.get_user(analysis.user_id)
            debug = DebugLogger(user)
            debug.worker("loaded_analysis", analysis_id=analysis.id, status=str(analysis.status))

            # Normalize status comparison
            status_value = analysis.status.value if hasattr(analysis.status, 'value') else str(analysis.status)
            if status_value != "pending":
                analysis_logger.warning("analysis_not_pending", status=status_value)
                return {"status": "skipped", "reason": f"Analysis status is {status_value}"}

            # Select and reserve account atomically
            MAX_ACCOUNT_RETRIES = 10
            account = None

            for attempt in range(MAX_ACCOUNT_RETRIES):
                try:
                    account = await account_service.select_and_reserve_account(
                        provider_id=analysis.provider_id,
                        user_id=analysis.user_id
                    )
                    analysis_logger.info(
                        "account_selected",
                        account_id=account.id,
                        provider_id=analysis.provider_id,
                        attempt=attempt + 1
                    )
                    debug.worker(
                        "account_selected",
                        account_id=account.id,
                        provider_id=analysis.provider_id,
                        attempt=attempt + 1
                    )
                    break  # Got an account

                except (NoAccountAvailableError, AccountCooldownError) as e:
                    analysis_logger.warning(
                        "no_account_available",
                        error=str(e),
                        error_type=e.__class__.__name__,
                        attempt=attempt + 1
                    )
                    debug.worker(
                        "no_account_available",
                        error=str(e),
                        error_type=e.__class__.__name__,
                        attempt=attempt + 1
                    )
                    raise

            if not account:
                analysis_logger.error("all_accounts_exhausted", attempts=MAX_ACCOUNT_RETRIES)
                debug.worker("all_accounts_exhausted", attempts=MAX_ACCOUNT_RETRIES)
                raise AccountExhaustedError(0, analysis.provider_id)

            # Mark analysis as started
            await analysis_service.mark_started(analysis_id)
            analysis_logger.info("analysis_started")
            debug.worker("analysis_started", analysis_id=analysis_id)

            # Execute analysis via provider
            try:
                submission = await provider_service.execute_analysis(
                    analysis=analysis,
                    account=account,
                )

                analysis_logger.info(
                    "provider:submit",
                    provider_job_id=submission.provider_job_id,
                    account_id=account.id,
                    msg="analysis_submitted_to_provider"
                )
                debug.provider(
                    "provider_submit",
                    provider_id=analysis.provider_id,
                    provider_job_id=submission.provider_job_id,
                    account_id=account.id,
                )

                # Track successful submission
                get_health_tracker().increment_processed()

                return {
                    "status": "submitted",
                    "provider_job_id": submission.provider_job_id,
                    "analysis_id": analysis_id,
                }

            except ProviderError as e:
                analysis_logger.error(
                    "provider:error",
                    error=str(e),
                    error_type=e.__class__.__name__
                )
                debug.provider(
                    "provider_error",
                    error=str(e),
                    error_type=e.__class__.__name__,
                    analysis_id=analysis_id,
                )
                await analysis_service.mark_failed(analysis_id, str(e))

                # Release account reservation on failure
                try:
                    await account_service.release_account(account.id)
                except Exception as release_err:
                    analysis_logger.warning("account_release_failed", error=str(release_err))

                # Track failed analysis
                get_health_tracker().increment_failed()

                raise

        except Exception as e:
            analysis_logger.error(
                "analysis_processing_failed",
                error=str(e),
                error_type=e.__class__.__name__,
                exc_info=True
            )
            worker_debug.worker(
                "analysis_processing_failed",
                error=str(e),
                error_type=e.__class__.__name__,
                analysis_id=analysis_id,
            )

            # Track failed analysis
            get_health_tracker().increment_failed()

            # Try to mark analysis as failed
            try:
                await analysis_service.mark_failed(analysis_id, str(e))
            except Exception as mark_error:
                analysis_logger.error("mark_failed_error", error=str(mark_error))

            raise

        finally:
            await db.close()


async def requeue_pending_analyses(ctx: dict) -> dict:
    """
    Re-queue stuck PENDING analyses.

    Similar to requeue_pending_generations, finds analyses that have been
    pending for too long and re-enqueues them.
    """
    from datetime import timedelta
    from sqlalchemy import select
    from pixsim7.backend.main.infrastructure.redis import get_arq_pool

    STALE_THRESHOLD_SECONDS = 60
    MAX_REQUEUE_PER_RUN = 10

    requeued = 0
    errors = 0

    async for db in get_db():
        try:
            threshold = datetime.utcnow() - timedelta(seconds=STALE_THRESHOLD_SECONDS)

            result = await db.execute(
                select(AssetAnalysis)
                .where(AssetAnalysis.status == AnalysisStatus.PENDING)
                .where(AssetAnalysis.created_at < threshold)
                .order_by(AssetAnalysis.created_at)
                .limit(MAX_REQUEUE_PER_RUN)
            )
            stuck_analyses = list(result.scalars().all())

            if not stuck_analyses:
                logger.debug("requeue_analyses_idle", msg="No stuck pending analyses found")
                return {"requeued": 0, "errors": 0}

            logger.info("requeue_analyses_found_stuck", count=len(stuck_analyses))

            try:
                arq_pool = await get_arq_pool()
            except Exception as e:
                logger.error("requeue_analyses_pool_error", error=str(e))
                return {"requeued": 0, "errors": len(stuck_analyses)}

            for analysis in stuck_analyses:
                try:
                    await arq_pool.enqueue_job(
                        "process_analysis",
                        analysis_id=analysis.id,
                    )
                    logger.info(
                        "requeue_analysis",
                        analysis_id=analysis.id,
                        age_seconds=(datetime.utcnow() - analysis.created_at).total_seconds()
                    )
                    requeued += 1
                except Exception as e:
                    logger.error("requeue_analysis_error", analysis_id=analysis.id, error=str(e))
                    errors += 1

            stats = {
                "requeued": requeued,
                "errors": errors,
                "timestamp": datetime.utcnow().isoformat()
            }

            logger.info("requeue_analyses_complete", **stats)
            return stats

        except Exception as e:
            logger.error("requeue_analyses_error", error=str(e), exc_info=True)
            raise

        finally:
            await db.close()
