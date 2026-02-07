"""
Generation processor worker - executes pending generations

Processes generations created via GenerationService:
1. Select provider account
2. Submit generation to provider
3. Update generation status
"""
import os
from sqlalchemy.ext.asyncio import AsyncSession
from pixsim7.backend.main.domain import Generation
from pixsim7.backend.main.domain.providers import ProviderAccount
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
    ProviderContentFilteredError,
    ProviderRateLimitError,
    ProviderConcurrentLimitError,
)
from pixsim7.backend.main.shared.policies import (
    with_fallback,
    FallbackExhaustedError,
)

# Expected errors that don't need stack traces - these are business logic, not bugs
EXPECTED_ERRORS = (
    ProviderContentFilteredError,
    ProviderQuotaExceededError,
    ProviderRateLimitError,
    ProviderConcurrentLimitError,
    NoAccountAvailableError,
    AccountExhaustedError,
    AccountCooldownError,
)

# Errors that should NOT trigger ARQ retry - these are permanent failures
# (validation errors, configuration issues, etc. that won't be fixed by retry)
NON_RETRYABLE_ERROR_PATTERNS = (
    "requires at least one",  # Missing required params (image_url, video_url, etc.)
    "is required for",  # Missing required params
    "is not valid for",  # Invalid param format
    "must contain",  # Validation failure
    "has no resolvable",  # Asset resolution failure
    "needs to be re-uploaded",  # Asset needs manual intervention
    "invalid param",  # Provider rejected param as invalid (400 error)
    "invalid parameter",  # Alternative wording
    "too-long parameters",  # Prompt/param length exceeded (e.g. Pixverse 400018)
    "cannot exceed",  # Generic length limit exceeded
)


def _is_non_retryable_error(error: Exception) -> bool:
    """Check if an error should NOT be retried by ARQ.

    Primary path: use the structured `retryable` attribute on ProviderError.
    Fallback: string pattern matching for plain exceptions or legacy errors
    without structured attributes.
    """
    # Structured path: ProviderError subclasses carry .retryable
    if hasattr(error, 'retryable'):
        return not error.retryable

    # Fallback: string pattern matching for unstructured errors
    error_msg = str(error).lower()
    for pattern in NON_RETRYABLE_ERROR_PATTERNS:
        if pattern.lower() in error_msg:
            return True
    return False


def _extract_error_code(error: Exception) -> str | None:
    """Extract structured error_code from an exception, if available."""
    return getattr(error, 'error_code', None)


def _get_max_tries() -> int:
    """Get ARQ max_tries setting."""
    import os
    return int(os.getenv("ARQ_MAX_TRIES", "3"))


def _is_final_try(ctx: dict) -> bool:
    """Check if this is the final ARQ try (no more retries after this)."""
    job_try = ctx.get("job_try", 1)
    max_tries = _get_max_tries()
    return job_try >= max_tries


