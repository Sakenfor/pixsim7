"""
Generation processor worker - executes pending generations

Processes generations created via GenerationService:
1. Select provider account
2. Submit generation to provider
3. Update generation status
"""
import asyncio
import os
import random
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from pixsim7.backend.main.domain import Generation
from pixsim7.backend.main.domain.providers import ProviderAccount
from pixsim7.backend.main.services.generation import GenerationService
from pixsim7.backend.main.services.account import AccountService
from pixsim7.backend.main.services.provider import ProviderService
from pixsim7.backend.main.services.user import UserService
from pixsim7.backend.main.infrastructure.database.session import get_db
from pixsim7.backend.main.infrastructure.queue import (
    clear_generation_wait_metadata,
    enqueue_generation_retry_job,
    GENERATION_RETRY_QUEUE_NAME,
    release_generation_enqueue_lease,
    set_generation_wait_metadata,
)
from pixsim7.backend.main.shared.errors import (
    NoAccountAvailableError,
    AccountCooldownError,
    AccountExhaustedError,
    ProviderError,
    ProviderAuthenticationError,
    ProviderQuotaExceededError,
    ProviderContentFilteredError,
    ProviderRateLimitError,
    ProviderConcurrentLimitError,
)
from pixsim7.backend.main.shared.policies import (
    with_fallback,
    FallbackExhaustedError,
)
from pixsim7.backend.main.shared.policies.content_filter_retry import (
    MAX_SUBMIT_CONTENT_FILTER_RETRIES,
    should_rotate_content_filter_account,
    should_yield_pinned_content_filter_retry,
    content_filter_yield_defer_seconds,
    content_filter_yield_counts_as_retry,
    content_filter_max_yields,
    try_acquire_content_filter_yield,
    reset_content_filter_yield_counter,
)

