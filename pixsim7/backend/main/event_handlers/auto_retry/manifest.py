"""
Auto-retry event handler manifest

Automatically retries failed generations when appropriate:
- Content filter rejections (romantic/erotic content)
- Temporary provider errors
- Rate limits and timeouts

Behavior (v2):
- Reuses the same Generation record (no new generation rows)
- Increments retry_count on the generation
- Resets status back to PENDING and re-enqueues the job

Max retry attempts configurable via settings (default: 20, overridable via AUTO_RETRY_MAX_ATTEMPTS).
Can be disabled via AUTO_RETRY_ENABLED=false in .env
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from pixsim7.backend.main.infrastructure.events.bus import Event
from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.shared.logging import get_event_logger
from pixsim7.backend.main.shared.policies.content_filter_retry import (
    should_rotate_content_filter_account,
    should_yield_pinned_content_filter_retry,
    content_filter_yield_defer_seconds,
    content_filter_yield_counts_as_retry,
    content_filter_max_yields,
    try_acquire_content_filter_yield,
    reset_content_filter_yield_counter,
)
from pixsim7.backend.main.domain import Generation
from pixsim7.backend.main.domain.enums import GenerationStatus, GenerationErrorCode
from pixsim7.backend.main.infrastructure.redis import get_arq_pool
from pixsim7.backend.main.infrastructure.queue import (
    enqueue_generation_retry_job,
    GENERATION_RETRY_QUEUE_NAME,
)

logger = get_event_logger("auto_retry")


def _is_pinned_generation(generation: Generation) -> bool:
    return getattr(generation, "preferred_account_id", None) is not None


def _is_poll_time_content_filtered(generation: Generation) -> bool:
    return generation.error_code == GenerationErrorCode.CONTENT_FILTERED.value


async def _count_pending_pinned_siblings(db, preferred_account_id: int, exclude_generation_id: int) -> int:
    count = await db.scalar(
        select(func.count())
        .select_from(Generation)
        .where(
            Generation.preferred_account_id == preferred_account_id,
            Generation.status == GenerationStatus.PENDING,
            Generation.id != exclude_generation_id,
        )
    )
    return count or 0


# Manifest
class HandlerManifest:
    """Auto-retry handler configuration"""
    # Check if enabled via settings
    enabled = settings.auto_retry_enabled
    subscribe_to = "job:failed"  # Only listen to failed generation events
    name = "Auto-Retry Failed Generations"
    description = "Automatically retries generations that fail due to content filters or temporary errors"
    version = "1.0.0"


manifest = HandlerManifest()


async def handle_event(event: Event) -> None:
    """
    Handle generation failure events and auto-retry if appropriate

    Args:
        event: JOB_FAILED event
    """
    if event.event_type != "job:failed":
        return

    generation_id = event.data.get("generation_id") or event.data.get("job_id")
    if not generation_id:
        return

    try:
        # Import here to avoid circular dependencies
        from pixsim7.backend.main.infrastructure.database.session import get_async_session
        from pixsim7.backend.main.services.generation import GenerationService
        from pixsim7.backend.main.services.user import UserService
        from pixsim7.backend.main.domain import User

        async with get_async_session() as db:
            # Initialize services
            user_service = UserService(db)
            generation_service = GenerationService(db, user_service)

            # Get the failed generation
            generation = await generation_service.get_generation(generation_id)

            # Check if should auto-retry
            if not await generation_service.should_auto_retry(generation):
                logger.debug(
                    "auto_retry_skipped",
                    generation_id=generation_id,
                    status=generation.status,
                    retry_count=generation.retry_count,
                    error=generation.error_message[:100] if generation.error_message else None
                )
                return

            # Respect global max attempts (including the original failure)
            if generation.retry_count >= settings.auto_retry_max_attempts:
                logger.info(
                    "auto_retry_max_attempts_reached",
                    generation_id=generation_id,
                    retry_count=generation.retry_count,
                    max_attempts=settings.auto_retry_max_attempts,
                )
                return

            defer_seconds: int | None = None
            rotate_account_from: int | None = None
            fairness_yield = False
            if _is_poll_time_content_filtered(generation):
                is_pinned = _is_pinned_generation(generation)
                current_retries = generation.retry_count or 0

                if (
                    is_pinned
                    and generation.preferred_account_id is not None
                    and should_yield_pinned_content_filter_retry(current_retries)
                ):
                    siblings = await _count_pending_pinned_siblings(
                        db, generation.preferred_account_id, generation.id,
                    )
                    if siblings > 0:
                        yield_allowed, yield_count = await try_acquire_content_filter_yield(
                            generation.id,
                        )
                        if not yield_allowed:
                            logger.info(
                                "auto_retry_pinned_content_filter_yield_cap_reached",
                                generation_id=generation.id,
                                retry_count=current_retries,
                                yield_count=yield_count,
                                max_yields=content_filter_max_yields(),
                            )
                        else:
                            fairness_yield = True
                            defer_seconds = content_filter_yield_defer_seconds()
                            logger.info(
                                "auto_retry_pinned_content_filter_yield",
                                generation_id=generation.id,
                                retry_count=current_retries,
                                siblings_pending=siblings,
                                defer_seconds=defer_seconds,
                                yield_count=yield_count,
                            )

                if (
                    not is_pinned
                    and generation.account_id is not None
                    and should_rotate_content_filter_account(current_retries)
                ):
                    await reset_content_filter_yield_counter(generation.id)
                    rotate_account_from = generation.account_id
                    generation.account_id = None
                    logger.info(
                        "auto_retry_content_filter_account_rotation",
                        generation_id=generation.id,
                        filtered_account_id=rotate_account_from,
                        retry_count=current_retries,
                    )

            # Increment retry_count and reset lifecycle fields in one operation
            # (avoids double-commit from separate increment_retry call)
            retry_incremented = True
            if fairness_yield and not content_filter_yield_counts_as_retry():
                retry_incremented = False
            else:
                if _is_poll_time_content_filtered(generation) and not fairness_yield:
                    await reset_content_filter_yield_counter(generation.id)
                generation.retry_count += 1
            generation.status = GenerationStatus.PENDING
            generation.started_at = None
            generation.completed_at = None
            generation.updated_at = datetime.now(timezone.utc)
            # Keep error_message for history; caller can inspect last failure reason

            await db.commit()
            await db.refresh(generation)

            # Re-enqueue the same generation for processing
            arq_pool = await get_arq_pool()
            enqueue_result = await enqueue_generation_retry_job(
                arq_pool,
                generation.id,
                defer_seconds=defer_seconds,
            )
            actual_defer_seconds = enqueue_result.get("actual_defer_seconds")
            logged_defer_seconds = actual_defer_seconds if actual_defer_seconds is not None else defer_seconds

            logger.info(
                "auto_retry_requeued",
                generation_id=generation.id,
                retry_attempt=generation.retry_count,
                max_attempts=settings.auto_retry_max_attempts,
                target_queue=GENERATION_RETRY_QUEUE_NAME,
                defer_seconds=logged_defer_seconds,
                base_defer_seconds=defer_seconds,
                rotated_account=rotate_account_from is not None,
                retry_incremented=retry_incremented,
                enqueue_deduped=bool(enqueue_result.get("deduped")),
            )

    except Exception as e:
        # Don't fail the entire event processing if retry fails
        # Just log the error
        logger.error(
            "auto_retry_failed",
            generation_id=generation_id,
            error=str(e),
            error_type=e.__class__.__name__,
            exc_info=True
        )


def on_register() -> None:
    """Called when handler is registered"""
    logger.info(
        "auto_retry_handler_registered",
        enabled=settings.auto_retry_enabled,
        max_attempts=settings.auto_retry_max_attempts,
        msg="Auto-retry handler registered"
    )
