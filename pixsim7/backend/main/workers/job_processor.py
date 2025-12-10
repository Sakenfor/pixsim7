"""
Generation processor worker - executes pending generations

Processes generations created via GenerationService:
1. Select provider account
2. Submit generation to provider
3. Update generation status
"""
import os
from sqlalchemy.ext.asyncio import AsyncSession
from pixsim7.backend.main.domain import Generation, ProviderAccount
from pixsim7.backend.main.services.generation import GenerationService
from pixsim7.backend.main.services.account import AccountService
from pixsim7.backend.main.services.provider import ProviderService
from pixsim7.backend.main.services.user import UserService
from pixsim7.backend.main.infrastructure.database.session import get_db
from pixsim7.backend.main.shared.errors import (
    NoAccountAvailableError,
    AccountCooldownError,
    AccountExhaustedError,
    ProviderError,
    ProviderQuotaExceededError,
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
    """
    Initialize global worker debug flags from environment.

    This allows enabling worker debug without user context via
    PIXSIM_WORKER_DEBUG (e.g. 'generation,provider,worker').
    """
    global _worker_debug_initialized
    if _worker_debug_initialized:
        return
    load_global_debug_from_env()
    _worker_debug_initialized = True


logger = _get_worker_logger()


async def refresh_account_credits(
    account: ProviderAccount,
    account_service: AccountService,
    gen_logger,
) -> dict:
    """
    Refresh credits for an account from the provider.

    Returns dict with credit amounts, or empty dict on failure.
    """
    from pixsim7.backend.main.services.provider.registry import registry

    try:
        provider = registry.get(account.provider_id)

        # Use get_credits_basic (faster, no ad-task lookup)
        if hasattr(provider, 'get_credits_basic'):
            credits_data = await provider.get_credits_basic(account, retry_on_session_error=False)
        elif hasattr(provider, 'get_credits'):
            credits_data = await provider.get_credits(account)
        else:
            gen_logger.debug("provider_no_credits_method", provider_id=account.provider_id)
            return {}

        # Update credits in database
        if credits_data:
            for credit_type, amount in credits_data.items():
                if credit_type in ('web', 'webapi', 'openapi', 'standard'):
                    # Map 'web' to 'webapi' for consistency
                    db_credit_type = 'webapi' if credit_type == 'web' else credit_type
                    try:
                        await account_service.set_credit(account.id, db_credit_type, int(amount))
                    except Exception as e:
                        gen_logger.warning("credit_update_failed", credit_type=db_credit_type, error=str(e))

            gen_logger.info("credits_refreshed", account_id=account.id, credits=credits_data)

        return credits_data or {}

    except Exception as e:
        gen_logger.warning("credits_refresh_failed", account_id=account.id, error=str(e))
        return {}


def has_sufficient_credits(credits_data: dict, min_credits: int = 1) -> bool:
    """Check if account has any usable credits."""
    # Check web/webapi credits (free tier)
    web = credits_data.get('web', 0) or credits_data.get('webapi', 0)
    # Check openapi credits (paid tier)
    openapi = credits_data.get('openapi', 0)

    return (web >= min_credits) or (openapi >= min_credits)


async def process_generation(ctx: dict, generation_id: int) -> dict:
    """
    Process a single generation.

    This is the main ARQ task that gets queued when a generation is created.

    Args:
        ctx: ARQ worker context
        generation_id: ID of the generation to process

    Returns:
        dict with status and message
    """
    _init_worker_debug_flags()

    gen_logger = bind_job_context(logger, job_id=generation_id)
    gen_logger.info("pipeline:start", msg="generation_processing_started")

    # Global worker debug logger (no user context yet)
    worker_debug = get_global_debug_logger()
    worker_debug.worker("process_generation_start", generation_id=generation_id)

    async for db in get_db():
        try:
            user_service = UserService(db)
            generation_service = GenerationService(db, user_service)
            account_service = AccountService(db)
            provider_service = ProviderService(db)

            generation = await generation_service.get_generation(generation_id)

            # Per-user debug logger once we have the user
            user = await user_service.get_user(generation.user_id)
            debug = DebugLogger(user)
            debug.worker("loaded_generation", generation_id=generation.id, status=str(generation.status))

            if generation.status != "pending":
                gen_logger.warning("generation_not_pending", status=generation.status)
                return {"status": "skipped", "reason": f"Generation status is {generation.status}"}

            # Check if scheduled for later
            from datetime import datetime
            if generation.scheduled_at and generation.scheduled_at > datetime.utcnow():
                gen_logger.info("generation_scheduled", scheduled_at=str(generation.scheduled_at))
                debug.worker("scheduled_in_future", scheduled_at=str(generation.scheduled_at))
                return {"status": "scheduled", "scheduled_for": str(generation.scheduled_at)}

            # Select and reserve account atomically (prevents race conditions)
            # Retry up to 10 times to find an account with credits
            MAX_ACCOUNT_RETRIES = 10
            account = None

            for attempt in range(MAX_ACCOUNT_RETRIES):
                try:
                    account = await account_service.select_and_reserve_account(
                        provider_id=generation.provider_id,
                        user_id=generation.user_id
                    )
                    gen_logger.info("account_selected", account_id=account.id, provider_id=generation.provider_id, attempt=attempt + 1)
                    debug.worker("account_selected", account_id=account.id, provider_id=generation.provider_id, attempt=attempt + 1)
                except (NoAccountAvailableError, AccountCooldownError) as e:
                    gen_logger.warning("no_account_available", error=str(e), error_type=e.__class__.__name__, attempt=attempt + 1)
                    debug.worker("no_account_available", error=str(e), error_type=e.__class__.__name__, attempt=attempt + 1)
                    # No more accounts to try - let ARQ retry later
                    raise

                # Refresh credits BEFORE generation to verify account has credits
                credits_data = await refresh_account_credits(account, account_service, gen_logger)
                if credits_data and not has_sufficient_credits(credits_data):
                    gen_logger.warning("account_no_credits", account_id=account.id, credits=credits_data, attempt=attempt + 1)
                    debug.worker("account_no_credits", account_id=account.id, credits=credits_data, attempt=attempt + 1)
                    # Release this account and mark as exhausted, then try another
                    await account_service.release_account(account.id)
                    await account_service.mark_exhausted(account.id)
                    account = None
                    continue  # Try next account

                # Found an account with credits
                break

            if not account:
                gen_logger.error("all_accounts_exhausted", attempts=MAX_ACCOUNT_RETRIES)
                debug.worker("all_accounts_exhausted", attempts=MAX_ACCOUNT_RETRIES)
                raise AccountExhaustedError(0, generation.provider_id)

            # Mark generation as started
            await generation_service.mark_started(generation_id)
            gen_logger.info("generation_started")
            debug.worker("generation_started", generation_id=generation_id)

            # Execute generation via provider
            try:
                submission = await provider_service.execute_generation(
                    generation=generation,
                    account=account,
                    params=generation.canonical_params or generation.raw_params,
                )

                # Note: Concurrency was already incremented by select_and_reserve_account

                gen_logger.info(
                    "provider:submit",
                    provider_job_id=submission.provider_job_id,
                    account_id=account.id,
                    msg="generation_submitted_to_provider"
                )
                debug.provider(
                    "provider_submit",
                    provider_id=generation.provider_id,
                    provider_job_id=submission.provider_job_id,
                    account_id=account.id,
                )

                # Best-effort local credit tracking for Pixverse images.
                # For image operations we deduct credits on attempt (submission),
                # while video credits are handled on successful completion in the
                # status poller (provider refunds failed videos).
                try:
                    from pixsim7.backend.main.domain.enums import OperationType as OpType
                    from pixsim7.backend.main.services.generation.pixverse_pricing import (
                        get_image_credit_change,
                    )

                    if generation.provider_id == "pixverse":
                        params = generation.canonical_params or generation.raw_params or {}
                        model = params.get("model") or "v5"
                        quality = params.get("quality") or "360p"
                        credits: int | None = None

                        # Image operations: static table, deduct on attempt
                        if generation.operation_type in {OpType.TEXT_TO_IMAGE, OpType.IMAGE_TO_IMAGE}:
                            credits = get_image_credit_change(str(model), str(quality)) or None

                        if credits and credits > 0:
                            try:
                                await account_service.deduct_credit(account.id, "webapi", credits)
                                gen_logger.info(
                                    "account_credit_deducted",
                                    account_id=account.id,
                                    provider_id=generation.provider_id,
                                    credits=credits,
                                    operation_type=generation.operation_type.value,
                                )
                            except Exception as credit_err:
                                gen_logger.warning(
                                    "account_credit_deduct_failed",
                                    account_id=account.id,
                                    provider_id=generation.provider_id,
                                    error=str(credit_err),
                                )
                except Exception as credit_calc_err:
                    gen_logger.debug(
                        "account_credit_estimate_failed",
                        error=str(credit_calc_err),
                    )

                # Note: Credits refreshed before submission; status_poller refreshes on completion

                # Track successful generation
                get_health_tracker().increment_processed()

                return {
                    "status": "submitted",
                    "provider_job_id": submission.provider_job_id,
                    "generation_id": generation_id,
                }

            except ProviderError as e:
                gen_logger.error("provider:error", error=str(e), error_type=e.__class__.__name__)
                debug.provider(
                    "provider_error",
                    error=str(e),
                    error_type=e.__class__.__name__,
                    generation_id=generation_id,
                )

                # If provider reports quota exhaustion for this account,
                # mark the account as exhausted and retry with a different account.
                if isinstance(e, ProviderQuotaExceededError):
                    try:
                        await account_service.mark_exhausted(account.id)
                        gen_logger.warning(
                            "account_marked_exhausted_due_to_provider_quota",
                            account_id=account.id,
                            provider_id=generation.provider_id,
                        )
                    except Exception as mark_err:
                        gen_logger.warning(
                            "account_mark_exhausted_failed",
                            account_id=account.id,
                            error=str(mark_err),
                        )

                    # Release account reservation
                    try:
                        await account_service.release_account(account.id)
                    except Exception as release_err:
                        gen_logger.warning("account_release_failed", error=str(release_err))

                    # Reset generation to PENDING and re-enqueue so it picks a different account
                    # Don't mark as failed - we want to try again with another account
                    try:
                        from pixsim7.backend.main.infrastructure.redis import get_arq_pool
                        from pixsim7.backend.main.domain.enums import GenerationStatus as GenStatus

                        generation.status = GenStatus.PENDING
                        generation.started_at = None
                        await db.commit()
                        await db.refresh(generation)

                        arq_pool = await get_arq_pool()
                        await arq_pool.enqueue_job(
                            "process_generation",
                            generation_id=generation.id,
                        )

                        gen_logger.info(
                            "generation_requeued_for_different_account",
                            generation_id=generation.id,
                            exhausted_account_id=account.id,
                        )

                        return {
                            "status": "requeued",
                            "reason": "account_quota_exhausted",
                            "generation_id": generation_id,
                        }
                    except Exception as requeue_err:
                        gen_logger.error(
                            "generation_requeue_failed",
                            error=str(requeue_err),
                            generation_id=generation.id,
                        )
                        # Fall through to mark as failed if requeue fails

                await generation_service.mark_failed(generation_id, str(e))

                # Release account reservation on failure
                try:
                    await account_service.release_account(account.id)
                except Exception as release_err:
                    gen_logger.warning("account_release_failed", error=str(release_err))

                # Note: Credits not refreshed on failure - provider rejects before billing

                # Track failed generation
                get_health_tracker().increment_failed()

                raise

        except Exception as e:
            gen_logger.error("generation_processing_failed", error=str(e), error_type=e.__class__.__name__, exc_info=True)
            worker_debug.worker(
                "generation_processing_failed",
                error=str(e),
                error_type=e.__class__.__name__,
                generation_id=generation_id,
            )

            # Track failed generation
            get_health_tracker().increment_failed()

            # Try to mark generation as failed
            try:
                await generation_service.mark_failed(generation_id, str(e))
            except Exception as mark_error:
                gen_logger.error("mark_failed_error", error=str(mark_error))

            raise

        finally:
            # Close DB session
            await db.close()


async def on_startup(ctx: dict) -> None:
    """ARQ worker startup"""
    logger.info("worker_started", component="generation_processor")


async def on_shutdown(ctx: dict) -> None:
    """ARQ worker shutdown"""
    logger.info("worker_shutdown", component="generation_processor")


# ARQ task configuration
class WorkerSettings:
    """ARQ worker settings for generation processor"""
    functions = [process_generation]
    on_startup = on_startup
    on_shutdown = on_shutdown
    redis_settings = "redis://localhost:6379/0"  # Will be overridden by env