from pixsim7.backend.main.shared.debug import (
    DebugLogger,
    get_global_debug_logger,
    load_global_debug_from_env,
)
from pixsim7.backend.main.workers.health import get_health_tracker
from pixsim7.backend.main.infrastructure.events.redis_bridge import (
    start_event_bus_bridge,
    stop_event_bus_bridge,
)

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
    Credit types are determined dynamically from the provider's manifest/adapter
    via get_credit_types() instead of being hardcoded.
    """
    from pixsim7.backend.main.domain.providers.registry import registry

    try:
        provider = registry.get(account.provider_id)

        # Use get_credits (fast, no ad-task lookup)
        if hasattr(provider, 'get_credits'):
            credits_data = await provider.get_credits(account, retry_on_session_error=False)
        else:
            gen_logger.debug("provider_no_credits_method", provider_id=account.provider_id)
            return {}

        # Get valid credit types from provider (no longer hardcoded)
        valid_credit_types = set()
        if hasattr(provider, 'get_credit_types'):
            valid_credit_types = set(provider.get_credit_types())
        else:
            # Fallback for providers without get_credit_types()
            valid_credit_types = {'web', 'openapi', 'standard', 'usage'}

        # Update credits in database and build filtered result
        filtered_credits = {}
        if credits_data:
            for credit_type, amount in credits_data.items():
                if credit_type in valid_credit_types:
                    try:
                        await account_service.set_credit(account.id, credit_type, int(amount))
                        filtered_credits[credit_type] = int(amount)
                    except Exception as e:
                        gen_logger.warning("credit_update_failed", credit_type=credit_type, error=str(e))

            gen_logger.info("credits_refreshed", account_id=account.id, credits=filtered_credits)

        return filtered_credits

    except Exception as e:
        gen_logger.warning("credits_refresh_failed", account_id=account.id, error=str(e))
        return {}


def has_sufficient_credits(credits_data: dict, min_credits: int = 1) -> bool:
    """
    Check if account has any usable credits.

    Checks all credit types in credits_data. Returns True if any type has
    sufficient credits. This is provider-agnostic - works with any credit types.
    """
    if not credits_data:
        return False

    # Check if any credit type has sufficient credits
    for credit_type, amount in credits_data.items():
        try:
            if int(amount) >= min_credits:
                return True
        except (ValueError, TypeError):
            continue

    return False


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
            failed_marked = False
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
            from datetime import datetime, timezone
            if generation.scheduled_at and generation.scheduled_at > datetime.now(timezone.utc):
                gen_logger.info("generation_scheduled", scheduled_at=str(generation.scheduled_at))
                debug.worker("scheduled_in_future", scheduled_at=str(generation.scheduled_at))
                return {"status": "scheduled", "scheduled_for": str(generation.scheduled_at)}

            # Select and reserve account atomically (prevents race conditions)
            # If generation already has an account_id (from previous attempt), try to reuse it
            MAX_ACCOUNT_RETRIES = 10
            account = None

            # Try preferred account first (user-selected)
            if not account and getattr(generation, 'preferred_account_id', None) and not generation.account_id:
                try:
                    pref_account = await db.get(ProviderAccount, generation.preferred_account_id)
                    if pref_account and pref_account.is_available() and pref_account.provider_id == generation.provider_id:
                        await account_service.reserve_account(pref_account.id)
                        credits_data = await refresh_account_credits(pref_account, account_service, gen_logger)
                        if credits_data and has_sufficient_credits(credits_data):
                            account = pref_account
                            gen_logger.info("preferred_account_used", account_id=account.id)
                            debug.worker("preferred_account_used", account_id=account.id)
                        else:
                            await account_service.release_account(pref_account.id)
                            gen_logger.info("preferred_account_no_credits", account_id=pref_account.id)
                except Exception as e:
                    gen_logger.warning("preferred_account_failed", account_id=generation.preferred_account_id, error=str(e))

            # Try to reuse previous account on retry
            if generation.account_id:
                try:
                    prev_account = await db.get(ProviderAccount, generation.account_id)
                    if prev_account and prev_account.is_available():
                        # Try to reserve the same account
                        await account_service.reserve_account(prev_account.id)
                        credits_data = await refresh_account_credits(prev_account, account_service, gen_logger)
                        if credits_data and has_sufficient_credits(credits_data):
                            account = prev_account
                            gen_logger.info("account_reused", account_id=account.id, provider_id=generation.provider_id)
                            debug.worker("account_reused", account_id=account.id, provider_id=generation.provider_id)
                        else:
                            # Previous account has no credits, release and try another
                            await account_service.release_account(prev_account.id)
                            gen_logger.info("account_reuse_no_credits", account_id=prev_account.id)
                except Exception as e:
                    gen_logger.warning("account_reuse_failed", prev_account_id=generation.account_id, error=str(e))

            # If no account yet (first attempt or reuse failed), select a new one
            if not account:
                async def acquire_account():
                    """Select and reserve next account. Raises if pool empty."""
                    try:
                        acct = await account_service.select_and_reserve_account(
                            provider_id=generation.provider_id,
                            user_id=generation.user_id
                        )
                        return acct
                    except (NoAccountAvailableError, AccountCooldownError) as e:
                        gen_logger.warning("no_account_available", error=str(e), error_type=e.__class__.__name__)
                        debug.worker("no_account_available", error=str(e), error_type=e.__class__.__name__)
                        raise  # Propagate - no more accounts to try

                async def verify_credits(acct: ProviderAccount) -> bool:
                    """Check if account has sufficient credits."""
                    credits_data = await refresh_account_credits(acct, account_service, gen_logger)
                    return not (credits_data and not has_sufficient_credits(credits_data))

                async def reject_account(acct: ProviderAccount) -> None:
                    """Release and mark exhausted."""
                    gen_logger.warning("account_no_credits", account_id=acct.id)
                    debug.worker("account_no_credits", account_id=acct.id)
                    await account_service.release_account(acct.id)
                    await account_service.mark_exhausted(acct.id)

                try:
                    account = await with_fallback(
                        acquire=acquire_account,
                        verify=verify_credits,
                        on_reject=reject_account,
                        on_attempt=lambda n, a: (
                            gen_logger.info("account_selected", account_id=a.id, provider_id=generation.provider_id, attempt=n),
                            debug.worker("account_selected", account_id=a.id, provider_id=generation.provider_id, attempt=n),
                        ),
                        max_attempts=MAX_ACCOUNT_RETRIES,
                    )
                except FallbackExhaustedError:
                    gen_logger.error("all_accounts_exhausted", attempts=MAX_ACCOUNT_RETRIES)
                    debug.worker("all_accounts_exhausted", attempts=MAX_ACCOUNT_RETRIES)
                    raise AccountExhaustedError(0, generation.provider_id)

            # Save account_id on generation so UI can show which account is being used
            if generation.account_id != account.id:
                generation.account_id = account.id
                db.add(generation)
                await db.commit()
                await db.refresh(generation)

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

                # Credit tracking for Pixverse is now unified for both images and videos:
                # All credits are deducted on successful completion in the status poller.
                # This ensures failed/filtered generations don't charge credits.

                # Note: Credits refreshed before submission; status_poller refreshes on completion

                # Track successful generation
                get_health_tracker().increment_processed()

                return {
                    "status": "submitted",
                    "provider_job_id": submission.provider_job_id,
                    "generation_id": generation_id,
                }

            except ProviderError as e:
                # Log expected errors as warning, unexpected as error
                if isinstance(e, EXPECTED_ERRORS):
                    gen_logger.warning("provider:error", error=str(e), error_type=e.__class__.__name__)
                else:
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

                # Concurrent limit reached - put account in short cooldown and try different account
                elif isinstance(e, ProviderConcurrentLimitError):
                    # Put account in short cooldown (30 seconds) so it's not immediately reselected
                    try:
                        from datetime import timedelta
                        account.cooldown_until = datetime.now(timezone.utc) + timedelta(seconds=30)
                        await db.commit()
                        gen_logger.info(
                            "account_cooldown_concurrent_limit",
                            account_id=account.id,
                            cooldown_seconds=30,
                        )
                    except Exception as cooldown_err:
                        gen_logger.warning(
                            "account_cooldown_failed",
                            account_id=account.id,
                            error=str(cooldown_err),
                        )

                    # Release account reservation
                    try:
                        await account_service.release_account(account.id)
                    except Exception as release_err:
                        gen_logger.warning("account_release_failed", error=str(release_err))

                    # Clear account_id so job picks a different account on retry
                    generation.account_id = None

                    # Reset generation to PENDING and re-enqueue for different account
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
                            "generation_requeued_concurrent_limit",
                            generation_id=generation.id,
                            previous_account_id=account.id,
                        )

                        return {
                            "status": "requeued",
                            "reason": "account_concurrent_limit",
                            "generation_id": generation_id,
                        }
                    except Exception as requeue_err:
                        gen_logger.error(
                            "generation_requeue_failed",
                            error=str(requeue_err),
                            generation_id=generation.id,
                        )
                        # Fall through to mark as failed if requeue fails

                # Content filtered - retry only if retryable (output rejection, not prompt rejection)
                elif isinstance(e, ProviderContentFilteredError):
                    is_retryable = getattr(e, 'retryable', True)

                    if not is_retryable:
                        # Non-retryable (e.g., prompt rejected) - mark failed and DON'T re-raise
                        # This prevents ARQ from retrying
                        gen_logger.warning(
                            "content_filter_not_retryable",
                            generation_id=generation.id,
                            error=str(e),
                            error_code=_extract_error_code(e),
                        )
                        await generation_service.mark_failed(
                            generation_id, str(e), error_code=_extract_error_code(e),
                        )
                        try:
                            await account_service.release_account(account.id)
                        except Exception as release_err:
                            gen_logger.warning("account_release_failed", error=str(release_err))
                        # Return instead of raise to prevent ARQ retry
                        return {
                            "status": "failed",
                            "reason": "content_filtered_not_retryable",
                            "generation_id": generation_id,
                            "error": str(e),
                        }

                    # Retryable content filter (output rejection)
                    # Release account reservation
                    try:
                        await account_service.release_account(account.id)
                    except Exception as release_err:
                        gen_logger.warning("account_release_failed", error=str(release_err))

                    # Check retry count - don't retry forever
                    MAX_CONTENT_FILTER_RETRIES = 3
                    current_retries = getattr(generation, 'retry_count', 0) or 0

                    if current_retries < MAX_CONTENT_FILTER_RETRIES:
                        try:
                            from pixsim7.backend.main.infrastructure.redis import get_arq_pool

                            # Increment retry count and reset to pending
                            generation = await generation_service.increment_retry(generation.id)

                            arq_pool = await get_arq_pool()
                            await arq_pool.enqueue_job(
                                "process_generation",
                                generation_id=generation.id,
                            )

                            gen_logger.info(
                                "generation_requeued_content_filter_retry",
                                generation_id=generation.id,
                                retry_attempt=generation.retry_count,
                                max_retries=MAX_CONTENT_FILTER_RETRIES,
                            )

                            return {
                                "status": "requeued",
                                "reason": "content_filtered_retry",
                                "generation_id": generation_id,
                                "retry_attempt": generation.retry_count,
                            }
                        except Exception as requeue_err:
                            gen_logger.error(
                                "generation_requeue_failed",
                                error=str(requeue_err),
                                generation_id=generation.id,
                            )
                            # Fall through to mark as failed if requeue fails
                    else:
                        gen_logger.warning(
                            "content_filter_max_retries_exceeded",
                            generation_id=generation.id,
                            retry_count=current_retries,
                        )
                        # Fall through to mark as failed

                # Release account reservation on failure
                try:
                    await account_service.release_account(account.id)
                except Exception as release_err:
                    gen_logger.warning("account_release_failed", error=str(release_err))

                # Check if this error should NOT be retried
                is_non_retryable = _is_non_retryable_error(e)
                is_final = _is_final_try(ctx)

                # Only mark as failed (and emit JOB_FAILED event) on final attempt or non-retryable errors
                if is_final or is_non_retryable:
                    await generation_service.mark_failed(
                        generation_id, str(e), error_code=_extract_error_code(e),
                    )
                    failed_marked = True
                    gen_logger.info(
                        "generation_marked_failed",
                        is_final_try=is_final,
                        is_non_retryable=is_non_retryable,
                    )
                else:
                    gen_logger.info(
                        "generation_will_retry",
                        job_try=ctx.get("job_try", 1),
                        max_tries=_get_max_tries(),
                    )

                # Note: Credits not refreshed on failure - provider rejects before billing

                # Track failed generation
                get_health_tracker().increment_failed()

                # Don't raise for non-retryable errors - prevents ARQ retry
                if is_non_retryable:
                    return {
                        "status": "failed",
                        "reason": "non_retryable_error",
                        "generation_id": generation_id,
                        "error": str(e),
                    }

                raise

        except Exception as e:
            # Expected errors (content filtered, quota, etc) - warn without stack trace
            # Unexpected errors - error with full stack trace for debugging
            if isinstance(e, EXPECTED_ERRORS):
                gen_logger.warning(
                    "generation_processing_failed",
                    error=str(e),
                    error_type=e.__class__.__name__,
                )
            else:
                gen_logger.error(
                    "generation_processing_failed",
                    error=str(e),
                    error_type=e.__class__.__name__,
                    exc_info=True,
                )
            worker_debug.worker(
                "generation_processing_failed",
                error=str(e),
                error_type=e.__class__.__name__,
                generation_id=generation_id,
            )

            # Track failed generation
            get_health_tracker().increment_failed()

            # Check if this error should NOT be retried
            is_non_retryable = _is_non_retryable_error(e)
            is_final = _is_final_try(ctx)

            # Try to mark generation as failed - only on final attempt or non-retryable errors
            if not failed_marked and (is_final or is_non_retryable):
                try:
                    await generation_service.mark_failed(
                        generation_id, str(e), error_code=_extract_error_code(e),
                    )
                except Exception as mark_error:
                    gen_logger.error("mark_failed_error", error=str(mark_error))

            # Don't raise for non-retryable errors - prevents ARQ retry
            if is_non_retryable:
                return {
                    "status": "failed",
                    "reason": "non_retryable_error",
                    "generation_id": generation_id,
                    "error": str(e),
                }

            raise

        finally:
            # Close DB session
            await db.close()


_event_bridge = None


async def on_startup(ctx: dict) -> None:
    """ARQ worker startup"""
    global _event_bridge
    logger.info("worker_started", component="generation_processor")
    _event_bridge = await start_event_bus_bridge(role="generation_processor")


async def on_shutdown(ctx: dict) -> None:
    """ARQ worker shutdown"""
    global _event_bridge
    logger.info("worker_shutdown", component="generation_processor")
    if _event_bridge:
        await stop_event_bus_bridge()
        _event_bridge = None


# ARQ task configuration
class WorkerSettings:
    """ARQ worker settings for generation processor"""
    functions = [process_generation]
    on_startup = on_startup
    on_shutdown = on_shutdown
    redis_settings = "redis://localhost:6379/0"  # Will be overridden by env
