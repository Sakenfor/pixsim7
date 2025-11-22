"""
Auto-retry event handler manifest

Automatically retries failed generations when appropriate:
- Content filter rejections (romantic/erotic content)
- Temporary provider errors
- Rate limits and timeouts

Max retry attempts configurable via settings (default: 10).
Can be disabled via AUTO_RETRY_ENABLED=false in .env
"""
from pixsim7.backend.main.infrastructure.events.bus import Event
from pixsim7.backend.main.shared.config import settings
from pixsim_logging import configure_logging

logger = configure_logging("events.auto_retry")


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

            # Get user for authorization
            user = await user_service.get_user(generation.user_id)

            # Retry the generation (use max_retries from settings)
            logger.info(
                "auto_retry_triggered",
                generation_id=generation_id,
                retry_count=generation.retry_count,
                max_retries=settings.auto_retry_max_attempts,
                error=generation.error_message[:100] if generation.error_message else None
            )

            new_generation = await generation_service.retry_generation(
                generation_id=generation_id,
                user=user,
                max_retries=settings.auto_retry_max_attempts
            )

            logger.info(
                "auto_retry_created",
                original_generation_id=generation_id,
                new_generation_id=new_generation.id,
                retry_attempt=new_generation.retry_count,
                max_attempts=settings.auto_retry_max_attempts
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
