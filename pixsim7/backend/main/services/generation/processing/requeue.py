"""
Requeue and defer helpers for generation processing.

Account rotation requeue, pinned generation deferral, and sibling counting.
Host-agnostic logic relocated out of ``workers/`` into
``services/generation/processing`` per the ``worker-thin-host-canon`` plan.
(``_count_runnable_pinned_siblings`` still lives in ``workers/worker_concurrency``
pending its own relocation assessment.)
"""
from datetime import datetime, timezone, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain import Generation
from pixsim7.backend.main.infrastructure.queue import (
    enqueue_generation_retry_job,
    release_generation_enqueue_lease,
    set_generation_wait_metadata,
    GENERATION_RETRY_QUEUE_NAME,
)
from pixsim7.backend.main.workers.worker_concurrency import (
    _count_runnable_pinned_siblings,
)


async def _publish_job_retrying(
    generation: Generation,
    *,
    reason: str,
    gen_logger,
) -> None:
    """Emit JOB_RETRYING so the frontend refetches retry/attempt counts.

    Non-terminal requeues (content-filter retry, account rotation) bump
    ``retry_count`` but keep status pending/processing, so the optimistic
    WebSocket path never refreshes the counters. This event tells the client
    to do an authoritative refetch. Best-effort: a publish failure must not
    break the requeue.
    """
    try:
        from pixsim7.backend.main.infrastructure.events.bus import event_bus
        from pixsim7.backend.main.services.generation.events import JOB_RETRYING

        await event_bus.publish(JOB_RETRYING, {
            "job_id": generation.id,
            "generation_id": generation.id,
            "user_id": generation.user_id,
            "status": generation.status.value if hasattr(generation.status, "value") else str(generation.status),
            "retry_attempt": generation.retry_count or 0,
            "reason": reason,
        })
    except Exception:
        gen_logger.debug(
            "job_retrying_event_publish_failed",
            generation_id=generation.id,
            reason=reason,
            exc_info=True,
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
    defer_seconds: int | None = None,
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
        enqueue_result = await enqueue_generation_retry_job(
            arq_pool,
            generation.id,
            defer_seconds=defer_seconds,
        )

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
        if defer_seconds is not None and enqueue_result.get("actual_defer_seconds") is not None:
            payload["defer_seconds"] = int(enqueue_result["actual_defer_seconds"])
        gen_logger.info(log_event, **payload)

        if increment_retry:
            await _publish_job_retrying(generation, reason=reason, gen_logger=gen_logger)

        result = {
            "status": "requeued",
            "reason": reason,
            "generation_id": generation_id,
        }
        if increment_retry:
            result["retry_attempt"] = generation.retry_count
        if defer_seconds is not None and enqueue_result.get("actual_defer_seconds") is not None:
            result["defer_seconds"] = int(enqueue_result["actual_defer_seconds"])
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
    """Backward-compatible wrapper: count runnable pending siblings."""
    counts = await _count_runnable_pinned_siblings(
        db=db,
        preferred_account_id=preferred_account_id,
        exclude_generation_id=exclude_generation_id,
        current_generation_created_at=None,
    )
    return int(counts.get("total_runnable", 0))
