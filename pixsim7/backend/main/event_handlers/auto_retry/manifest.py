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
from datetime import datetime

from pixsim7.backend.main.infrastructure.events.bus import Event
from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.shared.logging import get_event_logger
from pixsim7.backend.main.domain.enums import GenerationStatus
from pixsim7.backend.main.infrastructure.redis import get_arq_pool

logger = get_event_logger("auto_retry")


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

            # Increment retry_count on the same generation
            generation = await generation_service.increment_retry(generation_id)

            # Reset lifecycle fields for a fresh attempt
            generation.status = GenerationStatus.PENDING
            generation.started_at = None
            generation.completed_at = None
            generation.updated_at = datetime.utcnow()
            # Keep error_message for history; caller can inspect last failure reason

            await db.commit()
            await db.refresh(generation)

            # Re-enqueue the same generation for processing
            arq_pool = await get_arq_pool()
            await arq_pool.enqueue_job(
                "process_generation",
                generation_id=generation.id,
            )

            logger.info(
                "auto_retry_requeued",
                generation_id=generation.id,
                retry_attempt=generation.retry_count,
                max_attempts=settings.auto_retry_max_attempts,
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