# Expected errors that don't need stack traces - these are business logic, not bugs
EXPECTED_ERRORS = (
    ProviderAuthenticationError,
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

# Cooldown applied when an account fails authentication/session checks.
# This gives a chance for manual re-auth while allowing other accounts to run.
AUTH_FAILURE_COOLDOWN_SECONDS = 300

# Cooldown applied when an account hits its concurrent job limit.
CONCURRENT_COOLDOWN_SECONDS = 30
PIXVERSE_CONCURRENT_COOLDOWN_SECONDS = int(
    os.getenv("PIXVERSE_CONCURRENT_COOLDOWN_SECONDS", "6")
)
PIXVERSE_I2I_CONCURRENT_COOLDOWN_SECONDS = int(
    os.getenv("PIXVERSE_I2I_CONCURRENT_COOLDOWN_SECONDS", "2")
)
NO_ACCOUNT_AVAILABLE_DEFER_SECONDS = 10
DISPATCH_STAGGER_PER_SLOT_SECONDS = float(os.getenv("DISPATCH_STAGGER_PER_SLOT_SECONDS", "1.5"))
MAX_DISPATCH_STAGGER_SECONDS = float(os.getenv("DISPATCH_STAGGER_MAX_SECONDS", "12"))
PINNED_WAIT_PADDING_SECONDS = int(os.getenv("PINNED_WAIT_PADDING_SECONDS", "1"))
MIN_PINNED_COOLDOWN_DEFER_SECONDS = int(os.getenv("MIN_PINNED_COOLDOWN_DEFER_SECONDS", "2"))

# Max times a pinned-account generation will be deferred waiting for a
# concurrent slot before giving up.
MAX_PINNED_CONCURRENT_RETRIES = 12

# After this fraction of MAX_PINNED_CONCURRENT_RETRIES, a generation will
# check for siblings (other pending generations targeting the same account)
# and yield by using a longer defer if any exist.
PINNED_YIELD_THRESHOLD_RATIO = 0.5
PINNED_YIELD_DEFER_MULTIPLIER = 3


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


def _is_auth_rotation_error(error: Exception) -> bool:
    """
    Return True when a provider error should rotate to a different account.

    Covers structured auth errors plus Pixverse session-invalid signals that may
    surface as generic ProviderError messages.
    """
    if isinstance(error, ProviderAuthenticationError):
        return True

    error_code = _extract_error_code(error)
    if error_code == "provider_auth":
        return True

    message = str(error).lower()
    session_markers = (
        "10005",
        "10003",
        "10002",
        "logged in elsewhere",
        "logged_elsewhere",
        "user is not login",
        "token is expired",
        "session expired",
        "authentication failed for provider",
    )
    return any(marker in message for marker in session_markers)


def _is_pinned_account(generation: Generation, account: ProviderAccount) -> bool:
    """Return True when the account is the user's explicitly-pinned choice."""
    pref = getattr(generation, 'preferred_account_id', None)
    return pref is not None and pref == account.id


def _get_operation_value(generation: Generation) -> str | None:
    op = getattr(generation, "operation_type", None)
    if op is None:
        return None
    return getattr(op, "value", str(op))


def _get_concurrent_limit_cooldown_seconds(
    generation: Generation,
    account: ProviderAccount,
) -> int:
    """Return provider/operation-specific cooldown after concurrent-limit submit failures."""
    provider_id = str(getattr(account, "provider_id", "") or "").lower()
    operation_type = (_get_operation_value(generation) or "").lower()

    if provider_id == "pixverse" and operation_type == "image_to_image":
        return max(1, PIXVERSE_I2I_CONCURRENT_COOLDOWN_SECONDS)
    if provider_id == "pixverse":
        return max(1, PIXVERSE_CONCURRENT_COOLDOWN_SECONDS)

    return CONCURRENT_COOLDOWN_SECONDS


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
        _base_logger = configure_logging("worker").bind(channel="pipeline")
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


def is_unlimited_model(account: ProviderAccount, model: str | None) -> bool:
    """Check if the model is in the account's unlimited image models list.

    Unlimited models (e.g. qwen-image on Pro plans) don't consume credits,
    so credit checks should be bypassed for them.
    """
    if not model or not account.provider_metadata:
        return False
    unlimited = account.provider_metadata.get("plan_unlimited_image_models", [])
    return model in unlimited


async def _release_account_reservation(
    *,
    account_service: AccountService,
    account_id: int,
    gen_logger,
) -> None:
    """Best-effort account release helper used across failure paths."""
    try:
        await account_service.release_account(account_id)
    except Exception as release_err:
        gen_logger.warning("account_release_failed", error=str(release_err))


async def _apply_account_cooldown(
    *,
    db: AsyncSession,
    account: ProviderAccount,
    cooldown_seconds: int,
    gen_logger,
    event_name: str,
    error_code: str | None = None,
) -> None:
    """Apply account cooldown and log outcome."""
    try:
        account.cooldown_until = datetime.now(timezone.utc) + timedelta(
            seconds=cooldown_seconds,
        )
        await db.commit()
        payload = {
            "account_id": account.id,
            "cooldown_seconds": cooldown_seconds,
        }
        if error_code:
            payload["error_code"] = error_code
        gen_logger.info(event_name, **payload)
    except Exception as cooldown_err:
        gen_logger.warning(
            "account_cooldown_failed",
            account_id=account.id,
            error=str(cooldown_err),
        )


async def _requeue_generation_for_account_rotation(
    *,
    db: AsyncSession,
    generation: Generation,
    generation_id: int,
    failed_account_id: int,
    reason: str,
    log_event: str,
    account_log_field: str,
    gen_logger,
    clear_preferred_on_account_match: bool = False,
    error_code: str | None = None,
    increment_retry: bool = False,
) -> dict | None:
    """
    Reset generation state and enqueue it to retry with a different account.

    Returns requeue payload on success; returns None if enqueue fails so caller
    can fall through to standard failure handling.
    """
    cleared_preferred = False
    generation.account_id = None
    if (
        clear_preferred_on_account_match
        and generation.preferred_account_id == failed_account_id
    ):
        generation.preferred_account_id = None
        cleared_preferred = True

    try:
        from pixsim7.backend.main.infrastructure.redis import get_arq_pool
        from pixsim7.backend.main.domain.enums import GenerationStatus as GenStatus

        if increment_retry:
            generation.retry_count = (generation.retry_count or 0) + 1
        generation.status = GenStatus.PENDING
        generation.started_at = None
        await db.commit()
        await db.refresh(generation)

        arq_pool = await get_arq_pool()
        enqueue_result = await enqueue_generation_retry_job(arq_pool, generation.id)

        payload = {
            "generation_id": generation.id,
            account_log_field: failed_account_id,
            "enqueue_deduped": bool(enqueue_result.get("deduped")),
        }
        if clear_preferred_on_account_match:
            payload["cleared_preferred_account"] = cleared_preferred
        if error_code:
            payload["error_code"] = error_code
        if increment_retry:
            payload["retry_attempt"] = generation.retry_count
        gen_logger.info(log_event, **payload)

        result = {
            "status": "requeued",
            "reason": reason,
            "generation_id": generation_id,
        }
        if increment_retry:
            result["retry_attempt"] = generation.retry_count
        return result
    except Exception as requeue_err:
        gen_logger.error(
            "generation_requeue_failed",
            error=str(requeue_err),
            generation_id=generation.id,
        )
        return None


async def _defer_pinned_generation(
    *,
    db: AsyncSession,
    generation: Generation,
    generation_id: int,
    account_id: int,
    defer_seconds: int,
    reason: str,
    gen_logger,
    increment_retry: bool = True,
) -> dict | None:
    """
    Reset a pinned generation to PENDING and hold it for account-dispatch.

    Used when the pinned account is temporarily at capacity (concurrent limit)
    or on cooldown.  Set ``increment_retry=False`` for passive cooldown waits
    that shouldn't count against the retry budget.

    Returns defer payload on success; None on failure so the caller can fall
    through to standard failure handling.
    """
    try:
        from pixsim7.backend.main.domain.enums import GenerationStatus as GenStatus

        if increment_retry:
            generation.retry_count = (generation.retry_count or 0) + 1
        now = datetime.now(timezone.utc)
        generation.status = GenStatus.PENDING
        generation.started_at = None
        generation.account_id = None
        generation.scheduled_at = now + timedelta(seconds=defer_seconds)
        generation.updated_at = now
        await db.commit()
        await db.refresh(generation)

        logged_defer_seconds = defer_seconds
        try:
            from pixsim7.backend.main.infrastructure.redis import get_arq_pool

            arq_pool = await get_arq_pool()
            await set_generation_wait_metadata(
                arq_pool,
                generation.id,
                reason=reason,
                account_id=account_id,
                next_attempt_at=generation.scheduled_at,
                source="job_processor",
            )
        except Exception:
            gen_logger.debug(
                "generation_wait_meta_set_failed",
                generation_id=generation.id,
                account_id=account_id,
                reason=reason,
                exc_info=True,
            )

        # Safety-net deferred enqueue: ensures the generation is revisited even
        # if no account release wake sees it promptly after `scheduled_at`
        # expires. We intentionally release the enqueue lease immediately after
        # scheduling so an earlier capacity wake can still preempt this timer.
        try:
            from pixsim7.backend.main.infrastructure.redis import get_arq_pool

            arq_pool = await get_arq_pool()
            enqueue_result = await enqueue_generation_retry_job(
                arq_pool,
                generation.id,
                defer_seconds=defer_seconds,
            )
            if enqueue_result.get("enqueued"):
                await release_generation_enqueue_lease(arq_pool, generation.id)
            gen_logger.debug(
                "generation_deferred_pinned_safety_enqueued",
                generation_id=generation.id,
                account_id=account_id,
                defer_seconds=defer_seconds,
                actual_defer_seconds=enqueue_result.get("actual_defer_seconds"),
                enqueue_deduped=bool(enqueue_result.get("deduped")),
                lease_released_for_early_wake=bool(enqueue_result.get("enqueued")),
                target_queue=GENERATION_RETRY_QUEUE_NAME,
            )
        except Exception:
            gen_logger.debug(
                "generation_deferred_pinned_safety_enqueue_failed",
                generation_id=generation.id,
                account_id=account_id,
                reason=reason,
                exc_info=True,
            )

        gen_logger.info(
            "generation_deferred_pinned",
            generation_id=generation.id,
            account_id=account_id,
            retry_attempt=generation.retry_count,
            defer_seconds=logged_defer_seconds,
            base_defer_seconds=defer_seconds,
            reason=reason,
            target_queue=None,
            dispatch_mode="account_dispatcher",
        )

        return {
            "status": "waiting",
            "reason": reason,
            "generation_id": generation_id,
            "retry_attempt": generation.retry_count,
            "defer_seconds": logged_defer_seconds,
            "dispatch_mode": "account_dispatcher",
        }
    except Exception as requeue_err:
        gen_logger.error(
            "generation_requeue_failed",
            error=str(requeue_err),
            generation_id=generation.id,
        )
        return None


async def _count_pending_pinned_siblings(
    db: AsyncSession,
    preferred_account_id: int,
    exclude_generation_id: int,
) -> int:
    """Count other PENDING generations targeting the same preferred account."""
    from sqlalchemy import select, func
    from pixsim7.backend.main.domain.enums import GenerationStatus as GenStatus

    count = await db.scalar(
        select(func.count())
        .select_from(Generation)
        .where(
            Generation.preferred_account_id == preferred_account_id,
            Generation.status == GenStatus.PENDING,
            Generation.id != exclude_generation_id,
        )
    )
    return count or 0


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

    # Best-effort: clear the single-flight enqueue lease once the worker
    # starts consuming this generation so future intentional requeues can proceed.
    try:
        from pixsim7.backend.main.infrastructure.redis import get_arq_pool

        arq_pool = await get_arq_pool()
        await release_generation_enqueue_lease(arq_pool, generation_id)
    except Exception as lease_err:
        gen_logger.debug("enqueue_lease_release_failed", error=str(lease_err))

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
                try:
                    from pixsim7.backend.main.infrastructure.redis import get_arq_pool

                    arq_pool = await get_arq_pool()
                    await clear_generation_wait_metadata(arq_pool, generation_id)
                except Exception:
                    pass
                gen_logger.warning("generation_not_pending", status=generation.status)
                return {"status": "skipped", "reason": f"Generation status is {generation.status}"}

            # Check if scheduled for later
            if generation.scheduled_at and generation.scheduled_at > datetime.now(timezone.utc):
                gen_logger.info("generation_scheduled", scheduled_at=str(generation.scheduled_at))
                debug.worker("scheduled_in_future", scheduled_at=str(generation.scheduled_at))
                return {"status": "scheduled", "scheduled_for": str(generation.scheduled_at)}

            # The generation has been admitted for execution (not future-scheduled),
            # so clear any explicit wait marker used by the pinned dispatcher.
            try:
                from pixsim7.backend.main.infrastructure.redis import get_arq_pool

                arq_pool = await get_arq_pool()
                await clear_generation_wait_metadata(arq_pool, generation_id)
            except Exception as wait_clear_err:
                gen_logger.debug("wait_meta_clear_failed", error=str(wait_clear_err))

            # Select and reserve account atomically (prevents race conditions)
            # If generation already has an account_id (from previous attempt), try to reuse it
            MAX_ACCOUNT_RETRIES = 10
            account = None

            # Try preferred account first (user-selected).
            # When the user explicitly selects an account, honor that choice
            # without requiring credits — some operations are free (0-cost models),
            # and the provider API will reject with a clear error if credits are
            # actually needed but unavailable.
            if not account and getattr(generation, 'preferred_account_id', None) and not generation.account_id:
                try:
                    pref_account = await db.get(ProviderAccount, generation.preferred_account_id)
                    if pref_account and pref_account.provider_id == generation.provider_id:
                        # For user-selected preferred accounts, check hard blockers
                        # (disabled/cooldown/daily limit) and concurrency capacity.
                        skip_reason = pref_account.get_operational_skip_reason()
                        if skip_reason is None:
                            reserved = await account_service.reserve_account_if_available(pref_account.id)
                            if reserved:
                                account = reserved
                                gen_logger.info("preferred_account_used", account_id=account.id)
                                debug.worker("preferred_account_used", account_id=account.id)
                            else:
                                gen_logger.info("preferred_account_at_capacity", account_id=pref_account.id)
                        else:
                            gen_logger.info("preferred_account_unavailable", account_id=pref_account.id, reason=skip_reason)
                    elif pref_account:
                        gen_logger.info("preferred_account_provider_mismatch",
                                        account_id=pref_account.id,
                                        account_provider=pref_account.provider_id,
                                        generation_provider=generation.provider_id)
                except Exception as e:
                    gen_logger.warning("preferred_account_failed", account_id=generation.preferred_account_id, error=str(e))

            # Resolve model name for unlimited-model credit bypass
            gen_params = generation.canonical_params or generation.raw_params or {}
            gen_model = gen_params.get("model")

            # Try to reuse previous account on retry.
            # Skip credit checks — the generation already had a slot on this
            # account.  Check hard blockers (disabled/cooldown/daily limit)
            # and concurrency capacity before reserving.
            if generation.account_id:
                try:
                    prev_account = await db.get(ProviderAccount, generation.account_id)
                    if prev_account:
                        skip_reason = prev_account.get_operational_skip_reason()
                        if skip_reason is None:
                            reserved = await account_service.reserve_account_if_available(prev_account.id)
                            if reserved:
                                account = reserved
                                gen_logger.info("account_reused", account_id=account.id, provider_id=generation.provider_id)
                                debug.worker("account_reused", account_id=account.id, provider_id=generation.provider_id)
                            else:
                                gen_logger.info("account_reuse_at_capacity", account_id=prev_account.id)
                        else:
                            gen_logger.info("account_reuse_unavailable", account_id=prev_account.id, reason=skip_reason)
                except Exception as e:
                    gen_logger.warning("account_reuse_failed", prev_account_id=generation.account_id, error=str(e))

            # Pinned account guard: if user explicitly selected an account
            # and it couldn't be used, don't silently use a different account.
            # Cooldown → defer until it expires.  Permanent issue → fail.
            if not account and getattr(generation, 'preferred_account_id', None):
                pref_id = generation.preferred_account_id
                try:
                    _pref_acct = await db.get(ProviderAccount, pref_id)
                except Exception:
                    _pref_acct = None

                # Temporary cooldown — defer until it expires instead of failing
                if (
                    _pref_acct
                    and _pref_acct.cooldown_until
                    and _pref_acct.cooldown_until > datetime.now(timezone.utc)
                ):
                    remaining = (
                        _pref_acct.cooldown_until - datetime.now(timezone.utc)
                    ).total_seconds()
                    defer_seconds = max(
                        int(remaining) + PINNED_WAIT_PADDING_SECONDS,
                        MIN_PINNED_COOLDOWN_DEFER_SECONDS,
                    )
                    gen_logger.info(
                        "preferred_account_cooldown_defer",
                        account_id=pref_id,
                        generation_id=generation_id,
                        defer_seconds=defer_seconds,
                    )
                    defer_result = await _defer_pinned_generation(
                        db=db,
                        generation=generation,
                        generation_id=generation_id,
                        account_id=pref_id,
                        defer_seconds=defer_seconds,
                        reason="pinned_account_cooldown_wait",
                        gen_logger=gen_logger,
                        increment_retry=False,
                    )
                    if defer_result:
                        return defer_result
                    # Fall through to fail if defer itself fails

                # Account is operationally OK — defer until a slot frees up.
                # This covers both the explicit at-capacity case and the race
                # condition where capacity freed between the reservation attempt
                # and this check.
                if _pref_acct and _pref_acct.get_operational_skip_reason() is None:
                    base_cooldown = _get_concurrent_limit_cooldown_seconds(
                        generation, _pref_acct
                    )
                    defer_seconds = base_cooldown + PINNED_WAIT_PADDING_SECONDS
                    gen_logger.info(
                        "preferred_account_capacity_defer",
                        account_id=pref_id,
                        defer_seconds=defer_seconds,
                        base_cooldown_seconds=base_cooldown,
                        has_capacity=_pref_acct.has_capacity(),
                    )
                    defer_result = await _defer_pinned_generation(
                        db=db,
                        generation=generation,
                        generation_id=generation_id,
                        account_id=pref_id,
                        defer_seconds=defer_seconds,
                        reason="pinned_account_capacity_wait",
                        gen_logger=gen_logger,
                        increment_retry=False,
                    )
                    if defer_result:
                        return defer_result

                # Permanent unavailability (disabled, daily limit, etc.)
                gen_logger.warning(
                    "preferred_account_pinned_unavailable",
                    account_id=pref_id,
                    generation_id=generation_id,
                    skip_reason=_pref_acct.get_operational_skip_reason() if _pref_acct else "account_not_found",
                )
                debug.worker("preferred_account_pinned_unavailable", account_id=pref_id)
                await generation_service.mark_failed(
                    generation_id,
                    f"Selected account #{pref_id} is not available (disabled or at daily limit)",
                )
                get_health_tracker().increment_failed()
                return {
                    "status": "failed",
                    "reason": "preferred_account_unavailable",
                    "generation_id": generation_id,
                }

            # If no account yet (first attempt or reuse failed), select a new one
            if not account:
                async def acquire_account():
                    """Select and reserve next account. Raises if pool empty."""
                    try:
                        # Do not include exhausted accounts in the selection pool by default.
                        # Using `bool(gen_model)` here made almost every request include
                        # EXHAUSTED accounts, causing fallback loops over zero-credit accounts.
                        include_exhausted_candidates = False
                        acct = await account_service.select_and_reserve_account(
                            provider_id=generation.provider_id,
                            user_id=generation.user_id,
                            include_exhausted=include_exhausted_candidates,
                        )
                        return acct
                    except (NoAccountAvailableError, AccountCooldownError) as e:
                        gen_logger.warning("no_account_available", error=str(e), error_type=e.__class__.__name__)
                        debug.worker("no_account_available", error=str(e), error_type=e.__class__.__name__)
                        raise  # Propagate - no more accounts to try

                async def verify_credits(acct: ProviderAccount) -> bool:
                    """Check if account has sufficient credits (skip for unlimited models)."""
                    if is_unlimited_model(acct, gen_model):
                        return True
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
                except FallbackExhaustedError as exhausted_error:
                    last_account = exhausted_error.last_resource
                    last_account_id = getattr(last_account, "id", None)
                    fallback_account_id = (
                        int(last_account_id)
                        if isinstance(last_account_id, int)
                        else (generation.account_id if generation.account_id is not None else -1)
                    )
                    gen_logger.error(
                        "all_accounts_exhausted",
                        attempts=MAX_ACCOUNT_RETRIES,
                        last_account_id=last_account_id,
                    )
                    debug.worker(
                        "all_accounts_exhausted",
                        attempts=MAX_ACCOUNT_RETRIES,
                        last_account_id=last_account_id,
                    )
                    raise AccountExhaustedError(fallback_account_id, generation.provider_id)

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

            # Stagger concurrent dispatches to avoid thundering-herd on provider API
            concurrent = account.current_processing_jobs or 0
            if concurrent > 1:
                stagger = random.uniform(0, min(concurrent * DISPATCH_STAGGER_PER_SLOT_SECONDS, MAX_DISPATCH_STAGGER_SECONDS))
                if stagger > 0.1:
                    gen_logger.info("dispatch_stagger", stagger_seconds=round(stagger, 2), concurrent_jobs=concurrent)
                    await asyncio.sleep(stagger)

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
                account_released = False
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
                        # Note: account_service.mark_exhausted already logs account_marked_exhausted
                    except Exception as mark_err:
                        gen_logger.warning(
                            "account_mark_exhausted_failed",
                            account_id=account.id,
                            error=str(mark_err),
                        )

                    await _release_account_reservation(
                        account_service=account_service,
                        account_id=account.id,
                        gen_logger=gen_logger,
                    )
                    account_released = True
                    # Don't rotate away from a pinned account — let standard
                    # retry/failure handling inform the user.
                    if not _is_pinned_account(generation, account):
                        requeue_result = await _requeue_generation_for_account_rotation(
                            db=db,
                            generation=generation,
                            generation_id=generation_id,
                            failed_account_id=account.id,
                            reason="account_quota_exhausted",
                            log_event="generation_requeued_for_different_account",
                            account_log_field="exhausted_account_id",
                            gen_logger=gen_logger,
                        )
                        if requeue_result:
                            return requeue_result
                    # Fall through to mark as failed if requeue fails or pinned

                # Concurrent limit reached - put account in short cooldown and try different account
                elif isinstance(e, ProviderConcurrentLimitError):
                    concurrent_cooldown_seconds = _get_concurrent_limit_cooldown_seconds(
                        generation, account
                    )
                    await _apply_account_cooldown(
                        db=db,
                        account=account,
                        cooldown_seconds=concurrent_cooldown_seconds,
                        gen_logger=gen_logger,
                        event_name="account_cooldown_concurrent_limit",
                    )
                    await _release_account_reservation(
                        account_service=account_service,
                        account_id=account.id,
                        gen_logger=gen_logger,
                    )
                    account_released = True
                    if _is_pinned_account(generation, account):
                        # Pinned account at capacity — wait for a slot to free
                        # up instead of rotating to a different account.
                        current_retries = getattr(generation, 'retry_count', 0) or 0
                        if current_retries < MAX_PINNED_CONCURRENT_RETRIES:
                            base_defer = concurrent_cooldown_seconds + PINNED_WAIT_PADDING_SECONDS
                            defer_seconds = base_defer
                            reason = "pinned_account_concurrent_wait"

                            # Fairness: once past the yield threshold, check if
                            # other generations are queued for the same account.
                            # If so, back off with a longer delay so fresher
                            # generations get a turn at the available slots.
                            yield_threshold = int(
                                MAX_PINNED_CONCURRENT_RETRIES * PINNED_YIELD_THRESHOLD_RATIO
                            )
                            if current_retries >= yield_threshold:
                                siblings = await _count_pending_pinned_siblings(
                                    db, generation.preferred_account_id, generation.id,
                                )
                                if siblings > 0:
                                    defer_seconds = base_defer * PINNED_YIELD_DEFER_MULTIPLIER
                                    reason = "pinned_account_concurrent_yield"
                                    gen_logger.info(
                                        "pinned_concurrent_yielding",
                                        generation_id=generation.id,
                                        retry_count=current_retries,
                                        siblings_pending=siblings,
                                        defer_seconds=defer_seconds,
                                    )

                            defer_result = await _defer_pinned_generation(
                                db=db,
                                generation=generation,
                                generation_id=generation_id,
                                account_id=account.id,
                                defer_seconds=defer_seconds,
                                reason=reason,
                                gen_logger=gen_logger,
                            )
                            if defer_result:
                                return defer_result
                            # Fall through to standard failure if defer fails
                        else:
                            gen_logger.warning(
                                "pinned_concurrent_max_retries",
                                generation_id=generation.id,
                                retry_count=current_retries,
                            )
                            # Fall through to standard failure
                    else:
                        requeue_result = await _requeue_generation_for_account_rotation(
                            db=db,
                            generation=generation,
                            generation_id=generation_id,
                            failed_account_id=account.id,
                            reason="account_concurrent_limit",
                            log_event="generation_requeued_concurrent_limit",
                            account_log_field="previous_account_id",
                            gen_logger=gen_logger,
                        )
                        if requeue_result:
                            return requeue_result
                    # Fall through to standard failure if requeue fails

                # Session/auth failure on one account - cool it down and retry with another account.
                elif _is_auth_rotation_error(e):
                    error_code = _extract_error_code(e)
                    await _apply_account_cooldown(
                        db=db,
                        account=account,
                        cooldown_seconds=AUTH_FAILURE_COOLDOWN_SECONDS,
                        gen_logger=gen_logger,
                        event_name="account_cooldown_auth_failure",
                        error_code=error_code,
                    )
                    await _release_account_reservation(
                        account_service=account_service,
                        account_id=account.id,
                        gen_logger=gen_logger,
                    )
                    account_released = True
                    # Don't rotate away from a pinned account — the user
                    # needs to fix auth on their chosen account.
                    if not _is_pinned_account(generation, account):
                        requeue_result = await _requeue_generation_for_account_rotation(
                            db=db,
                            generation=generation,
                            generation_id=generation_id,
                            failed_account_id=account.id,
                            reason="account_auth_failure",
                            log_event="generation_requeued_auth_failure",
                            account_log_field="failed_account_id",
                            gen_logger=gen_logger,
                            clear_preferred_on_account_match=True,
                            error_code=error_code,
                        )
                        if requeue_result:
                            return requeue_result
                    # Fall through to mark as failed if requeue fails or pinned

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
                            account_released = True
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
                        account_released = True
                    except Exception as release_err:
                        gen_logger.warning("account_release_failed", error=str(release_err))

                    # Check retry count - don't retry forever
                    MAX_CONTENT_FILTER_RETRIES = MAX_SUBMIT_CONTENT_FILTER_RETRIES
                    current_retries = getattr(generation, 'retry_count', 0) or 0

                    if current_retries < MAX_CONTENT_FILTER_RETRIES:
                        try:
                            content_filter_error_code = _extract_error_code(e)
                            is_pinned = _is_pinned_account(generation, account)

                            if is_pinned:
                                if should_yield_pinned_content_filter_retry(current_retries):
                                    siblings = await _count_pending_pinned_siblings(
                                        db, generation.preferred_account_id, generation.id,
                                    )
                                    if siblings > 0:
                                        yield_allowed, yield_count = await try_acquire_content_filter_yield(
                                            generation.id,
                                        )
                                        if not yield_allowed:
                                            gen_logger.info(
                                                "pinned_content_filter_yield_cap_reached",
                                                generation_id=generation.id,
                                                retry_count=current_retries,
                                                yield_count=yield_count,
                                                max_yields=content_filter_max_yields(),
                                            )
                                        else:
                                            defer_seconds = content_filter_yield_defer_seconds()
                                            gen_logger.info(
                                                "pinned_content_filter_yielding",
                                                generation_id=generation.id,
                                                retry_count=current_retries,
                                                siblings_pending=siblings,
                                                defer_seconds=defer_seconds,
                                                yield_count=yield_count,
                                            )
                                            defer_result = await _defer_pinned_generation(
                                                db=db,
                                                generation=generation,
                                                generation_id=generation_id,
                                                account_id=account.id,
                                                defer_seconds=defer_seconds,
                                                reason="pinned_content_filter_yield",
                                                gen_logger=gen_logger,
                                                increment_retry=content_filter_yield_counts_as_retry(),
                                            )
                                            if defer_result:
                                                return defer_result
                                        # Fall through to immediate same-account retry if defer fails

                            # Non-pinned content filter retries can rotate after a small
                            # number of same-account failures to avoid hammering one account.
                            if (
                                not is_pinned
                                and should_rotate_content_filter_account(current_retries)
                            ):
                                await reset_content_filter_yield_counter(generation.id)
                                requeue_result = await _requeue_generation_for_account_rotation(
                                    db=db,
                                    generation=generation,
                                    generation_id=generation_id,
                                    failed_account_id=account.id,
                                    reason="content_filtered_account_rotation",
                                    log_event="generation_requeued_content_filter_rotation",
                                    account_log_field="filtered_account_id",
                                    gen_logger=gen_logger,
                                    error_code=content_filter_error_code,
                                    increment_retry=True,
                                )
                                if requeue_result:
                                    return requeue_result
                                # Fall through to immediate retry if rotation requeue fails

                            from pixsim7.backend.main.infrastructure.redis import get_arq_pool
                            from pixsim7.backend.main.domain.enums import GenerationStatus as GenStatus

                            await reset_content_filter_yield_counter(generation.id)
                            # Increment retry count and reset to pending on the same account
                            generation.retry_count = (generation.retry_count or 0) + 1
                            generation.status = GenStatus.PENDING
                            generation.started_at = None
                            generation.completed_at = None
                            await db.commit()
                            await db.refresh(generation)

                            arq_pool = await get_arq_pool()
                            enqueue_result = await enqueue_generation_retry_job(
                                arq_pool, generation.id,
                            )

                            gen_logger.info(
                                "generation_requeued_content_filter_retry",
                                generation_id=generation.id,
                                retry_attempt=generation.retry_count,
                                max_retries=MAX_CONTENT_FILTER_RETRIES,
                                enqueue_deduped=bool(enqueue_result.get("deduped")),
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
                        # Prevent the event-driven auto-retry handler from
                        # applying its larger retry budget after this worker-
                        # managed content-filter retry budget is exhausted.
                        if _extract_error_code(e) == "content_filtered":
                            setattr(e, "error_code", "content_output_rejected")
                        gen_logger.warning(
                            "content_filter_max_retries_exceeded",
                            generation_id=generation.id,
                            retry_count=current_retries,
                        )
                        # Fall through to mark as failed

                # Release account reservation on failure
                if not account_released:
                    await _release_account_reservation(
                        account_service=account_service,
                        account_id=account.id,
                        gen_logger=gen_logger,
                    )

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

        except (NoAccountAvailableError, AccountCooldownError) as e:
            gen_logger.warning(
                "generation_waiting_for_account_capacity",
                error=str(e),
                error_type=e.__class__.__name__,
                defer_seconds=NO_ACCOUNT_AVAILABLE_DEFER_SECONDS,
                target_queue=GENERATION_RETRY_QUEUE_NAME,
            )
            worker_debug.worker(
                "generation_waiting_for_account_capacity",
                error=str(e),
                error_type=e.__class__.__name__,
                generation_id=generation_id,
                defer_seconds=NO_ACCOUNT_AVAILABLE_DEFER_SECONDS,
            )

            # If we loaded the generation and it is still pending, explicitly
            # defer to the retry queue so fresh jobs stay on the primary queue.
            try:
                if (
                    'generation' in locals()
                    and generation
                    and str(getattr(generation, "status", "")).lower() in {"pending", "generationstatus.pending"}
                ):
                    from pixsim7.backend.main.infrastructure.redis import get_arq_pool

                    arq_pool = await get_arq_pool()
                    enqueue_result = await enqueue_generation_retry_job(
                        arq_pool,
                        generation_id,
                        defer_seconds=NO_ACCOUNT_AVAILABLE_DEFER_SECONDS,
                    )
                    actual_defer_seconds = enqueue_result.get("actual_defer_seconds")
                    logged_defer_seconds = (
                        actual_defer_seconds or NO_ACCOUNT_AVAILABLE_DEFER_SECONDS
                    )
                    gen_logger.info(
                        "generation_waiting_for_account_capacity_deferred",
                        generation_id=generation_id,
                        error_type=e.__class__.__name__,
                        defer_seconds=logged_defer_seconds,
                        base_defer_seconds=NO_ACCOUNT_AVAILABLE_DEFER_SECONDS,
                        target_queue=GENERATION_RETRY_QUEUE_NAME,
                        enqueue_deduped=bool(enqueue_result.get("deduped")),
                    )
                    return {
                        "status": "requeued",
                        "reason": "account_unavailable_deferred",
                        "generation_id": generation_id,
                        "defer_seconds": logged_defer_seconds,
                        "target_queue": GENERATION_RETRY_QUEUE_NAME,
                    }
            except Exception as requeue_err:
                gen_logger.error(
                    "account_unavailable_requeue_failed",
                    generation_id=generation_id,
                    error=str(requeue_err),
                )

            # Fall back to existing ARQ retry behavior if explicit defer fails.
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
