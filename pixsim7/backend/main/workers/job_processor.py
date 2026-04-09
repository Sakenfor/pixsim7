"""
Generation processor worker - executes pending generations

Processes generations created via GenerationService:
1. Select provider account
2. Submit generation to provider
3. Update generation status

Helper modules:
- job_processor_errors: Error classification (EXPECTED_ERRORS, retryability checks)
- job_processor_account: Credit verification, account reservation/release/cooldown
- job_processor_requeue: Requeue-for-rotation and pinned-generation deferral
"""
import asyncio
import random
from datetime import datetime, timezone, timedelta
from typing import Any
from sqlalchemy import func as sa_func, select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession
from pixsim7.backend.main.domain import Generation
from pixsim7.backend.main.domain.enums import GenerationStatus as GenStatus
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
)
from pixsim7.backend.main.shared.errors import (
    NoAccountAvailableError,
    AccountCooldownError,
    AccountExhaustedError,
    InvalidOperationError,
    ProviderError,
    ProviderAuthenticationError,
    ProviderQuotaExceededError,
    ProviderContentFilteredError,
    ProviderConcurrentLimitError,
)
from pixsim7.backend.main.shared.policies import (
    with_fallback,
    FallbackExhaustedError,
)
from pixsim7.backend.main.workers.worker_concurrency import (
    _settings_int,
    _settings_float,
    _settings_bool,
    _pinned_wait_padding_seconds,
    _get_operation_value,
    _get_concurrent_limit_cooldown_seconds,
    CONCURRENT_COOLDOWN_SECONDS,
    MAX_PINNED_CONCURRENT_RETRIES,
    PINNED_YIELD_THRESHOLD_RATIO,
    PINNED_YIELD_DEFER_MULTIPLIER,
    _adaptive_provider_concurrency_pre_submit_gate,
    _adaptive_provider_concurrency_record_limit_error,
    _adaptive_provider_concurrency_record_submit_success,
    _get_pinned_concurrent_wait_count,
    _clear_pinned_concurrent_wait_count,
    _plan_pinned_concurrent_defer,
    _normalize_positive_int,
)
from pixsim7.backend.main.shared.policies.content_filter_retry import (
    max_submit_content_filter_retries,
    should_rotate_content_filter_account,
    should_yield_pinned_content_filter_retry,
    content_filter_yield_defer_seconds,
    content_filter_yield_counts_as_retry,
    content_filter_max_yields,
    try_acquire_content_filter_yield,
)

# --- Re-exported from helper modules (used by status_poller and other callers) ---
from pixsim7.backend.main.workers.job_processor_errors import (  # noqa: F401
    EXPECTED_ERRORS,
    NON_RETRYABLE_ERROR_PATTERNS,
    _is_non_retryable_error,
    _extract_error_code,
    _is_auth_rotation_error,
    _get_max_tries,
    _is_final_try,
)
from pixsim7.backend.main.workers.job_processor_account import (  # noqa: F401
    refresh_account_credits,
    has_sufficient_credits,
    _required_generation_credit_hint,
    is_unlimited_model,
    _is_pinned_account,
    _release_account_reservation,
    _apply_account_cooldown,
)
from pixsim7.backend.main.workers.job_processor_requeue import (  # noqa: F401
    _requeue_generation_for_account_rotation,
    _defer_pinned_generation,
    _count_pending_pinned_siblings,
)

# Cooldown applied when an account fails authentication/session checks.
AUTH_FAILURE_COOLDOWN_SECONDS = 300

NO_ACCOUNT_AVAILABLE_DEFER_SECONDS = 10


def _dispatch_stagger_per_slot_seconds() -> float:
    return _settings_float("dispatch_stagger_per_slot_seconds", 0.3, minimum=0.0)


def _max_dispatch_stagger_seconds() -> float:
    return _settings_float("dispatch_stagger_max_seconds", 3.0, minimum=0.0)


def _min_pinned_cooldown_defer_seconds() -> int:
    return _settings_int("min_pinned_cooldown_defer_seconds", 2, minimum=1)


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
from pixsim7.backend.main.services.account_event_service import AccountEventService

_base_logger = None
_worker_debug_initialized = False


