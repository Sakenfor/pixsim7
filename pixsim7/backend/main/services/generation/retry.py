"""
GenerationRetryService - Generation retry logic

Handles retry logic for failed generations.
"""
from typing import TYPE_CHECKING
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim_logging import get_logger

from pixsim7.backend.main.domain import (
    Generation,
    GenerationStatus,
    User,
)
from pixsim7.backend.main.shared.errors import (
    ResourceNotFoundError,
    InvalidOperationError,
)

if TYPE_CHECKING:
    from .creation import GenerationCreationService

logger = get_logger()


class GenerationRetryService:
    """
    Generation retry service

    Handles:
    - Retry count increment
    - Retry generation creation
    - Auto-retry eligibility checking
    """

    def __init__(self, db: AsyncSession, creation_service: "GenerationCreationService"):
        self.db = db
        self.creation = creation_service

    async def increment_retry(self, generation_id: int) -> Generation:
        """
        Increment retry count

        Args:
            generation_id: Generation ID

        Returns:
            Updated generation
        """
        generation = await self._get_generation(generation_id)
        generation.retry_count += 1
        generation.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(generation)
        return generation

    async def retry_generation(
        self,
        generation_id: int,
        user: User,
        max_retries: int | None = None
    ) -> Generation:
        """
        Retry a failed generation

        Creates a new generation with the same parameters as the failed one.
        Useful for generations that failed due to content filtering or temporary provider issues.

        Args:
            generation_id: Failed generation ID to retry
            user: User requesting retry
            max_retries: Maximum retry attempts allowed. If None, uses
                settings.auto_retry_max_attempts (default: 10, configurable).

        Returns:
            New generation created for retry

        Raises:
            ResourceNotFoundError: Generation not found
            InvalidOperationError: Cannot retry (wrong user, not failed, or max retries exceeded)
        """
        # Resolve max_retries from settings if not provided
        if max_retries is None:
            from pixsim7.backend.main.shared.config import settings
            max_retries = settings.auto_retry_max_attempts

        # Get original generation
        original = await self._get_generation(generation_id)

        # Check authorization
        if original.user_id != user.id and not user.is_admin():
            raise InvalidOperationError("Cannot retry other users' generations")

        # Check if can be retried
        if original.status not in {GenerationStatus.FAILED, GenerationStatus.CANCELLED}:
            raise InvalidOperationError(f"Can only retry failed or cancelled generations, not {original.status.value}")

        # Check retry count
        if original.retry_count >= max_retries:
            raise InvalidOperationError(f"Maximum retry attempts ({max_retries}) exceeded")

        # Create new generation with same params
        logger.info(f"Retrying generation {generation_id} (attempt {original.retry_count + 1}/{max_retries})")

        new_generation = await self.creation.create_generation(
            user=user,
            operation_type=original.operation_type,
            provider_id=original.provider_id,
            params=original.raw_params,  # Use original raw params
            workspace_id=original.workspace_id,
            name=f"Retry: {original.name}" if original.name else None,
            description=original.description,
            priority=original.priority,
            parent_generation_id=generation_id,  # Link to original
            prompt_version_id=original.prompt_version_id,
        )

        # Copy retry count from parent and increment
        new_generation.retry_count = original.retry_count + 1
        await self.db.commit()
        await self.db.refresh(new_generation)

        logger.info(f"Created retry generation {new_generation.id} for {generation_id}")

        return new_generation

    async def should_auto_retry(self, generation: Generation) -> bool:
        """
        Determine if a failed generation should be automatically retried

        Auto-retry is triggered for:
        - Content filtering rejections (romantic/erotic content that might pass on retry)
        - Provider temporary errors
        - Not for: validation errors, quota errors, permanent failures

        Args:
            generation: Failed generation to check

        Returns:
            True if should auto-retry
        """
        if generation.status != GenerationStatus.FAILED:
            return False

        if not generation.error_message:
            return False

        # Check retry count against configured max
        from pixsim7.backend.main.shared.config import settings
        max_retries = settings.auto_retry_max_attempts

        if generation.retry_count >= max_retries:
            return False

        error_msg = generation.error_message.lower()

        # Non-retryable patterns (prompt/input rejections - same input = same rejection)
        non_retryable_patterns = [
            "content filtered (prompt)",  # Pixverse prompt rejection
            "content filtered (text)",    # Text input rejection
            "prompt was rejected",
            "text input was rejected",
        ]

        for pattern in non_retryable_patterns:
            if pattern in error_msg:
                logger.info(
                    f"Generation {generation.id} will NOT auto-retry: "
                    f"non-retryable pattern '{pattern}' detected"
                )
                return False

        # Content filtering indicators (retryable - output varies)
        content_filter_keywords = [
            "content filter",
            "content policy",
            "inappropriate content",
            "safety filter",
            "moderation",
            "nsfw",
            "adult content",
            "explicit content",
            # Phrases used when marking provider-filtered jobs (from status_poller)
            "terminal status: filtered",
            "terminal status: failed",
            "provider reported terminal status",
            # Pixverse-specific error codes (mapped in pixverse adapter)
            "safety or policy reasons",
            "content moderation failed",
            "content filtered (output)",  # Output rejection - retryable
            "content filtered (image)",   # Image output rejection - retryable
        ]

        # Temporary error indicators
        temporary_error_keywords = [
            "timeout",
            "rate limit",
            "temporarily unavailable",
            "try again",
            "service unavailable",
            "server error",
        ]

        # Check for content filter or temporary errors
        for keyword in content_filter_keywords + temporary_error_keywords:
            if keyword in error_msg:
                logger.info(f"Generation {generation.id} should auto-retry: '{keyword}' detected in error")
                return True

        # Log why we're not retrying for debugging
        logger.debug(
            f"Generation {generation.id} will NOT auto-retry: no matching keywords found. "
            f"Error: {error_msg[:200]}"
        )
        return False

    # ===== PRIVATE HELPERS =====

    async def _get_generation(self, generation_id: int) -> Generation:
        """Get generation by ID or raise ResourceNotFoundError"""
        generation = await self.db.get(Generation, generation_id)
        if not generation:
            raise ResourceNotFoundError(f"Generation {generation_id} not found")
        return generation