def _get_worker_logger():
    """Get or initialize worker logger."""
    global _base_logger
    if _base_logger is None:
        _base_logger = configure_logging("worker").bind(channel="pipeline", domain="generation")
    return _base_logger


def _init_worker_debug_flags() -> None:
    """Initialize global worker debug flags from environment."""
    global _worker_debug_initialized
    if _worker_debug_initialized:
        return
    load_global_debug_from_env()
    _worker_debug_initialized = True


logger = _get_worker_logger()


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
                await _clear_pinned_concurrent_wait_count(generation_id, gen_logger=gen_logger)
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
            adaptive_submit_gate: dict[str, Any] | None = None

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
            required_credit_hint = _required_generation_credit_hint(generation, gen_params)

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
                                AccountEventService.record("selected", account.id, provider_id=generation.provider_id, generation_id=generation_id, extra={"reason": "reused"})
                            else:
                                gen_logger.info("account_reuse_at_capacity", account_id=prev_account.id)
                        else:
                            gen_logger.info("account_reuse_unavailable", account_id=prev_account.id, reason=skip_reason)
                except Exception as e:
                    gen_logger.warning("account_reuse_failed", prev_account_id=generation.account_id, error=str(e))

            # Pinned account guard: if user explicitly selected an account
            # and it couldn't be used, don't silently use a different account.
            # Cooldown → defer until it expires.  Permanent issue → fail.
            # Skip this guard entirely if the preferred account is for a
            # different provider — fall through to normal account selection.
            _skip_pinned_guard = False
            if not account and getattr(generation, 'preferred_account_id', None):
                pref_id = generation.preferred_account_id
                try:
                    _pref_acct = await db.get(ProviderAccount, pref_id)
                except Exception:
                    _pref_acct = None

                # Provider mismatch — preferred account belongs to a different
                # provider than this generation targets.  Skip the entire
                # pinned guard so we fall through to normal account selection
                # instead of deferring forever on the wrong provider's capacity.
                if _pref_acct and _pref_acct.provider_id != generation.provider_id:
                    gen_logger.warning(
                        "preferred_account_provider_mismatch_skip_pin",
                        account_id=pref_id,
                        account_provider=_pref_acct.provider_id,
                        generation_provider=generation.provider_id,
                    )
                    _skip_pinned_guard = True

                if not _skip_pinned_guard:
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
                            int(remaining) + _pinned_wait_padding_seconds(),
                            _min_pinned_cooldown_defer_seconds(),
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
                        defer_seconds = base_cooldown + _pinned_wait_padding_seconds()
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
                # For non-pinned generations, exclude accounts where
                # pending pinned work would fill all remaining capacity.
                # Only PENDING pinned gens need reservation — PROCESSING
                # ones already consume current_processing_jobs slots.
                _pinned_exclude_ids: list[int] = []
                if not getattr(generation, 'preferred_account_id', None):
                    try:
                        # Count PENDING pinned demand per account
                        _pinned_demand_q = (
                            sa_select(
                                Generation.preferred_account_id,
                                sa_func.count(Generation.id).label("pinned_pending"),
                            )
                            .where(
                                Generation.preferred_account_id.isnot(None),
                                Generation.provider_id == generation.provider_id,
                                Generation.status == GenStatus.PENDING,
                                Generation.id != generation.id,
                            )
                            .group_by(Generation.preferred_account_id)
                        )
                        _pinned_demand_result = await db.execute(_pinned_demand_q)
                        _pinned_demand: dict[int, int] = {
                            int(acct_id): int(cnt)
                            for acct_id, cnt in _pinned_demand_result.all()
                            if acct_id is not None
                        }

                        if _pinned_demand:
                            # Check each account's free capacity
                            _cap_q = sa_select(
                                ProviderAccount.id,
                                ProviderAccount.max_concurrent_jobs,
                                ProviderAccount.current_processing_jobs,
                            ).where(
                                ProviderAccount.id.in_(list(_pinned_demand.keys()))
                            )
                            _cap_result = await db.execute(_cap_q)
                            for _acct_id, _max_jobs, _cur_jobs in _cap_result.all():
                                _free = max(0, (_max_jobs or 0) - (_cur_jobs or 0))
                                _pending = _pinned_demand.get(int(_acct_id), 0)
                                if _pending >= _free:
                                    _pinned_exclude_ids.append(int(_acct_id))

                        if _pinned_exclude_ids:
                            gen_logger.info(
                                "excluding_pinned_accounts",
                                excluded_ids=_pinned_exclude_ids,
                                pinned_demand=_pinned_demand,
                            )
                    except Exception as _pin_err:
                        gen_logger.warning("pinned_account_query_failed", error=str(_pin_err))

                # Track accounts rejected during credit verification so that
                # acquire_account never re-selects the same account within this
                # fallback loop (prevents wasting attempts on accounts that have
                # *some* credits but not enough for this operation).
                _rejected_account_ids: list[int] = []

                async def acquire_account():
                    """Select and reserve next account. Raises if pool empty."""
                    # Combine pinned exclusions with accounts already rejected
                    # in this fallback loop.
                    exclude_ids = list(_pinned_exclude_ids)
                    exclude_ids.extend(_rejected_account_ids)
                    try:
                        # Do not include exhausted accounts in the selection pool by default.
                        # Using `bool(gen_model)` here made almost every request include
                        # EXHAUSTED accounts, causing fallback loops over zero-credit accounts.
                        include_exhausted_candidates = False
                        acct = await account_service.select_and_reserve_account(
                            provider_id=generation.provider_id,
                            user_id=generation.user_id,
                            include_exhausted=include_exhausted_candidates,
                            min_credits=required_credit_hint,
                            exclude_account_ids=exclude_ids or None,
                            operation_type=_get_operation_value(generation),
                            model=gen_model,
                        )
                        return acct
                    except (NoAccountAvailableError, AccountCooldownError) as e:
                        # Never fall back to pinned accounts — stealing a pinned
                        # slot blocks both the pinned queue and the non-pinned job
                        # (which gets stuck behind pinned work).  Better to defer.
                        gen_logger.warning("no_account_available", error=str(e), error_type=e.__class__.__name__)
                        debug.worker("no_account_available", error=str(e), error_type=e.__class__.__name__)
                        raise  # Propagate - no more accounts to try

                _last_refreshed_credits: dict = {}

                async def verify_credits(acct: ProviderAccount) -> bool:
                    """Check if account has sufficient credits (skip for unlimited models)."""
                    nonlocal _last_refreshed_credits
                    _last_refreshed_credits = {}
                    provider_metadata = getattr(acct, "provider_metadata", None) or {}
                    if isinstance(provider_metadata, dict) and provider_metadata.get("accountless"):
                        return True
                    if is_unlimited_model(acct, gen_model):
                        return True
                    if required_credit_hint == 0:
                        return True
                    credits_data = await refresh_account_credits(acct, account_service, gen_logger)
                    _last_refreshed_credits = credits_data or {}
                    if not credits_data:
                        # Credit fetch failed or returned empty — reject so we
                        # try another account rather than submitting blind.
                        gen_logger.warning(
                            "credits_fetch_empty",
                            account_id=acct.id,
                            msg="credit check returned no data, rejecting account",
                        )
                        return False
                    min_credits = required_credit_hint if required_credit_hint and required_credit_hint > 0 else 1
                    return has_sufficient_credits(credits_data, min_credits=min_credits)

                async def reject_account(acct: ProviderAccount) -> None:
                    """Release account and exclude from further attempts in this loop."""
                    gen_logger.warning("account_no_credits", account_id=acct.id)
                    debug.worker("account_no_credits", account_id=acct.id)
                    _rejected_account_ids.append(acct.id)
                    await account_service.release_account(acct.id)
                    # Only mark exhausted if the account has zero credits across
                    # all types.  If it has *some* credits (just not enough for
                    # this job), leave it ACTIVE so cheaper operations can use it.
                    if not any(v > 0 for v in _last_refreshed_credits.values()):
                        await account_service.mark_exhausted(acct.id)

                try:
                    account = await with_fallback(
                        acquire=acquire_account,
                        verify=verify_credits,
                        on_reject=reject_account,
                        on_attempt=lambda n, a: (
                            gen_logger.info("account_selected", account_id=a.id, provider_id=generation.provider_id, attempt=n),
                            debug.worker("account_selected", account_id=a.id, provider_id=generation.provider_id, attempt=n),
                            AccountEventService.record("selected", a.id, provider_id=generation.provider_id, generation_id=generation_id, attempt=n),
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
                    gen_logger.warning(
                        "all_accounts_exhausted",
                        attempts=MAX_ACCOUNT_RETRIES,
                        last_account_id=last_account_id,
                        rejected_account_ids=_rejected_account_ids,
                    )
                    debug.worker(
                        "all_accounts_exhausted",
                        attempts=MAX_ACCOUNT_RETRIES,
                        last_account_id=last_account_id,
                    )
                    AccountEventService.record(
                        "all_exhausted",
                        fallback_account_id,
                        provider_id=generation.provider_id,
                        generation_id=generation_id,
                        attempt=MAX_ACCOUNT_RETRIES,
                    )
                    raise AccountExhaustedError(fallback_account_id, generation.provider_id)

            # Save account_id on generation so UI can show which account is being used
            if generation.account_id != account.id:
                generation.account_id = account.id
                db.add(generation)
                await db.commit()
                await db.refresh(generation)

            # Adaptive provider concurrency guard for pinned accounts: learn
            # a lower effective cap when the provider starts rejecting submits
            # below the configured account cap, and only probe above that cap
            # periodically to see if the provider limit increased again.
            if _is_pinned_account(generation, account):
                adaptive_submit_gate = await _adaptive_provider_concurrency_pre_submit_gate(
                    generation=generation,
                    account=account,
                    model=gen_model,
                    gen_logger=gen_logger,
                )
                if adaptive_submit_gate.get("action") == "defer":
                    concurrent_plan = await _plan_pinned_concurrent_defer(
                        db=db,
                        generation=generation,
                        account=account,
                        concurrent_cooldown_seconds=_get_concurrent_limit_cooldown_seconds(generation, account),
                        current_retry_count=getattr(generation, "retry_count", 0) or 0,
                        gen_logger=gen_logger,
                        adaptive_recommended_defer_seconds=int(adaptive_submit_gate.get("defer_seconds") or 1),
                    )
                    if concurrent_plan.get("action") == "stop":
                        # Generation giving up — allow wake so the freed slot
                        # can be used by another pinned generation.
                        await _release_account_reservation(
                            account_service=account_service,
                            account_id=account.id,
                            gen_logger=gen_logger,
                        )
                        await _clear_pinned_concurrent_wait_count(generation.id, gen_logger=gen_logger)
                        await generation_service.mark_failed(
                            generation_id,
                            (
                                f"Pinned account #{account.id} exceeded max concurrent wait defers "
                                f"({concurrent_plan.get('max_waits')}) while provider concurrency was limited"
                            ),
                        )
                        gen_logger.warning(
                            "pinned_concurrent_max_waits_exceeded",
                            generation_id=generation.id,
                            account_id=account.id,
                            concurrent_wait_count=concurrent_plan.get("wait_count"),
                            max_waits=concurrent_plan.get("max_waits"),
                            phase="pre_submit_gate",
                        )
                        get_health_tracker().increment_failed()
                        return {
                            "status": "failed",
                            "reason": "pinned_concurrent_max_waits",
                            "generation_id": generation_id,
                        }
                    # Defer path — suppress wake because other pinned
                    # generations would hit the same adaptive cap and
                    # cascade through wasted reserve+release cycles.
                    await _release_account_reservation(
                        account_service=account_service,
                        account_id=account.id,
                        gen_logger=gen_logger,
                        skip_wake=True,
                    )
                    gen_logger.info(
                        "adaptive_concurrency_defer_before_submit",
                        generation_id=generation.id,
                        account_id=account.id,
                        provider_id=account.provider_id,
                        operation_type=_get_operation_value(generation),
                        model=gen_model,
                        local_concurrency=adaptive_submit_gate.get("local_concurrency"),
                        effective_cap=adaptive_submit_gate.get("effective_cap"),
                        configured_cap=adaptive_submit_gate.get("configured_cap"),
                        defer_seconds=concurrent_plan.get("defer_seconds"),
                        seconds_until_probe=adaptive_submit_gate.get("seconds_until_probe"),
                        concurrent_wait_count=concurrent_plan.get("concurrent_wait_count"),
                    )
                    defer_result = await _defer_pinned_generation(
                        db=db,
                        generation=generation,
                        generation_id=generation_id,
                        account_id=account.id,
                        defer_seconds=int(concurrent_plan.get("defer_seconds") or 1),
                        reason=str(concurrent_plan.get("reason") or "pinned_account_adaptive_concurrent_wait"),
                        gen_logger=gen_logger,
                        increment_retry=bool(concurrent_plan.get("increment_retry")),
                    )
                    if defer_result:
                        return defer_result
                    # Defer failed but account already released — cannot
                    # continue to submit without a reservation.
                    gen_logger.warning(
                        "adaptive_defer_failed_after_release",
                        generation_id=generation.id,
                        account_id=account.id,
                    )
                    get_health_tracker().increment_failed()
                    return {
                        "status": "failed",
                        "reason": "adaptive_defer_failed",
                        "generation_id": generation_id,
                    }
                elif adaptive_submit_gate.get("action") == "allow_probe":
                    gen_logger.info(
                        "adaptive_concurrency_probe_allowed",
                        generation_id=generation.id,
                        account_id=account.id,
                        provider_id=account.provider_id,
                        operation_type=_get_operation_value(generation),
                        model=gen_model,
                        local_concurrency=adaptive_submit_gate.get("local_concurrency"),
                        effective_cap=adaptive_submit_gate.get("effective_cap"),
                        configured_cap=adaptive_submit_gate.get("configured_cap"),
                        next_probe_delay_seconds=adaptive_submit_gate.get("next_probe_delay_seconds"),
                    )

            # Mark generation as started (atomically guarded by SELECT FOR UPDATE)
            try:
                generation = await generation_service.mark_started(generation_id)
            except InvalidOperationError:
                # Another worker already transitioned this generation to
                # PROCESSING — abort to avoid double-submission.
                gen_logger.warning(
                    "generation_already_processing",
                    generation_id=generation_id,
                    msg="aborting duplicate pickup",
                )
                if account and not account_released:
                    await _release_account_reservation(
                        account_service=account_service,
                        account_id=account.id,
                        gen_logger=gen_logger,
                    )
                return {
                    "status": "skipped",
                    "reason": "already_processing",
                    "generation_id": generation_id,
                }
            gen_logger.info("generation_started")
            debug.worker("generation_started", generation_id=generation_id)

            # Stagger concurrent dispatches to avoid thundering-herd on provider API
            concurrent = getattr(account, "current_processing_jobs", 0) or 0
            if concurrent > 1:
                stagger = random.uniform(
                    0,
                    min(
                        concurrent * _dispatch_stagger_per_slot_seconds(),
                        _max_dispatch_stagger_seconds(),
                    ),
                )
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
                await _clear_pinned_concurrent_wait_count(generation.id, gen_logger=gen_logger)

                await _adaptive_provider_concurrency_record_submit_success(
                    generation=generation,
                    account=account,
                    model=gen_model,
                    local_concurrency=getattr(account, "current_processing_jobs", None),
                    attempted_level_hint=(
                        int(adaptive_submit_gate.get("attempted_level"))
                        if adaptive_submit_gate and adaptive_submit_gate.get("attempted_level")
                        else None
                    ),
                    gen_logger=gen_logger,
                )

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
                # Exception: unlimited/free models don't consume credits — the
                # provider API may reject zero-credit accounts even for free ops.
                # In that case skip exhaustion marking; the error is a false
                # positive and rotating accounts won't help.
                if isinstance(e, ProviderQuotaExceededError):
                    if is_unlimited_model(account, gen_model) or required_credit_hint == 0:
                        gen_logger.warning(
                            "quota_error_ignored_free_model",
                            account_id=account.id,
                            model=gen_model,
                            required_credit_hint=required_credit_hint,
                            msg="Provider returned quota error for free/unlimited model — not marking account exhausted",
                        )
                        # Fall through to generic error handling below
                    else:
                        # Refresh credits from provider before marking
                        # exhausted — the quota error may be stale if a
                        # refund landed between verify_credits and submit.
                        try:
                            refreshed = await refresh_account_credits(account, account_service, gen_logger)
                            await db.commit()
                            if any(v > 0 for v in (refreshed or {}).values()):
                                gen_logger.info(
                                    "quota_error_but_credits_available",
                                    account_id=account.id,
                                    credits=refreshed,
                                    msg="provider returned quota error but account has credits after refresh — skipping mark_exhausted",
                                )
                            else:
                                await account_service.mark_exhausted(account.id)
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
                        # Quota exhaustion is a hard account-level failure for this
                        # attempt; rotate even for pinned generations by clearing the
                        # preferred account if it matches the exhausted account.
                        requeue_result = await _requeue_generation_for_account_rotation(
                            db=db,
                            generation=generation,
                            generation_id=generation_id,
                            failed_account_id=account.id,
                            reason="account_quota_exhausted",
                            log_event="generation_requeued_for_different_account",
                            account_log_field="exhausted_account_id",
                            gen_logger=gen_logger,
                            clear_preferred_on_account_match=True,
                        )
                        if requeue_result:
                            return requeue_result
                        # Fall through to mark as failed if requeue fails

                # Concurrent limit reached - put account in short cooldown and try different account
                elif isinstance(e, ProviderConcurrentLimitError):
                    adaptive_concurrency = await _adaptive_provider_concurrency_record_limit_error(
                        generation=generation,
                        account=account,
                        model=gen_model,
                        local_concurrency=getattr(account, "current_processing_jobs", None),
                        attempted_level_hint=(
                            int(adaptive_submit_gate.get("attempted_level"))
                            if adaptive_submit_gate and adaptive_submit_gate.get("attempted_level")
                            else None
                        ),
                        gen_logger=gen_logger,
                    )
                    if adaptive_concurrency:
                        gen_logger.info(
                            "adaptive_concurrency_cap_updated",
                            generation_id=generation.id,
                            account_id=account.id,
                            provider_id=account.provider_id,
                            operation_type=_get_operation_value(generation),
                            model=gen_model,
                            attempted_level=adaptive_concurrency.get("attempted_level"),
                            observed_local_concurrency=adaptive_concurrency.get("observed_local_concurrency"),
                            observed_cap=adaptive_concurrency.get("observed_cap"),
                            is_probe_level_reject=adaptive_concurrency.get("is_probe_level_reject"),
                            previous_effective_cap=adaptive_concurrency.get("previous_effective_cap"),
                            effective_cap=adaptive_concurrency.get("effective_cap"),
                            configured_cap=adaptive_concurrency.get("configured_cap"),
                            consecutive_limit_rejects=adaptive_concurrency.get("consecutive_limit_rejects"),
                            consecutive_in_cap_limit_rejects=adaptive_concurrency.get(
                                "consecutive_in_cap_limit_rejects"
                            ),
                            lower_after_consecutive_rejects=adaptive_concurrency.get(
                                "lower_after_consecutive_rejects"
                            ),
                            cap_lowered=adaptive_concurrency.get("cap_lowered"),
                            next_probe_delay_seconds=adaptive_concurrency.get("next_probe_delay_seconds"),
                        )
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
                    if _is_pinned_account(generation, account):
                        # Pinned account at capacity — wait for a slot to free
                        # up instead of rotating to a different account.
                        current_retries = getattr(generation, 'retry_count', 0) or 0
                        concurrent_plan = await _plan_pinned_concurrent_defer(
                            db=db,
                            generation=generation,
                            account=account,
                            concurrent_cooldown_seconds=concurrent_cooldown_seconds,
                            current_retry_count=current_retries,
                            gen_logger=gen_logger,
                            adaptive_recommended_defer_seconds=(
                                int(adaptive_concurrency.get("recommended_defer_seconds"))
                                if adaptive_concurrency and adaptive_concurrency.get("adaptive_active")
                                else None
                            ),
                        )
                        if concurrent_plan.get("action") == "defer":
                            # Suppress wake — other pinned generations would
                            # hit the same provider limit and cascade through
                            # wasted reserve+release cycles.
                            await _release_account_reservation(
                                account_service=account_service,
                                account_id=account.id,
                                gen_logger=gen_logger,
                                skip_wake=True,
                            )
                            account_released = True
                            defer_result = await _defer_pinned_generation(
                                db=db,
                                generation=generation,
                                generation_id=generation_id,
                                account_id=account.id,
                                defer_seconds=int(concurrent_plan.get("defer_seconds") or 1),
                                reason=str(concurrent_plan.get("reason") or "pinned_account_concurrent_wait"),
                                gen_logger=gen_logger,
                                increment_retry=bool(concurrent_plan.get("increment_retry")),
                            )
                            if defer_result:
                                return defer_result
                            # Fall through to standard failure if defer fails
                        else:
                            # Generation giving up — allow wake so the freed
                            # slot can be used by another pinned generation.
                            await _release_account_reservation(
                                account_service=account_service,
                                account_id=account.id,
                                gen_logger=gen_logger,
                            )
                            account_released = True
                            await _clear_pinned_concurrent_wait_count(generation.id, gen_logger=gen_logger)
                            gen_logger.warning(
                                "pinned_concurrent_max_waits",
                                generation_id=generation.id,
                                retry_count=current_retries,
                                concurrent_wait_count=concurrent_plan.get("wait_count"),
                                max_waits=concurrent_plan.get("max_waits"),
                            )
                            await generation_service.mark_failed(
                                generation_id,
                                (
                                    f"Pinned account #{account.id} exceeded max concurrent wait defers "
                                    f"({concurrent_plan.get('max_waits')}) while provider concurrency was limited"
                                ),
                            )
                            failed_marked = True
                            get_health_tracker().increment_failed()
                            return {
                                "status": "failed",
                                "reason": "pinned_concurrent_max_waits",
                                "generation_id": generation_id,
                            }
                    else:
                        await _release_account_reservation(
                            account_service=account_service,
                            account_id=account.id,
                            gen_logger=gen_logger,
                        )
                        account_released = True
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
                    AccountEventService.record(
                        "auth_failure",
                        account.id,
                        provider_id=account.provider_id,
                        generation_id=generation_id,
                        error_code=error_code,
                        cooldown_seconds=AUTH_FAILURE_COOLDOWN_SECONDS,
                    )
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
                    if _is_pinned_account(generation, account):
                        # Pinned account auth failure: clear the pin and rotate so
                        # generation can continue on another valid account.
                        gen_logger.warning(
                            "pinned_account_auth_failed_requeue",
                            account_id=account.id,
                            error=str(e),
                            msg="pinned account authentication failed, clearing pin and requeueing",
                        )

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
                            account_released = True
                        except Exception as release_err:
                            gen_logger.warning("account_release_failed", error=str(release_err))
                        # Refresh credits so DB reflects any provider refund
                        try:
                            await refresh_account_credits(account, account_service, gen_logger)
                            await db.commit()
                        except Exception as refresh_err:
                            gen_logger.warning("content_filter_credit_refresh_failed", error=str(refresh_err))
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

                    # Refresh credits so the DB reflects any provider refund.
                    # Without this, stale low-credit rows block the SQL
                    # min_credits pre-filter and no account can be selected
                    # until something else triggers a refresh.
                    try:
                        await refresh_account_credits(account, account_service, gen_logger)
                        await db.commit()
                    except Exception as refresh_err:
                        gen_logger.warning("content_filter_credit_refresh_failed", error=str(refresh_err))

                    # Check retry count for content filter budget (not attempt_id —
                    # attempt_id includes non-error transitions like concurrent waits).
                    MAX_CONTENT_FILTER_RETRIES = max_submit_content_filter_retries()
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

        except (NoAccountAvailableError, AccountCooldownError, AccountExhaustedError) as e:
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
            # ProviderErrors are already logged by the inner except ProviderError handler
            # Truly unexpected errors get full stack trace for debugging
            if isinstance(e, EXPECTED_ERRORS):
                gen_logger.warning(
                    "generation_processing_failed",
                    error=str(e),
                    error_type=e.__class__.__name__,
                )
            elif isinstance(e, ProviderError):
                gen_logger.error(
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
